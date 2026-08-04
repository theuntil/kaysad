// src/lib/format.ts
//
// ═══════════════════════════════════════════════════════════════════════
// ETİKET VE METİN BİÇİMLENDİRME
//
// ★ Veritabanı değerleri küçük harf ve İngilizce ('pending', 'approved',
//   'business'). Bunları ekrana olduğu gibi basmak kötü görünüyordu
//   ("bekliyor", "banlı"). Artık her etiket buradan geçiyor:
//   Türkçe, baş harfi büyük, tek yerde tanımlı.
//
// Türkçe büyük harf kuralı önemli: "istanbul" → "İstanbul" (I değil İ).
// toLocaleUpperCase("tr") bunu doğru yapıyor.
// ═══════════════════════════════════════════════════════════════════════

export function capitalizeTr(s: string | null | undefined): string {
  if (!s) return ""
  const t = s.trim()
  if (!t) return ""
  return t.charAt(0).toLocaleUpperCase("tr") + t.slice(1)
}

/** Her kelimenin baş harfi büyük (şehir, isim gibi alanlar için) */
export function titleCaseTr(s: string | null | undefined): string {
  if (!s) return ""
  return s.trim().split(/\s+/).map(capitalizeTr).join(" ")
}

/* ═══════════════ DURUM ETİKETLERİ ═══════════════ */

const APPROVAL: Record<string, string> = {
  pending: "Bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
  none: "Başvuru yok",
}

const REPORT: Record<string, string> = {
  pending: "Bekliyor",
  open: "Açık",
  reviewed: "İncelendi",
  resolved: "Çözüldü",
  rejected: "Reddedildi",
  actioned: "İşlem yapıldı",
  dismissed: "Kapatıldı",
}

const ROLE: Record<string, string> = {
  user: "Kullanıcı",
  business: "İşletme",
  admin: "Yönetici",
  moderator: "Moderatör",
}

const BAN_TYPE: Record<string, string> = {
  manual: "Elle",
  device: "Cihaz",
  ip: "IP",
  auto: "Otomatik",
  report: "Şikâyet",
}

const PUSH_STATUS: Record<string, string> = {
  pending: "Bekliyor",
  sent: "Gönderildi",
  failed: "Başarısız",
  skipped: "Atlandı",
}

const SEND_TYPE: Record<string, string> = {
  promo: "Duyuru",
  earthquake: "Acil uyarı",
  popup: "Popup",
}

const CONTENT_KIND: Record<string, string> = {
  post: "Gönderi",
  listing: "İlan",
  discount: "İndirim",
  event: "Etkinlik",
}

const PLATFORM: Record<string, string> = {
  ios: "iOS",
  android: "Android",
  web: "Web",
}

function look(map: Record<string, string>, v: string | null | undefined, fallback?: string): string {
  if (!v) return fallback ?? "—"
  return map[v.toLowerCase()] ?? capitalizeTr(v)
}

export const label = {
  approval:   (v?: string | null) => look(APPROVAL, v, "Başvuru yok"),
  report:     (v?: string | null) => look(REPORT, v),
  role:       (v?: string | null) => look(ROLE, v),
  banType:    (v?: string | null) => look(BAN_TYPE, v),
  pushStatus: (v?: string | null) => look(PUSH_STATUS, v),
  sendType:   (v?: string | null) => look(SEND_TYPE, v),
  content:    (v?: string | null) => look(CONTENT_KIND, v),
  platform:   (v?: string | null) => look(PLATFORM, v),
  bool:       (v: unknown) => (v === true ? "Evet" : v === false ? "Hayır" : "—"),
}

/* ═══════════════ TELEFON ═══════════════ */

/** +905551234567 → 555 123 45 67 */
export function formatPhoneTr(v: string | null | undefined): string {
  if (!v) return ""
  const d = v.replace(/[^0-9]/g, "")
  const local = d.startsWith("90") ? d.slice(2) : d
  const p = local.slice(0, 10)
  const parts = [p.slice(0, 3), p.slice(3, 6), p.slice(6, 8), p.slice(8, 10)].filter(Boolean)
  return parts.join(" ")
}

/** Ekrandaki "555 123 45 67" → "+905551234567" */
export function toE164Tr(local: string | null | undefined): string | null {
  if (!local) return null
  const d = local.replace(/[^0-9]/g, "").replace(/^90/, "")
  if (d.length !== 10) return null
  return `+90${d}`
}

export function isValidPhoneTr(local: string | null | undefined): boolean {
  if (!local) return true // boş bırakmak geçerli (telefon zorunlu değil)
  const d = local.replace(/[^0-9]/g, "")
  // Türkiye cep numaraları 5 ile başlar
  return d.length === 10 && d.startsWith("5")
}

/* ═══════════════ E-POSTA ═══════════════ */

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/

export function isValidEmail(v: string | null | undefined): boolean {
  if (!v || !v.trim()) return true // boş bırakmak geçerli
  return EMAIL_RE.test(v.trim())
}

export function emailError(v: string | null | undefined): string | null {
  if (!v || !v.trim()) return null
  const t = v.trim()
  if (!t.includes("@")) return "E-posta '@' içermeli."
  if (t.split("@").length > 2) return "E-posta yalnızca bir '@' içerebilir."
  if (/\s/.test(t)) return "E-posta boşluk içeremez."
  const domain = t.split("@")[1] ?? ""
  if (!domain.includes(".")) return "Alan adı geçersiz (ör. ornek.com)."
  if (!EMAIL_RE.test(t)) return "E-posta biçimi geçersiz."
  return null
}

/* ═══════════════ KULLANICI ADI ═══════════════ */

export function usernameError(v: string | null | undefined): string | null {
  const t = (v ?? "").trim()
  if (!t) return "Kullanıcı adı boş olamaz."
  if (t.length < 3) return "En az 3 karakter olmalı."
  if (t.length > 30) return "En fazla 30 karakter olabilir."
  if (!/^[A-Za-z0-9._]+$/.test(t)) return "Yalnızca harf, rakam, nokta ve alt çizgi kullanılabilir."
  return null
}

/* ═══════════════ SAYI ═══════════════ */

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export function pct(a: number, b: number): string {
  if (!b) return "—"
  return `%${Math.round((a / b) * 100)}`
}
