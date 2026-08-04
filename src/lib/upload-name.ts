// src/lib/upload-name.ts
//
// Benzersiz dosya adı üretimi.
//
// ★ Neden ayrı dosyada: "use server" ile işaretli dosyalar SADECE async
//   fonksiyon export edebiliyor. Bu senkron bir yardımcı olduğu için
//   burada duruyor.
//
// Biçim: <slug>-<YYYYAAGG>-<6 karakter>.<uzantı>
//   yaz-kampanyasi-20260801-k4p1x2.jpg
// Aynı dosya iki kez yüklense bile çakışma olmuyor; CDN önbelleği de
// eski dosyayı göstermiyor çünkü yol farklı.

export function benzersizAd(orijinal: string, mime: string): string {
  const nokta = orijinal.lastIndexOf(".")
  let ext = nokta > 0 ? orijinal.slice(nokta + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : ""

  if (!ext) {
    ext = mime.startsWith("video/") ? "mp4"
      : mime === "image/png" ? "png"
      : mime === "image/webp" ? "webp"
      : mime === "image/gif" ? "gif" : "jpg"
  }

  const taban = (nokta > 0 ? orijinal.slice(0, nokta) : orijinal)
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "dosya"

  const d = new Date()
  const tarih =
    `${d.getFullYear()}` +
    `${String(d.getMonth() + 1).padStart(2, "0")}` +
    `${String(d.getDate()).padStart(2, "0")}`

  return `${taban}-${tarih}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}
