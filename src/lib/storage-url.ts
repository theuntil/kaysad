// src/lib/storage-url.ts
//
// ═══════════════════════════════════════════════════════════════════════
// GENEL ERİŞİM ADRESİ ÜRETİMİ
//
// ┌─ SORUN ───────────────────────────────────────────────────────────┐
// │ `supabase.storage.getPublicUrl()` adresi `SUPABASE_URL`'den       │
// │ üretiyor. Kendi sunucusunda barındırılan kurulumlarda bu değişken │
// │ genelde İÇ AĞ adresi oluyor:                                       │
// │                                                                    │
// │   SUPABASE_URL=http://kong:8000        ← Docker ağı içinden         │
// │   SUPABASE_URL=http://10.0.0.5:8000    ← özel ağ                    │
// │                                                                    │
// │ Panel sunucusu bu adrese erişiyor (yükleme çalışıyor) ama          │
// │ TARAYICI erişemiyor → görsel yüklenmiyor, kutu boş kalıyor.        │
// │                                                                    │
// │ Aynı sorun mobil uygulamada da çıkıyor: kayıt edilen URL iç ağ     │
// │ adresi olduğu için telefonda görsel açılmıyor.                     │
// └───────────────────────────────────────────────────────────────────┘
//
// ┌─ ÇÖZÜM ───────────────────────────────────────────────────────────┐
// │ `SUPABASE_PUBLIC_URL` tanımlanırsa genel adresler ONDAN üretiliyor.│
// │ Tanımlı değilse `SUPABASE_URL` kullanılıyor (tek sunucu            │
// │ kurulumlarında ikisi zaten aynı).                                  │
// │                                                                    │
// │   SUPABASE_URL=http://kong:8000                 ← sunucu içi        │
// │   SUPABASE_PUBLIC_URL=https://supabase.site.com ← tarayıcı/telefon  │
// └───────────────────────────────────────────────────────────────────┘
//
// ★ Bu dosya "server-only" DEĞİL: sadece adres birleştiriyor, gizli
//   anahtar okumuyor.
// ═══════════════════════════════════════════════════════════════════════

/** Sondaki eğik çizgiyi temizler */
function temizle(u: string): string {
  return u.trim().replace(/\/+$/, "")
}

/**
 * Depolama için genel erişim kökü.
 * Öncelik: SUPABASE_PUBLIC_URL → NEXT_PUBLIC_SUPABASE_URL → SUPABASE_URL
 */
export function genelKok(): string {
  const aday =
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  return temizle(aday)
}

/**
 * Bir bucket + yol için genel erişim adresi.
 *
 * ★ `getPublicUrl()` yerine bunu kullan — iç ağ adresi sızmıyor.
 *
 * ★ Yol parçaları ayrı ayrı kodlanıyor: dosya adında boşluk ya da
 *   Türkçe karakter olsa bile adres bozulmuyor. Eğik çizgiler
 *   korunuyor (klasör yapısı kaybolmasın).
 */
export function genelAdres(bucket: string, path: string): string {
  const kok = genelKok()
  if (!kok) return ""

  const yol = path
    .split("/")
    .filter(Boolean)
    .map((p) => encodeURIComponent(p))
    .join("/")

  return `${kok}/storage/v1/object/public/${encodeURIComponent(bucket)}/${yol}`
}

/**
 * Kayıtlı bir adresi güncel genel köke taşır.
 *
 * ★★★ ÇOK MUHAFAZAKÂR — sebebi acı bir ders ★★★
 *
 *   İlk sürüm "kök farklıysa yeniden yaz" diyordu. Bu, veritabanındaki
 *   DOĞRU adresleri alıp BOZUK iç adrese çeviriyordu:
 *
 *     kayıtlı:  https://db.siteniz.com/storage/v1/...   ← çalışıyordu
 *     sonuç:    http://kong:8000/storage/v1/...         ← bozuldu
 *
 *   Çünkü `SUPABASE_PUBLIC_URL` tanımlı değilse `genelKok()` iç adrese
 *   düşüyor. Yani "düzeltme" işlevi tam tersini yapıyordu.
 *
 * ★ ARTIK sadece şu ÜÇ koşulun HEPSİ sağlanınca yeniden yazıyor:
 *
 *     1. `SUPABASE_PUBLIC_URL` AÇIKÇA tanımlanmış
 *        (varsayılana düşmüş değil — niyet belli olmalı)
 *
 *     2. Adresin kökü tam olarak `SUPABASE_URL`'e eşit
 *        (yani gerçekten bilinen iç adres)
 *
 *     3. İkisi birbirinden farklı
 *
 *   Tereddüt varsa adrese DOKUNMUYOR. Çalışan bir adresi bozmak,
 *   bozuk bir adresi düzeltmemekten çok daha kötü.
 */
export function adresiDuzelt(url: string | null | undefined): string | null {
  if (!url) return null
  const u = url.trim()
  if (!u) return null

  // 1) Açık niyet şart — varsayılana düşen değer sayılmıyor
  const acikGenel = (process.env.SUPABASE_PUBLIC_URL ?? "").trim()
  if (!acikGenel) return u

  const yeni = temizle(acikGenel)
  const ic = temizle((process.env.SUPABASE_URL ?? "").trim())

  // 3) İkisi aynıysa yapacak bir şey yok
  if (!ic || ic === yeni) return u

  // 2) Sadece BİLİNEN iç kökle başlıyorsa değiştir
  if (!u.startsWith(ic)) return u

  return yeni + u.slice(ic.length)
}

/* ═══════════════════════════════════════════════════════════════
   PANEL İÇİ GÖSTERİM ADRESİ
═══════════════════════════════════════════════════════════════ */

/** base64url kodlaması — adreste tetikleyici kelime kalmasın */
function kodla(s: string): string {
  const b64 = typeof Buffer !== "undefined"
    ? Buffer.from(s, "utf8").toString("base64")
    : btoa(unescape(encodeURIComponent(s)))
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

/**
 * Bir depolama adresini PANEL ÜZERİNDEN geçen adrese çevirir.
 *
 * ★ NEDEN GEREKLİ:
 *   Adreste `/reklam/` geçtiği için reklam engelleyici eklentiler
 *   görseli engelliyordu. `galeri` ve `media` bucket'larının
 *   sorunsuz çalışması, `reklam`ın çalışmaması tam olarak buna
 *   işaret ediyor — hiçbir RLS ya da CSP kuralı bucket ADINA göre
 *   davranmaz.
 *
 *   Çıkan adres:
 *     https://kays.business/api/varlik/cmVrbGFtL2ltYWdlL3gucG5n
 *
 *   · Adreste "reklam" geçmiyor  → eklenti engellemiyor
 *   · Aynı köken                 → CORP başlığı sorun çıkarmıyor
 *   · Sunucu kendisi getiriyor   → iç ağ adresi de sorun değil
 *
 * ★ Sadece PANEL gösterimi için. Veritabanına kaydedilen adres
 *   değişmiyor — mobil uygulama doğrudan Supabase'den okumaya
 *   devam ediyor.
 *
 * ★ Tanınmayan adres olduğu gibi dönüyor (dış bağlantılar bozulmasın).
 */
export function panelGorsel(url: string | null | undefined): string | null {
  if (!url) return null
  const u = url.trim()
  if (!u) return null

  const i = u.indexOf("/storage/v1/object/public/")
  if (i < 0) return u

  const yol = u.slice(i + "/storage/v1/object/public/".length)
  // Sorgu dizesini at (?t=123 gibi önbellek kırıcılar)
  const temizYol = yol.split("?")[0].split("#")[0]
  if (!temizYol.includes("/")) return u

  return `/api/varlik/${kodla(decodeURIComponent(temizYol))}`
}
