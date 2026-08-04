// src/app/api/upload/route.ts
//
// ═══════════════════════════════════════════════════════════════════════
// DOSYA YÜKLEME — sunucu üzerinden akıtma
//
// ┌─ NEDEN BU VAR ────────────────────────────────────────────────────┐
// │ İmzalı URL ile tarayıcıdan DOĞRUDAN Storage'a yüklemek en hızlı    │
// │ yol. Ama kendi sunucunda barındırılan Supabase'de (rovand.cloud     │
// │ gibi) ters vekil sunucu genelde CORS başlıklarını iletmiyor ve      │
// │ tarayıcı isteği "ağ hatası" ile reddediyor.                         │
// │                                                                    │
// │ Bu uç aynı kaynakta (same-origin) olduğu için CORS devreye hiç      │
// │ girmiyor. Dosya panel sunucusundan geçiyor ama:                     │
// │   · Route Handler'da Server Action gövde sınırı YOK                 │
// │   · Gövde akıtılıyor, tamamı belleğe alınmıyor                      │
// └───────────────────────────────────────────────────────────────────┘
//
// ★ İstemci önce imzalı URL'i dener, başarısız olursa buraya düşer.
//   Böylece CORS çalışan kurulumlarda hızlı yol korunuyor.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { benzersizAd } from "@/lib/upload-name"
import { genelAdres } from "@/lib/storage-url"

export const dynamic = "force-dynamic"
export const maxDuration = 300          // büyük video için
export const runtime = "nodejs"

const IZINLI_BUCKET = new Set(["galeri", "reklam", "media"])

const SINIR_MB: Record<string, number> = {
  galeri: 200,
  reklam: 20,
  media: 50,
}

export async function POST(req: NextRequest) {
  // ── Yetki ──
  try {
    await assertSession()
  } catch {
    return NextResponse.json({ ok: false, error: "Oturum sona ermiş." }, { status: 401 })
  }

  const bucket = req.nextUrl.searchParams.get("bucket") ?? ""
  const klasor = (req.nextUrl.searchParams.get("klasor") ?? "").replace(/^\/+|\/+$/g, "")
  const fileName = req.nextUrl.searchParams.get("name") ?? "dosya"
  const mime = req.headers.get("content-type") ?? "application/octet-stream"

  if (!IZINLI_BUCKET.has(bucket)) {
    return NextResponse.json({ ok: false, error: `Geçersiz bucket: ${bucket}` }, { status: 400 })
  }

  const sinirMb = SINIR_MB[bucket] ?? 20
  const uzunluk = Number(req.headers.get("content-length") ?? 0)
  if (uzunluk > sinirMb * 1024 * 1024) {
    return NextResponse.json(
      { ok: false, error: `Dosya çok büyük (${Math.round(uzunluk / 1048576)} MB). Sınır ${sinirMb} MB.` },
      { status: 413 }
    )
  }

  try {
    const gövde = await req.arrayBuffer()

    if (gövde.byteLength === 0) {
      return NextResponse.json({ ok: false, error: "Dosya boş." }, { status: 400 })
    }
    if (gövde.byteLength > sinirMb * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: `Dosya çok büyük. Sınır ${sinirMb} MB.` },
        { status: 413 }
      )
    }

    const sb = getSupabaseAdmin()
    const ad = benzersizAd(fileName, mime)
    const path = klasor ? `${klasor}/${ad}` : ad

    const { error } = await sb.storage
      .from(bucket)
      .upload(path, new Uint8Array(gövde), {
        contentType: mime,
        cacheControl: "31536000",
        upsert: false,
      })

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    const pub = { publicUrl: genelAdres(bucket, path) }

    return NextResponse.json({
      ok: true,
      bucket,
      path,
      publicUrl: pub.publicUrl,
      size: gövde.byteLength,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Yükleme hatası" },
      { status: 500 }
    )
  }
}
