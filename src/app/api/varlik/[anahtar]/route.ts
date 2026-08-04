// src/app/api/varlik/[anahtar]/route.ts
//
// ═══════════════════════════════════════════════════════════════════════
// GÖRSEL VEKİLİ
//
// ┌─ SORUN ───────────────────────────────────────────────────────────┐
// │ `reklam` bucket'ındaki görseller panelde açılmıyor, `galeri` ve    │
// │ `media` açılıyor. Hiçbir RLS ya da CSP kuralı bucket ADINA göre    │
// │ davranmaz — ama reklam engelleyici eklentiler davranır.            │
// │                                                                    │
// │   https://db.site.com/storage/v1/object/public/reklam/image/x.png  │
// │                                              ^^^^^^                │
// │                                                                    │
// │ uBlock / AdBlock gibi eklentiler "reklam", "ads", "banner" geçen   │
// │ adresleri engelliyor. Adres çubuğuna yazınca engellemiyor          │
// │ (üst düzey gezinme), sayfa içinde <img> olarak isteyince           │
// │ engelliyor. Gözlemlenen davranış tam olarak bu.                    │
// └───────────────────────────────────────────────────────────────────┘
//
// ┌─ ÇÖZÜM ───────────────────────────────────────────────────────────┐
// │ Görsel panelin KENDİ alan adından servis ediliyor:                 │
// │                                                                    │
// │   https://kays.business/api/varlik/<kodlanmis-yol>                 │
// │                                                                    │
// │ Adreste "reklam" geçmiyor → hiçbir eklenti engellemiyor.           │
// │ Aynı köken → CORP başlığı da sorun çıkarmıyor.                     │
// │ Sunucu Supabase'e kendisi gidiyor → iç ağ adresi de sorun değil.   │
// │                                                                    │
// │ Üç ayrı sorunu birden kapatıyor.                                   │
// └───────────────────────────────────────────────────────────────────┘
//
// ★ GÜVENLİK: yol base64url ile kodlanıyor ama bu gizlilik için DEĞİL —
//   sadece adreste tetikleyici kelime bulunmasın diye. Asıl koruma
//   bucket beyaz listesi: sadece bilinen üç bucket okunabiliyor,
//   başka bir yola yönlendirilemiyor.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse } from "next/server"

export const runtime = "nodejs"
/** Görseller değişmiyor; kenar önbelleği serbest */
export const dynamic = "force-static"
export const revalidate = 31536000

/** ★ Sadece bu bucket'lar okunabilir — açık yönlendirme (SSRF) engeli */
const IZINLI_BUCKETLAR = new Set(["reklam", "galeri", "media"])

/** Yanıt boyutu tavanı — bellek koruması */
const MAX_BAYT = 25 * 1024 * 1024

function kok(): string {
  const u =
    process.env.SUPABASE_PUBLIC_URL ||
    process.env.SUPABASE_URL ||
    ""
  return u.trim().replace(/\/+$/, "")
}

/** base64url → düz metin */
function coz(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/")
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4))
    return Buffer.from(b64 + pad, "base64").toString("utf8")
  } catch {
    return null
  }
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ anahtar: string }> }
) {
  const { anahtar } = await ctx.params

  const yol = coz(anahtar)
  if (!yol) {
    return new NextResponse("Geçersiz adres", { status: 400 })
  }

  // Beklenen biçim: <bucket>/<yol/parcalari>
  const egik = yol.indexOf("/")
  if (egik <= 0) {
    return new NextResponse("Geçersiz adres", { status: 400 })
  }

  const bucket = yol.slice(0, egik)
  const dosyaYolu = yol.slice(egik + 1)

  // ★ Beyaz liste — SSRF ve dizin dışına çıkma engeli
  if (!IZINLI_BUCKETLAR.has(bucket)) {
    return new NextResponse("İzin verilmeyen kaynak", { status: 403 })
  }
  if (!dosyaYolu || dosyaYolu.includes("..")) {
    return new NextResponse("Geçersiz adres", { status: 400 })
  }

  const temel = kok()
  if (!temel) {
    return new NextResponse("Depolama adresi tanımlı değil", { status: 500 })
  }

  const hedef =
    `${temel}/storage/v1/object/public/${bucket}/` +
    dosyaYolu.split("/").map(encodeURIComponent).join("/")

  let res: Response
  try {
    res = await fetch(hedef, { cache: "no-store" })
  } catch {
    return new NextResponse("Kaynağa ulaşılamadı", { status: 502 })
  }

  if (!res.ok) {
    return new NextResponse("Bulunamadı", { status: res.status })
  }

  const ct = res.headers.get("content-type") ?? "application/octet-stream"

  // ★ Sadece görsel geçiyor — HTML dönerse yansıtmıyoruz (XSS riski)
  if (!ct.startsWith("image/")) {
    return new NextResponse("Geçersiz içerik türü", { status: 415 })
  }

  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_BAYT) {
    return new NextResponse("Dosya çok büyük", { status: 413 })
  }

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type": ct,
      "Content-Length": String(buf.byteLength),
      // Dosya adları benzersiz — sonsuza kadar önbelleklenebilir
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Kendi kökenimizden servis ediyoruz; gömülmesi serbest
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  })
}
