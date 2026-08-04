// src/components/LiveCounters.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// CANLI SAYAÇLAR
//
// ★ Toplam kullanıcı 5 saniyede bir yenilenir; sayı DEĞİŞİRSE animasyonlu
//   geçiş olur (eski değer yukarı kayıp solar, yeni değer alttan gelir) ve
//   yanında artış miktarı kısa süre belirir.
//
// ★ Yenileme sadece SEKME ÖNDEYSE yapılır (document.hidden kontrolü).
//   Arkada duran sekmenin veritabanına 5 saniyede bir sorgu atması
//   gereksiz yük; sekmeye dönünce hemen bir kez yeniliyor.
//
// ★ Sayaç sorgusu hafif (`admin_live_counts`): sadece count(*). Ağır olan
//   ana sayfa sorgusu bir kez, sunucuda çalışıyor.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react"
import { fetchLiveCounts, type LiveCounts } from "@/actions/admin.actions"
import { fmtNum } from "@/lib/utils"
import { cn } from "@/lib/utils"

const Icon = {
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
    </svg>
  ),
  post: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M3 15l4-4 3 3 4-5 7 7" />
      <circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  ),
  listing: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M20.6 13.4 12 22l-9-9V4a1 1 0 0 1 1-1h9l7.6 7.6a2 2 0 0 1 0 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </svg>
  ),
  discount: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M19 5 5 19" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" />
    </svg>
  ),
  device: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" />
    </svg>
  ),
  event: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="4" width="18" height="17" rx="2.5" /><path d="M8 2v4M16 2v4M3 10h18" />
    </svg>
  ),
}

/** Sayı değişince yukarı kayan geçiş */
function AnimatedNumber({ value }: { value: number | null }) {
  const [display, setDisplay] = useState<number | null>(value)
  const [delta, setDelta] = useState<number | null>(null)
  const [anim, setAnim] = useState(false)
  const prev = useRef<number | null>(value)

  useEffect(() => {
    if (value === null) { setDisplay(null); return }
    if (prev.current === null) { prev.current = value; setDisplay(value); return }
    if (value === prev.current) return

    const fark = value - prev.current
    prev.current = value
    setAnim(true)
    setDelta(fark)

    const t1 = setTimeout(() => { setDisplay(value); setAnim(false) }, 180)
    const t2 = setTimeout(() => setDelta(null), 2600)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [value])

  return (
    <span className="relative inline-flex items-baseline gap-2">
      <span
        className={cn(
          "text-2xl font-bold tabular-nums tracking-tight text-text transition-all duration-200",
          anim && "-translate-y-1.5 opacity-0"
        )}
      >
        {display === null ? "—" : fmtNum(display)}
      </span>
      {delta !== null && delta !== 0 && (
        <span
          className={cn(
            "animate-fade-up text-[12px] font-semibold tabular-nums",
            delta > 0 ? "text-accent" : "text-danger"
          )}
        >
          {delta > 0 ? `+${delta}` : delta}
        </span>
      )}
    </span>
  )
}

// ★ Tüm sayaç kartları AYNI tasarım — "canlı" rozeti ve alt açıklama yok.
function Cell({
  icon, label, value,
}: {
  icon: React.ReactNode
  label: string
  value: number | null
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06] text-muted">
          {icon}
        </span>
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-faint">{label}</span>
      </div>
      <AnimatedNumber value={value} />
    </div>
  )
}

export function LiveCounters({ initial }: { initial: LiveCounts }) {
  const [c, setC] = useState<LiveCounts>(initial)

  useEffect(() => {
    let iptal = false

    async function tick() {
      // ★ Sekme arkadaysa sorgu atma
      if (typeof document !== "undefined" && document.hidden) return
      const r = await fetchLiveCounts()
      if (!iptal && r) setC(r)
    }

    const timer = setInterval(tick, 5000)

    // Sekmeye dönünce hemen yenile
    function onVisible() { if (!document.hidden) void tick() }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      iptal = true
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [])

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
      <Cell icon={Icon.users}    label="Toplam kullanıcı" value={c.kullanici} />
      <Cell icon={Icon.device}   label="Toplam cihaz"     value={c.cihaz ?? null} />
      <Cell icon={Icon.post}     label="Gönderi"  value={c.post} />
      <Cell icon={Icon.listing}  label="İlan"     value={c.ilan} />
      <Cell icon={Icon.discount} label="İndirim"  value={c.indirim} />
      <Cell icon={Icon.event}    label="Etkinlik" value={c.etkinlik} />
    </div>
  )
}
