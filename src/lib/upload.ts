// src/lib/upload.ts
//
// ═══════════════════════════════════════════════════════════════════════
// İSTEMCİ TARAFI YÜKLEME
//
// İki yol var, sırayla deneniyor:
//
//   1. İMZALI URL — tarayıcı doğrudan Storage'a yükler. En hızlı,
//      sunucu bant genişliği harcamaz.
//
//   2. SUNUCU VEKİLİ (/api/upload) — imzalı URL CORS'a takılırsa buraya
//      düşer. Kendi sunucunda barındırılan Supabase'de ters vekil
//      genelde CORS başlıklarını iletmiyor ve 1. yol "ağ hatası" veriyor.
//      Aynı kaynak olduğu için burada CORS devreye girmiyor.
//
// ★ XHR kullanılıyor çünkü fetch() yükleme ilerlemesi bildirmiyor;
//   büyük videolarda kullanıcının yüzde görmesi gerekiyor.
// ═══════════════════════════════════════════════════════════════════════

export interface UploadProgress {
  yuklenen: number
  toplam: number
  yuzde: number
}

export interface UploadSonuc {
  ok: boolean
  error?: string
  /** Hangi yolla yüklendi — tanı için */
  yol?: "imzali" | "sunucu"
  publicUrl?: string
  bucket?: string
  path?: string
}

function xhrGonder(
  method: "PUT" | "POST",
  url: string,
  file: File,
  onProgress?: (p: UploadProgress) => void,
  headers?: Record<string, string>
): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener("progress", (e) => {
      if (!e.lengthComputable || !onProgress) return
      onProgress({
        yuklenen: e.loaded,
        toplam: e.total,
        yuzde: Math.round((e.loaded / e.total) * 100),
      })
    })

    xhr.addEventListener("load", () =>
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, text: xhr.responseText })
    )
    xhr.addEventListener("error", () => resolve({ ok: false, status: 0, text: "" }))
    xhr.addEventListener("abort", () => resolve({ ok: false, status: 0, text: "iptal" }))
    xhr.addEventListener("timeout", () => resolve({ ok: false, status: 0, text: "zaman aşımı" }))

    xhr.open(method, url, true)
    xhr.timeout = 10 * 60 * 1000   // 10 dakika — büyük video için

    if (headers) {
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    }

    xhr.send(file)
  })
}

/** Eski API — imzalı URL'e doğrudan gönderir */
export async function uploadToSignedUrl(
  signedUrl: string,
  file: File,
  onProgress?: (p: UploadProgress) => void
): Promise<{ ok: boolean; error?: string }> {
  const r = await xhrGonder("PUT", signedUrl, file, onProgress, {
    "content-type": file.type || "application/octet-stream",
  })

  if (r.ok) return { ok: true }

  return {
    ok: false,
    error: r.status === 0
      ? "Ağ hatası (CORS olabilir)"
      : `Yükleme başarısız (HTTP ${r.status})`,
  }
}

/** Sunucu vekili üzerinden yükle — CORS'a takılmaz */
export async function uploadViaServer(
  params: { bucket: string; klasor?: string | null; file: File },
  onProgress?: (p: UploadProgress) => void
): Promise<UploadSonuc> {
  const q = new URLSearchParams({
    bucket: params.bucket,
    name: params.file.name,
  })
  if (params.klasor) q.set("klasor", params.klasor)

  const r = await xhrGonder("POST", `/api/upload?${q}`, params.file, onProgress, {
    "content-type": params.file.type || "application/octet-stream",
  })

  if (!r.ok) {
    let mesaj = `Yükleme başarısız (HTTP ${r.status})`
    try {
      const j = JSON.parse(r.text)
      if (j?.error) mesaj = j.error
    } catch { /* metin JSON değil */ }
    return { ok: false, error: mesaj }
  }

  try {
    const j = JSON.parse(r.text)
    return {
      ok: true, yol: "sunucu",
      publicUrl: j.publicUrl, bucket: j.bucket, path: j.path,
    }
  } catch {
    return { ok: false, error: "Sunucu yanıtı okunamadı." }
  }
}

/**
 * ★ ASIL KULLANILACAK FONKSİYON
 *
 * Önce imzalı URL'i dener (hızlı yol), CORS'a takılırsa sunucu vekiline
 * düşer. Kullanıcı farkı görmez, sadece yüklenir.
 */
export async function akilliYukle(params: {
  bucket: string
  klasor?: string | null
  file: File
  /** createSignedUploadAction sonucu — verilmezse doğrudan sunucu yolu */
  imza?: { url?: string; publicUrl?: string; bucket?: string; path?: string } | null
}, onProgress?: (p: UploadProgress) => void): Promise<UploadSonuc> {

  // ── 1. YOL: imzalı URL ──
  if (params.imza?.url) {
    const r = await uploadToSignedUrl(params.imza.url, params.file, onProgress)
    if (r.ok) {
      return {
        ok: true, yol: "imzali",
        publicUrl: params.imza.publicUrl,
        bucket: params.imza.bucket,
        path: params.imza.path,
      }
    }

    // ★ Ağ/CORS hatasıysa sunucu yoluna düş. Başka bir hataysa
    //   (dosya çok büyük, yetki yok) tekrar denemek anlamsız.
    const corsOlabilir = (r.error ?? "").includes("Ağ hatası")
    if (!corsOlabilir) return { ok: false, error: r.error }

    console.warn("[upload] imzalı URL başarısız, sunucu vekiline düşülüyor:", r.error)
  }

  // ── 2. YOL: sunucu vekili ──
  return uploadViaServer(
    { bucket: params.bucket, klasor: params.klasor, file: params.file },
    onProgress
  )
}
