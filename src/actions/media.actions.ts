// src/actions/media.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// MEDYA DEĞİŞTİRME (fotoğraf / video)
//
// ┌─ NASIL ÇALIŞIYOR ────────────────────────────────────────────────┐
// │ 1. Mevcut medya URL'sinden bucket + dosya yolu çözülür            │
// │ 2. Yeni dosya AYNI YOLA, AYNI ADLA yüklenir (upsert)              │
// │ 3. Böylece eski dosya fiziksel olarak ÜZERİNE YAZILIR — ortada     │
// │    yetim dosya kalmaz, depolama şişmez                            │
// │ 4. Veritabanındaki kolon aynı URL + `?v=<zaman>` ile güncellenir   │
// └──────────────────────────────────────────────────────────────────┘
//
// ★ NEDEN ?v= EKLİYORUZ: Supabase Storage public URL'leri CDN'de
//   önbelleklenir. Aynı yola yeni dosya yazınca URL değişmediği için
//   uygulama ESKİ görseli göstermeye devam eder. Sorgu parametresi
//   önbelleği kırar; dosya yolu ise aynı kalır.
//
// ★ Uzantı farklıysa (jpg → mp4) eski yol KORUNUR. Depoda uzantı sadece
//   bir isimdir; content-type başlıkta gider. Bu sayede "aynı ad, aynı
//   konum" kuralı bozulmuyor. Uzantıyı da değiştirmek istersen
//   `p_yeni_yol` parametresi bırakıldı.
// ═══════════════════════════════════════════════════════════════════════

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import { revalidatePath } from "next/cache"
import type { ContentKind } from "@/lib/types.v3"
import { parseStorageUrl } from "@/lib/storage"
import { genelAdres } from "@/lib/storage-url"

const MAX_IMAGE_MB = 12
const MAX_VIDEO_MB = 200

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]
const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"]

export async function replaceMediaAction(
  formData: FormData
): Promise<{ ok: boolean; error?: string; message?: string; url?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const kind = String(formData.get("kind") ?? "") as ContentKind
  const id = String(formData.get("id") ?? "")
  const column = String(formData.get("column") ?? "")
  const currentUrl = String(formData.get("currentUrl") ?? "")
  const userId = String(formData.get("userId") ?? "")
  const file = formData.get("file")

  if (!kind || !id || !column) return { ok: false, error: "Eksik parametre." }
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Dosya seçilmedi." }

  const isVideo = VIDEO_TYPES.includes(file.type)
  const isImage = IMAGE_TYPES.includes(file.type)

  if (!isVideo && !isImage) {
    return { ok: false, error: `Desteklenmeyen dosya türü: ${file.type || "bilinmiyor"}` }
  }

  const limitMb = isVideo ? MAX_VIDEO_MB : MAX_IMAGE_MB
  if (file.size > limitMb * 1024 * 1024) {
    return { ok: false, error: `Dosya çok büyük (${(file.size / 1048576).toFixed(1)} MB). Sınır: ${limitMb} MB.` }
  }

  const parsed = parseStorageUrl(currentUrl)
  if (!parsed) {
    return {
      ok: false,
      // ★ Yeni yol uydurmuyoruz: mobil uygulamanın hangi bucket'a hangi
      //   adla yazdığını bilmeden dosya oluşturmak, uygulamanın bulamadığı
      //   yetim dosyalar üretir.
      error:
        "Mevcut medya adresi Supabase Storage biçiminde değil, bu yüzden üzerine yazılamıyor. " +
        "Adres harici bir sunucuda olabilir.",
    }
  }

  try {
    const sb = getSupabaseAdmin()
    const bytes = new Uint8Array(await file.arrayBuffer())

    // ── Aynı yola üzerine yaz ──
    const { error: upErr } = await sb.storage
      .from(parsed.bucket)
      .upload(parsed.path, bytes, {
        contentType: file.type,
        upsert: true,            // ★ eski dosya bu satırla siliniyor/eziliyor
        cacheControl: "3600",
      })

    if (upErr) {
      return { ok: false, error: `Yükleme başarısız: ${upErr.message}` }
    }

    // ── Yeni URL (önbellek kırıcı) ──
    const pub = { publicUrl: genelAdres(parsed.bucket, parsed.path) }
    const baseUrl = pub?.publicUrl ?? currentUrl.split("?")[0]
    const newUrl = `${baseUrl}?v=${Date.now()}`

    // ── Veritabanı kolonunu güncelle ──
    const { error: dbErr } = await sb.rpc("admin_update_content", {
      p_kind: kind,
      p_id: id,
      p_patch: { [column]: newUrl },
    })

    if (dbErr) {
      return {
        ok: false,
        // Dosya yüklendi ama kolon güncellenemedi: kullanıcı bilsin,
        // sessiz kalıp "oldu" demek yanlış olur.
        error:
          `Dosya yüklendi ama veritabanı güncellenemedi: ${dbErr.message}. ` +
          `Medya depoda yenilendi, adres eski kaldı.`,
      }
    }

    await logAudit({
      actor: session.sub,
      action: "content_update",
      targetType: kind,
      targetId: id,
      detail: {
        medya_degistirildi: column,
        bucket: parsed.bucket,
        yol: parsed.path,
        tur: file.type,
        boyut_mb: Number((file.size / 1048576).toFixed(2)),
      },
    })

    if (userId) revalidatePath(`/kullanicilar/${userId}`)

    return {
      ok: true,
      url: newUrl,
      message: `Medya değiştirildi — ${parsed.bucket}/${parsed.path} üzerine yazıldı.`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════════════════════════════════════════════════════════════
   PROFİL MEDYASI — avatar ve arka plan görseli
   ═══════════════════════════════════════════════════════════════════════

   ★ SİLME GERÇEK SİLME: kolon boşaltılmakla kalmıyor, dosya Storage'dan
     da kaldırılıyor. Aksi halde depolama, kimsenin görmediği dosyalarla
     şişiyor ve GDPR/KVKK açısından "sildim" demek doğru olmuyor.

   ★ YÜKLEME: mevcut bir dosya varsa AYNI bucket'a, kullanıcının klasörüne
     yazılır ve eski dosya silinir. Hiç yoksa varsayılan bucket kullanılır
     (SUPABASE_MEDIA_BUCKET, yoksa "avatars").
   ═══════════════════════════════════════════════════════════════════════ */

const DEFAULT_BUCKET = process.env.SUPABASE_MEDIA_BUCKET || "media"

type ProfileField = "avatar" | "background"

export interface MediaResult {
  ok: boolean
  error?: string
  message?: string
  url?: string
}

function extOf(name: string, mime: string): string {
  const dot = name.lastIndexOf(".")
  if (dot > 0) return name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "")
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "image/heic" || mime === "image/heif") return "heic"
  if (mime === "image/gif") return "gif"
  return "jpg"
}

/**
 * Dosya adı: <kullaniciadi>-<alan>-<YYYYAAGG>-<4 karakter rastgele>.<uzantı>
 * Örn: sss-background-20260702-2i9a.jpg
 *
 * ★ Her yüklemede YENİ ad üretiliyor, eski dosya siliniyor. Sabit ada
 *   yazmak yerine bunu tercih ettik: CDN önbelleği dosya yolunu görüyor,
 *   yol değişince eski görsel kesin gitmiş oluyor.
 */
function mediaFileName(username: string | null, field: ProfileField, ext: string): string {
  const slug = (username ?? "kullanici")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 24) || "kullanici"

  const d = new Date()
  const tarih = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  const rastgele = Math.random().toString(36).slice(2, 6)

  return `${slug}-${field}-${tarih}-${rastgele}.${ext}`
}

async function mediaInfo(userId: string, field: ProfileField): Promise<{
  column: string | null
  url: string | null
  username: string | null
}> {
  const sb = getSupabaseAdmin()
  const { data: cols } = await sb.rpc("admin_profile_media_columns")
  const column = (cols as Record<string, string> | null)?.[field] ?? null

  const secim = column ? `username, ${column}` : "username"
  const { data } = await sb.from("profiles").select(secim).eq("id", userId).maybeSingle()
  const row = data as Record<string, unknown> | null

  const raw = column ? row?.[column] : null
  return {
    column,
    url: typeof raw === "string" && raw ? raw : null,
    username: typeof row?.username === "string" ? row.username : null,
  }
}

/** Yeni profil görseli yükle (avatar ya da arka plan) */
export async function uploadProfileMediaAction(form: FormData): Promise<MediaResult> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const file = form.get("file")
  const userId = String(form.get("userId") ?? "")
  const field = String(form.get("field") ?? "") as ProfileField

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Dosya seçilmedi." }
  if (!userId || (field !== "avatar" && field !== "background")) {
    return { ok: false, error: "Eksik parametre." }
  }
  if (file.size > 12 * 1024 * 1024) {
    return { ok: false, error: `Görsel çok büyük (${Math.round(file.size / 1048576)} MB). Sınır 12 MB.` }
  }
  if (file.type && !file.type.startsWith("image/")) {
    return { ok: false, error: "Sadece görsel yüklenebilir." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { column, url: eski, username } = await mediaInfo(userId, field)

    if (!column) {
      return {
        ok: false,
        error: `profiles tablosunda ${field === "avatar" ? "avatar" : "arka plan"} kolonu bulunamadı.`,
      }
    }

    const parsed = eski ? parseStorageUrl(eski) : null
    const bucket = parsed?.bucket ?? DEFAULT_BUCKET

    // ★ Eski dosya hangi klasördeyse yenisi de oraya yazılır
    const klasor = parsed
      ? parsed.path.split("/").slice(0, -1).join("/")
      : field === "avatar" ? "avatars" : "backgrounds"

    const ext = extOf(file.name, file.type)
    const yeniAd = mediaFileName(username, field, ext)
    const targetPath = klasor ? `${klasor}/${yeniAd}` : yeniAd

    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error: upErr } = await sb.storage.from(bucket).upload(targetPath, bytes, {
      upsert: true, contentType: file.type || undefined, cacheControl: "3600",
    })
    if (upErr) return { ok: false, error: `Yükleme başarısız: ${upErr.message}` }

    // ★ Eski dosyayı fiziksel olarak sil
    let eskiSilindi = false
    if (parsed && parsed.path !== targetPath) {
      const { error: delErr } = await sb.storage.from(parsed.bucket).remove([parsed.path])
      if (delErr) console.error("[media] eski dosya silinemedi:", delErr.message)
      else eskiSilindi = true
    }

    const pub = { publicUrl: genelAdres(bucket, targetPath) }
    const url = `${pub.publicUrl}?t=${Date.now()}`

    const { error: setErr } = await sb.rpc("admin_set_profile_media", {
      p_user_id: userId, p_field: field, p_url: url,
    })
    if (setErr) return { ok: false, error: `Dosya yüklendi ama kayıt güncellenemedi: ${setErr.message}` }

    await logAudit({
      actor: session.sub, action: "profile_media_set",
      targetType: "user", targetId: userId,
      detail: {
        alan: field, kolon: column, bucket, yeni: targetPath,
        eski: parsed?.path ?? null, eski_silindi: eskiSilindi,
      },
    })

    revalidatePath(`/kullanicilar/${userId}`)
    revalidatePath("/kullanicilar")

    return { ok: true, url, message: field === "avatar" ? "Profil fotoğrafı güncellendi." : "Arka plan güncellendi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/** Profil görselini sil — dosya Storage'dan da kaldırılır */
export async function deleteProfileMediaAction(params: {
  userId: string
  field: ProfileField
}): Promise<MediaResult> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { url: eski } = await mediaInfo(params.userId, params.field)
    if (!eski) return { ok: false, error: "Silinecek görsel yok." }

    const parsed = parseStorageUrl(eski)
    let dosyaSilindi = false

    if (parsed) {
      const { error: delErr } = await sb.storage.from(parsed.bucket).remove([parsed.path])
      if (delErr) console.error("[media] dosya silinemedi:", delErr.message)
      else dosyaSilindi = true
    }

    const { error: setErr } = await sb.rpc("admin_set_profile_media", {
      p_user_id: params.userId, p_field: params.field, p_url: null,
    })
    if (setErr) return { ok: false, error: setErr.message }

    await logAudit({
      actor: session.sub, action: "profile_media_delete",
      targetType: "user", targetId: params.userId,
      detail: { alan: params.field, dosya: parsed ? `${parsed.bucket}/${parsed.path}` : eski, dosya_silindi: dosyaSilindi },
    })

    revalidatePath(`/kullanicilar/${params.userId}`)
    revalidatePath("/kullanicilar")

    return { ok: true, message: dosyaSilindi ? "Görsel silindi." : "Kayıt temizlendi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
