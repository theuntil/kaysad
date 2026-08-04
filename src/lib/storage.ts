// src/lib/storage.ts
//
// Supabase Storage URL ayrıştırma. Server action dosyasında değil ayrı
// bir lib'de: "use server" dosyalarından senkron fonksiyon export
// edilemiyor (Next kuralı), ayrıca istemci tarafında da lazım oluyor.

export interface ParsedMedia {
  bucket: string
  path: string
  isPublic: boolean
}

/**
 * Beklenen biçim:
 *   https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<yol...>
 *
 * Tanınmayan (harici) URL'de null döner — üzerine yazma yapılamaz.
 */
export function parseStorageUrl(url: string): ParsedMedia | null {
  try {
    const u = new URL(url)
    const marker = "/storage/v1/object/"
    const i = u.pathname.indexOf(marker)
    if (i === -1) return null

    let rest = u.pathname.slice(i + marker.length)
    let isPublic = false

    if (rest.startsWith("public/")) { rest = rest.slice(7); isPublic = true }
    else if (rest.startsWith("sign/")) { rest = rest.slice(5) }
    else if (rest.startsWith("authenticated/")) { rest = rest.slice(14) }

    const slash = rest.indexOf("/")
    if (slash <= 0) return null

    return {
      bucket: decodeURIComponent(rest.slice(0, slash)),
      path: decodeURIComponent(rest.slice(slash + 1)),
      isPublic,
    }
  } catch {
    return null
  }
}

/** Uzantı ya da alan adına bakarak video mu karar verir. */
export function isVideoUrl(url: string, key?: string): boolean {
  const clean = url.split("?")[0].toLowerCase()
  if (/\.(mp4|mov|m4v|webm|avi|mkv)$/.test(clean)) return true
  if (key && /video|klip/i.test(key)) return true
  return false
}
