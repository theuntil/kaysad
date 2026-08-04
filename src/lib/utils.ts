// src/lib/utils.ts

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ")
}

export function fmtNum(n: number | null | undefined): string {
  const v = n ?? 0
  return v.toLocaleString("tr-TR")
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleString("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—"
  const t = new Date(iso).getTime()
  if (isNaN(t)) return "—"
  const sec = Math.floor((Date.now() - t) / 1000)
  if (sec < 60) return "az önce"
  if (sec < 3600) return `${Math.floor(sec / 60)} dk önce`
  if (sec < 86400) return `${Math.floor(sec / 3600)} sa önce`
  const d = Math.floor(sec / 86400)
  if (d < 30) return `${d} gün önce`
  return fmtDateShort(iso)
}

/** datetime-local input için ISO → "YYYY-MM-DDTHH:mm" */
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "YYYY-MM-DDTHH:mm" → ISO (boşsa null) */
export function fromDatetimeLocal(v: string | null | undefined): string | null {
  if (!v || !v.trim()) return null
  const d = new Date(v)
  if (isNaN(d.getTime())) return null
  return d.toISOString()
}

/** Popup'ın o an gerçekten yayında olup olmadığını hesaplar */
export function popupLiveState(p: {
  is_active: boolean
  start_at: string | null
  end_at: string | null
}): { label: string; tone: "live" | "scheduled" | "expired" | "off" } {
  if (!p.is_active) return { label: "Kapalı", tone: "off" }
  const now = Date.now()
  if (p.start_at && new Date(p.start_at).getTime() > now) return { label: "Planlandı", tone: "scheduled" }
  if (p.end_at && new Date(p.end_at).getTime() < now) return { label: "Süresi doldu", tone: "expired" }
  return { label: "Yayında", tone: "live" }
}
