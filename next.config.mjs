import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * "a.com, b.com:3000" → ["a.com", "b.com:3000"]
 * Boş/tanımsızsa undefined döner (Next varsayılan davranışını korur).
 */
function parseOrigins(raw) {
  if (!raw || !raw.trim()) return undefined
  const list = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    // Şema varsa temizle — Next sadece host[:port] bekliyor
    .map((v) => v.replace(/^https?:\/\//i, "").replace(/\/+$/, ""))
  return list.length ? list : undefined
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker imajını küçültmek için: sadece gerekli dosyalar kopyalanır (~150MB)
  output: "standalone",

  // ★★★ ÖNEMLİ — DOCKER İÇİN ZORUNLU ★★★
  // Next, standalone çıktısını üretirken "workspace kökü"nü otomatik tespit
  // etmeye çalışır. Üst dizinlerde başka bir lockfile varsa kökü YUKARI
  // kaydırır ve çıktı `.next/standalone/<proje-adı>/server.js` şeklinde
  // İÇ İÇE bir klasörde oluşur. Bu durumda Dockerfile'daki
  // `CMD ["node", "server.js"]` "Cannot find module server.js" hatası verir.
  // Kökü açıkça bu klasöre sabitleyerek çıktıyı DÜZ tutuyoruz:
  // `.next/standalone/server.js`
  outputFileTracingRoot: __dirname,

  // Panel next/image kullanmıyor (PopupPreview düz <img> ile çalışıyor).
  // Optimizasyonu kapatmak, sharp'ın görüntü işleme yolunu tamamen devre
  // dışı bırakır — saldırı yüzeyi küçülür.
  images: { unoptimized: true },

  // ═══════════════════════════════════════════════════════════════════
  // SERVER ACTIONS — CSRF / ORIGIN DOĞRULAMASI
  //
  // SORUN: Next, her Server Action isteğinde `x-forwarded-host` başlığını
  // `origin` başlığıyla karşılaştırır. Eşleşmezse isteği reddeder
  // ("Invalid Server Actions request"). Bu KASITLI bir CSRF korumasıdır.
  //
  // Ne zaman patlar:
  //   • LAN IP üzerinden erişince (http://192.168.1.3:3000) — bazı
  //     tarayıcılar `origin: null` gönderir, eşleşme sağlanamaz
  //   • Önünde ters vekil varken (Caddy/nginx) — dıştaki alan adı ile
  //     içteki host farklıdır
  //
  // ÇÖZÜM: Güvenilir origin'leri açıkça beyaz listeye al. Değerler ENV'den
  // okunuyor ki aynı imajı farklı ortamlarda (LAN, staging, prod)
  // yeniden derlemeden kullanabilelim.
  //
  // ★ GÜVENLİK: Buraya SADECE kendi kontrolündeki adresleri yaz.
  //   "*" veya bilmediğin bir alan adı eklemek CSRF korumasını devre dışı
  //   bırakır — yani başka bir sitedeki kötü niyetli bir form, senin
  //   oturumunla panelde işlem yapabilir hale gelir.
  // ═══════════════════════════════════════════════════════════════════
  experimental: {
    serverActions: {
      allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
      // ★ Varsayılan 1 MB. Küçük görseller (avatar, logo) hâlâ Server
      //   Action üzerinden geçiyor; büyük dosyalar (galeri, video)
      //   imzalı URL ile DOĞRUDAN Storage'a gidiyor, buradan geçmiyor.
      bodySizeLimit: "12mb",
    },
  },

  // Geliştirme sunucusunun (npm run dev) LAN IP üzerinden gelen varlık
  // isteklerini kabul etmesi için. Sadece dev'de etkili, prod'da yok sayılır.
  allowedDevOrigins: parseOrigins(process.env.ALLOWED_DEV_ORIGINS),
  reactStrictMode: true,
  poweredByHeader: false,

  // Güvenlik başlıkları
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // ★★★ DİKKAT — "no-referrer" KULLANMA ★★★
          // Fetch spesifikasyonu, referrer policy "no-referrer" olduğunda
          // GET/HEAD dışındaki isteklerde `Origin` başlığının `null` olarak
          // gönderilmesini söylüyor. Server Actions POST kullandığı için
          // tarayıcı `Origin: null` gönderir, Next'in CSRF kontrolü de
          // "x-forwarded-host ... does not match origin ... null" diyerek
          // TÜM FORM GÖNDERİMLERİNİ reddeder.
          //
          // "same-origin" gizlilik açısından neredeyse aynı korumayı verir
          // (dış sitelere referrer sızmaz) ama kendi origin'imize yapılan
          // isteklerde Origin başlığı doğru gönderilir.
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              /* ★ NOT: `http:` burada duruyor ama panel HTTPS üzerinden
                 sunuluyorsa İŞE YARAMAZ. Tarayıcı https bir sayfada http
                 görseli "karışık içerik" sayıp engelliyor; bu CSP'den
                 bağımsız, kapatılamayan bir kural.

                 Yani kayıtlı görsel adresleri MUTLAKA https olmalı.
                 `http:` sadece paneli yerelde http üzerinden çalıştıran
                 geliştirme kurulumları için duruyor. */
              "img-src 'self' data: blob: https: http:",
              "media-src 'self' data: blob: https: http:",
              // ★ Yalnızca *.supabase.co değil — kendi alan adın da olmalı.
              //   İmzalı yükleme URL'i buraya PUT atıyor; engellenirse
              //   yükleme sessizce sunucu vekiline düşüyordu (yavaş).
              "connect-src 'self' https: http:",
              "font-src 'self' data:",
              // ★ Mail gövdesi sandbox iframe'de (srcdoc) çiziliyor.
              //   frame-src tanımlı değilse default-src'a düşüyor ve
              //   bazı tarayıcılarda engelleniyor.
              "frame-src 'self' blob: data:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ]
  },
}
export default nextConfig
