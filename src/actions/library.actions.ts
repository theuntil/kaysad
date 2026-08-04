// src/actions/library.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// MEDYA KÜTÜPHANESİ
//
// ★ Dosyalar "medya" bucket'ında; media_library tablosu sadece üst veri
//   tutuyor (etiket, açıklama, boyut). Storage listeleme API'si bunları
//   veremediği için ayrı tablo şart.
//
// ★ Silme: tablodan silince tetikleyici storage_cleanup_queue'ya yazıyor,
//   temizlik worker'ı dosyayı Storage'dan kaldırıyor.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import { genelAdres } from "@/lib/storage-url"

const BUCKET = process.env.SUPABASE_LIBRARY_BUCKET || "galeri"
const MAX_MB = 200

export interface MediaItem {
  id: string
  bucket: string
  path: string
  url: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  klasor: string | null
  etiketler: string[] | null
  aciklama: string | null
  uploaded_by: string | null
  created_at: string
}

export interface MediaStats {
  toplam: number
  boyut: number
  gorsel: number
  video: number
  klasorler: { klasor: string; adet: number }[]
}

export async function fetchMediaStats(): Promise<MediaStats | null> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data } = await sb.rpc("admin_media_stats")
    return (data ?? null) as MediaStats | null
  } catch {
    return null
  }
}

export async function fetchMedia(params: {
  klasor?: string | null
  query?: string | null
  limit?: number
  offset?: number
}): Promise<{ items: MediaItem[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_media", {
      p_klasor: params.klasor || null,
      p_query: params.query?.trim() || null,
      p_limit: params.limit ?? 60,
      p_offset: params.offset ?? 0,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as MediaItem[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/** Dosya adı: <slug>-<YYYYAAGG>-<6 karakter>.<uzantı> — çakışma olmaz */
function benzersizAd(orijinal: string): string {
  const nokta = orijinal.lastIndexOf(".")
  const ext = nokta > 0 ? orijinal.slice(nokta + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "bin"
  const taban = (nokta > 0 ? orijinal.slice(0, nokta) : orijinal)
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "dosya"

  const d = new Date()
  const tarih = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  const rnd = Math.random().toString(36).slice(2, 8)

  return `${taban}-${tarih}-${rnd}.${ext}`
}

export async function uploadMediaAction(form: FormData): Promise<{
  ok: boolean; error?: string; message?: string; url?: string
}> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const file = form.get("file")
  // ★ Klasör ve etiket kaldırıldı — tek havuz, sade akış.
  //   Dosyalar yıl/ay klasörüne yazılıyor ki bucket kökü şişmesin.
  const d0 = new Date()
  const klasor = `${d0.getFullYear()}-${String(d0.getMonth() + 1).padStart(2, "0")}`

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Dosya seçilmedi." }
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return { ok: false, error: `Dosya çok büyük (${Math.round(file.size / 1048576)} MB). Sınır ${MAX_MB} MB.` }
  }

  try {
    const sb = getSupabaseAdmin()
    const ad = benzersizAd(file.name)
    const path = `${klasor}/${ad}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    const { error: upErr } = await sb.storage.from(BUCKET).upload(path, bytes, {
      contentType: file.type || undefined,
      cacheControl: "31536000",
      upsert: false,
    })
    if (upErr) return { ok: false, error: `Yükleme başarısız: ${upErr.message}` }

    const pub = { publicUrl: genelAdres(BUCKET, path) }

    const { error: dbErr } = await sb.from("media_library").insert({
      bucket: BUCKET,
      path,
      url: pub.publicUrl,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      klasor,
      uploaded_by: session.sub,
    })

    if (dbErr) {
      // Kayıt açılamadıysa dosyayı da bırakma — yetim dosya kalmasın
      await sb.storage.from(BUCKET).remove([path])
      return { ok: false, error: dbErr.message }
    }

    await logAudit({
      actor: session.sub, action: "media_upload" as never,
      targetType: "media", targetId: path,
      detail: { klasor, boyut: file.size, tur: file.type },
    })

    revalidatePath("/medya")
    return { ok: true, url: pub.publicUrl, message: "Yüklendi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function deleteMediaAction(id: string): Promise<{
  ok: boolean; error?: string; message?: string
}> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()

    const { data } = await sb.from("media_library").select("bucket, path").eq("id", id).maybeSingle()
    const row = data as { bucket: string; path: string } | null

    // Tetikleyici temizlik kuyruğuna yazıyor; biz de doğrudan silmeyi deniyoruz
    const { error } = await sb.from("media_library").delete().eq("id", id)
    if (error) return { ok: false, error: error.message }

    if (row) {
      await sb.storage.from(row.bucket).remove([row.path]).catch(() => null)
    }

    await logAudit({
      actor: session.sub, action: "media_delete" as never,
      targetType: "media", targetId: row?.path ?? id,
    })

    revalidatePath("/medya")
    return { ok: true, message: "Silindi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * ★ TEMİZLİK WORKER'I — reklam görseli değişince/silinince, medya
 *   kütüphanesinden kayıt silinince Storage'daki dosyayı kaldırır.
 *   SQL Storage'a erişemediği için bu adım panelde.
 */
export async function drainStorageCleanup(limit = 100): Promise<{
  ok: boolean; silinen: number; hata: number
}> {
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_claim_storage_cleanup", { p_limit: limit })
    if (error) return { ok: false, silinen: 0, hata: 0 }

    const rows = (data ?? []) as { id: string; bucket: string; path: string }[]
    let silinen = 0, hata = 0

    // Bucket'a göre grupla — tek çağrıda çok dosya silinebiliyor
    const gruplar = new Map<string, { id: string; path: string }[]>()
    for (const r of rows) {
      const g = gruplar.get(r.bucket) ?? []
      g.push({ id: r.id, path: r.path })
      gruplar.set(r.bucket, g)
    }

    for (const [bucket, liste] of gruplar) {
      const { error: delErr } = await sb.storage.from(bucket).remove(liste.map((l) => l.path))
      for (const l of liste) {
        await sb.rpc("admin_mark_storage_cleanup", {
          p_id: l.id, p_ok: !delErr, p_error: delErr?.message ?? null,
        })
        if (delErr) hata++; else silinen++
      }
    }

    return { ok: true, silinen, hata }
  } catch {
    return { ok: false, silinen: 0, hata: 0 }
  }
}
