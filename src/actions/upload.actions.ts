// src/actions/upload.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// DOĞRUDAN YÜKLEME — imzalı URL
//
// ┌─ SORUN ───────────────────────────────────────────────────────────┐
// │ Server Action gövde sınırı varsayılan 1 MB. 200 MB'lik bir videoyu │
// │ sunucudan geçirmek zaten yanlış: bellek şişer, zaman aşımı olur,   │
// │ Vercel gibi ortamlarda hiç çalışmaz.                               │
// └───────────────────────────────────────────────────────────────────┘
//
// ┌─ ÇÖZÜM ───────────────────────────────────────────────────────────┐
// │ 1. Panel sunucudan İMZALI YÜKLEME URL'i ister (sadece birkaç bayt) │
// │ 2. Tarayıcı dosyayı DOĞRUDAN Supabase Storage'a gönderir           │
// │ 3. Bitince panel sunucuya "şu yola şu dosya yüklendi" der          │
// │ Dosya hiçbir zaman Next.js sunucusundan geçmiyor.                  │
// └───────────────────────────────────────────────────────────────────┘

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import { benzersizAd } from "@/lib/upload-name"
import { genelAdres, genelKok } from "@/lib/storage-url"

export interface SignedUpload {
  ok: boolean
  error?: string
  /** Tarayıcının PUT edeceği adres */
  url?: string
  token?: string
  bucket?: string
  path?: string
  /** Yükleme bittikten sonra kaydedilecek genel adres */
  publicUrl?: string
}

const IZINLI_BUCKET = new Set(["galeri", "reklam", "media"])

/**
 * İmzalı yükleme adresi üretir.
 * @param bucket galeri | reklam | media
 * @param klasor bucket içindeki klasör (boş olabilir)
 */
export async function createSignedUploadAction(params: {
  bucket: string
  klasor?: string | null
  fileName: string
  mimeType: string
  sizeBytes: number
}): Promise<SignedUpload> {
  try {
    await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  if (!IZINLI_BUCKET.has(params.bucket)) {
    return { ok: false, error: `Geçersiz bucket: ${params.bucket}` }
  }

  // Boyut sınırı bucket'a göre
  const sinirMb = params.bucket === "galeri" ? 200 : params.bucket === "reklam" ? 20 : 50
  if (params.sizeBytes > sinirMb * 1024 * 1024) {
    return {
      ok: false,
      error: `Dosya çok büyük (${Math.round(params.sizeBytes / 1048576)} MB). Sınır ${sinirMb} MB.`,
    }
  }

  try {
    const sb = getSupabaseAdmin()
    const ad = benzersizAd(params.fileName, params.mimeType)
    const path = params.klasor ? `${params.klasor.replace(/^\/+|\/+$/g, "")}/${ad}` : ad

    const { data, error } = await sb.storage.from(params.bucket).createSignedUploadUrl(path)
    if (error) return { ok: false, error: error.message }

    const pub = { publicUrl: genelAdres(params.bucket, path) }

    return {
      ok: true,
      url: data.signedUrl,
      token: data.token,
      bucket: params.bucket,
      path,
      publicUrl: pub.publicUrl,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/** Yükleme bittikten sonra medya kütüphanesine kaydet */
export async function registerMediaAction(params: {
  bucket: string
  path: string
  url: string
  fileName: string
  mimeType: string
  sizeBytes: number
}): Promise<{ ok: boolean; error?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const d = new Date()
    const klasor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

    const { error } = await sb.from("media_library").insert({
      bucket: params.bucket,
      path: params.path,
      url: params.url,
      file_name: params.fileName,
      mime_type: params.mimeType || null,
      size_bytes: params.sizeBytes,
      klasor,
      uploaded_by: session.sub,
    })

    if (error) {
      // Kayıt açılamadıysa yüklenen dosyayı bırakma
      await sb.storage.from(params.bucket).remove([params.path]).catch(() => null)
      return { ok: false, error: error.message }
    }

    await logAudit({
      actor: session.sub, action: "media_upload",
      targetType: "media", targetId: params.path,
      detail: { bucket: params.bucket, boyut: params.sizeBytes, tur: params.mimeType },
    })

    revalidatePath("/medya")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════════════════════════════════════════════════════
   DEPOLAMA TANISI
   ★ "Görsel açılamadı" hatasının sebebini kesin olarak gösterir.
═══════════════════════════════════════════════════════════════ */

export interface DepolamaTani {
  /** SUPABASE_URL — sunucunun kullandığı adres */
  ic_adres: string
  /** SUPABASE_PUBLIC_URL varsa o, yoksa SUPABASE_URL */
  genel_adres: string
  /** İkisi farklıysa iç ağ adresi kullanılıyor demektir */
  ayri_mi: boolean
  bucketlar: {
    id: string
    var_mi: boolean
    public: boolean
    dosya_sayisi: number
    ornek_url: string | null
  }[]
  tani: string
  cozum: string | null
}

/**
 * Bucket için veritabanında KAYITLI gerçek bir adres bul.
 * ★ Adres üretmiyor — uygulamanın kullandığı değeri okuyor.
 */
async function kayitliOrnekAdres(
  sb: ReturnType<typeof getSupabaseAdmin>,
  bucket: string
): Promise<string | null> {
  const parca = `/storage/v1/object/public/${bucket}/`

  const kaynaklar: { tablo: string; kolon: string }[] =
    bucket === "reklam"
      ? [
          { tablo: "ad_campaigns", kolon: "image_url" },
          { tablo: "ad_campaigns", kolon: "logo_url" },
        ]
      : bucket === "media"
        ? [{ tablo: "profiles", kolon: "avatar_url" }]
        : [{ tablo: "media_library", kolon: "url" }]

  for (const k of kaynaklar) {
    try {
      const { data } = await sb
        .from(k.tablo)
        .select(k.kolon)
        .like(k.kolon, `%${parca}%`)
        .limit(1)
        .maybeSingle()

      const v = (data as Record<string, unknown> | null)?.[k.kolon]
      if (typeof v === "string" && v) return v
    } catch {
      // Tablo/kolon yoksa sıradakine geç
    }
  }

  return null
}

export async function diagnoseStorage(): Promise<DepolamaTani | null> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()

    const ic = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "")
    const genel = genelKok()

    const hedefler = ["reklam", "galeri", "media"]
    const bucketlar: DepolamaTani["bucketlar"] = []

    const { data: bList } = await sb.storage.listBuckets()
    const mevcut = new Map(
      ((bList ?? []) as { id: string; public: boolean }[]).map((b) => [b.id, b])
    )

    for (const id of hedefler) {
      const b = mevcut.get(id)

      let sayi = 0
      let ornek: string | null = null

      if (b) {
        try {
          const { data: kok } = await sb.storage.from(id).list("", { limit: 100 })
          const dosyalar = (kok ?? []).filter((f) => f.id !== null)
          sayi = dosyalar.length

          if (dosyalar.length === 0) {
            const klasor = (kok ?? []).find((f) => f.id === null)
            if (klasor) {
              const { data: ic2 } = await sb.storage.from(id).list(klasor.name, { limit: 10 })
              sayi = (ic2 ?? []).filter((f) => f.id !== null).length
            }
          }
        } catch {
          // Listeleme başarısızsa sayı sıfır kalsın
        }

        /* ★★★ ÖRNEK ADRES: kendimiz ÜRETMİYORUZ ★★★
         *
         *   Önceki sürüm `genelAdres()` ile adres kuruyordu. O da
         *   `SUPABASE_URL`'e düşünce iç adres üretiyor ve TÜM bucket'lar
         *   "açılamadı" görünüyordu — çalışanlar dâhil. Test yanlış
         *   şeyi ölçüyordu.
         *
         *   Artık VERİTABANINDA KAYITLI gerçek adresi alıyoruz.
         *   Uygulamanın gerçekten kullandığı adres bu; test edilmesi
         *   gereken de bu.
         */
        ornek = await kayitliOrnekAdres(sb, id)
      }

      bucketlar.push({
        id,
        var_mi: !!b,
        public: b?.public === true,
        dosya_sayisi: sayi,
        ornek_url: ornek,
      })
    }

    /* ── Teşhis ── */
    const eksik = bucketlar.filter((b) => !b.var_mi)
    const kapali = bucketlar.filter((b) => b.var_mi && !b.public)

    let tani: string
    let cozum: string | null = null

    if (!genel) {
      tani = "Genel erişim adresi tanımlı değil."
      cozum = "SUPABASE_URL ya da SUPABASE_PUBLIC_URL ayarlanmalı."
    } else if (eksik.length > 0) {
      tani = `Bucket bulunamadı: ${eksik.map((b) => b.id).join(", ")}`
      cozum = "panel_v4_5_bucket_imap_stats.sql çalıştırılmamış olabilir."
    } else if (kapali.length > 0) {
      tani = `Bucket herkese açık DEĞİL: ${kapali.map((b) => b.id).join(", ")}`
      cozum =
        "Görseller tarayıcıdan açılamaz. depolama_erisim.sql dosyasını çalıştır."
    } else if (bucketlar.every((b) => b.ornek_url === null)) {
      tani = "Bucket'lar açık ama veritabanında kayıtlı görsel adresi yok."
      cozum = "Henüz görsel yüklenmemiş olabilir. Bir reklam görseli yükleyip tekrar dene."
    } else if (ic && genel && ic !== genel) {
      tani = "Bucket'lar açık. Genel adres iç adresten farklı — doğru kurulum."
      cozum = null
    } else {
      tani = "Ayarlar doğru görünüyor. Örnek dosya testine bak."
      cozum = null
    }

    return {
      ic_adres: ic || "—",
      genel_adres: genel || "—",
      ayri_mi: !!ic && !!genel && ic !== genel,
      bucketlar,
      tani,
      cozum,
    }
  } catch (e) {
    console.error("[diagnoseStorage]", e)
    return null
  }
}

/* ═══════════════════════════════════════════════════════════════
   URL TESTİ — sunucudan gerçek yanıtı oku

   ★ "Tarayıcıda açılıyor ama sayfada açılmıyor" durumunun sebebi
     neredeyse her zaman bir YANIT BAŞLIĞI. Tahmin etmek yerine
     isteği atıp başlıkları okuyoruz.
═══════════════════════════════════════════════════════════════ */

export interface UrlTesti {
  url: string
  ulasildi: boolean
  durum: number | null
  durum_metni: string
  content_type: string | null
  /** Bu başlık `same-origin` ise farklı alan adından gömülemez */
  corp: string | null
  /** Görselin gövde boyutu — 0 ise dosya boş yüklenmiş demek */
  boyut: number | null
  tani: string
  cozum: string | null
}

export async function testStorageUrl(url: string): Promise<UrlTesti | null> {
  try {
    await assertSession()

    const bos: UrlTesti = {
      url, ulasildi: false, durum: null, durum_metni: "",
      content_type: null, corp: null, boyut: null,
      tani: "", cozum: null,
    }

    if (!/^https?:\/\//i.test(url)) {
      return { ...bos, tani: "Adres http:// ya da https:// ile başlamıyor.", cozum: null }
    }

    let res: Response
    try {
      res = await fetch(url, {
        method: "GET",
        // ★ Tarayıcının yaptığına benzesin diye: referrer gönderiyoruz
        headers: { "Referer": "https://kays.business/" },
        cache: "no-store",
      })
    } catch (e) {
      return {
        ...bos,
        tani: "Sunucuya hiç ulaşılamadı.",
        cozum: "Adres yanlış ya da sunucu bu makineden erişilemiyor. " +
          (e instanceof Error ? e.message : ""),
      }
    }

    const corp = res.headers.get("cross-origin-resource-policy")
    const ct = res.headers.get("content-type")

    let boyut: number | null = null
    try {
      const buf = await res.arrayBuffer()
      boyut = buf.byteLength
    } catch { /* gövde okunamadı */ }

    const t: UrlTesti = {
      url,
      ulasildi: true,
      durum: res.status,
      durum_metni: res.statusText,
      content_type: ct,
      corp,
      boyut,
      tani: "",
      cozum: null,
    }

    /* ── Teşhis ── */
    if (res.status === 400 || res.status === 404) {
      t.tani = `Sunucu ${res.status} döndü — dosya bulunamadı ya da bucket kapalı.`
      t.cozum = "Bucket herkese açık mı kontrol et: depolama_erisim.sql"
    } else if (res.status === 403) {
      t.tani = "Sunucu 403 döndü — erişim reddedildi."
      t.cozum = "Bucket herkese açık değil ya da ters vekilde hotlink koruması var."
    } else if (!res.ok) {
      t.tani = `Sunucu ${res.status} ${res.statusText} döndü.`
      t.cozum = null
    } else if (boyut === 0) {
      t.tani = "Dosya var ama BOŞ (0 bayt)."
      t.cozum = "Yükleme bozuk tamamlanmış. Görseli tekrar yükle."
    } else if (corp && corp.toLowerCase() !== "cross-origin") {
      // ★★★ EN OLASI SEBEP ★★★
      t.tani =
        `Cross-Origin-Resource-Policy: ${corp} — bu başlık görselin ` +
        `başka bir alan adından gömülmesini ENGELLİYOR.`
      t.cozum =
        "Tarayıcıda doğrudan açınca çalışıyor ama kays.business içinde " +
        "çalışmıyor olmasının sebebi bu. Supabase'in önündeki ters vekilde " +
        "(nginx/Caddy/Cloudflare) bu başlığı kaldır ya da " +
        "'cross-origin' yap."
    } else if (ct && !ct.startsWith("image/")) {
      t.tani = `Yanıt görsel değil: ${ct}`
      t.cozum = "Muhtemelen bir hata sayfası dönüyor."
    } else {
      t.tani = "Sunucu tarafından erişilebiliyor ve geçerli bir görsel."
      t.cozum =
        "Sunucudan sorun yok. Tarayıcıda hâlâ açılmıyorsa geliştirici " +
        "konsolunu aç (F12 → Console) ve engelleme mesajını oku."
    }

    return t
  } catch (e) {
    console.error("[testStorageUrl]", e)
    return null
  }
}
