// src/components/PhonePreview.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// PUSH / BİLDİRİM ÖNİZLEMESİ
//
// Kanal seçimine göre TELEFONUN DURUMU değişiyor:
//
//   push   → KİLİT EKRANI: saat, tarih, bildirim balonu
//   inapp  → UYGULAMA AÇIK: bildirimler sekmesinde yeni satır
//   both   → ANA EKRAN: uygulama ikonları, Kays'ın üstünde okunmamış
//            rozeti + ekranın tepesinde düşen bildirim banner'ı
//
// ★ Ekran içi renkler tema değişkenlerinden BAĞIMSIZ (sabit). Açık temada
//   beyaz yazının kaybolması sorunu bu yüzden yok.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react"
import { PhoneFrame, AppIcon } from "@/components/PhoneFrame"
import { cn } from "@/lib/utils"

type Platform = "ios" | "android"

const OTHER_APPS = [
  { ad: "Mesajlar", renk: "#34c759" },
  { ad: "Takvim", renk: "#ff3b30" },
  { ad: "Fotoğraf", renk: "#ff9500" },
  { ad: "Ayarlar", renk: "#8e8e93" },
  { ad: "Harita", renk: "#30b0c7" },
  { ad: "Müzik", renk: "#fa2f55" },
  { ad: "Notlar", renk: "#ffd60a" },
]

/** Kilit ekranı / ana ekrandaki bildirim balonu */
function NotificationCard({
  title, body, platform, urgent, compact = false,
}: {
  title: string
  body: string
  platform: Platform
  urgent?: boolean
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        "backdrop-blur-xl",
        platform === "ios" ? "rounded-[18px] bg-[rgba(255,255,255,0.18)]" : "rounded-[16px] bg-[#2a2a2e]/95",
        compact ? "p-2.5" : "p-3"
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-[8px] bg-[#ffffff]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/kays1.png" alt="" className="h-[76%] w-[76%] object-contain" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-[13px] font-semibold text-[#ffffff]">{title}</span>
            <span className="shrink-0 text-[10.5px] text-[rgba(255,255,255,0.6)]">şimdi</span>
          </div>
          <p className="mt-0.5 line-clamp-3 text-[12px] leading-snug text-[rgba(255,255,255,0.9)]">{body}</p>
        </div>
      </div>
      {urgent && (
        <div className="mt-2 border-t border-[rgba(255,255,255,0.15)] pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#ff9f0a]">
          Zaman duyarlı
        </div>
      )}
    </div>
  )
}

export function PhonePreview({
  title, body, channel, urgent = false, unread = 3,
}: {
  title: string
  body: string
  channel: "both" | "inapp" | "push"
  urgent?: boolean
  unread?: number
}) {
  // ★ iPhone/Android seçici kaldırıldı — iki görünüm arasında anlamlı
  //   bir fark yoktu, sadece yer kaplıyordu. Tek görünüm kullanılıyor.
  const platform: Platform = "ios"
  const [clock, setClock] = useState("")

  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString("tr", { hour: "2-digit", minute: "2-digit" }))
    t()
    const i = setInterval(t, 30_000)
    return () => clearInterval(i)
  }, [])

  const govde = body.trim() || "Mesaj metni burada görünecek."
  const baslik = title.trim() || "Kays"
  const tarih = new Date().toLocaleDateString("tr", { weekday: "long", day: "numeric", month: "long" })

  return (
    <div className="space-y-3">

      <PhoneFrame>
        {/* ══════════ KİLİT EKRANI (sadece push) ══════════ */}
        {channel === "push" && (
          <div
            className="flex h-full flex-col px-3"
            style={{ background: "linear-gradient(170deg,#1b2340 0%,#131a2f 45%,#0d1020 100%)" }}
          >
            <div className="mt-6 text-center">
              <div className="text-[12px] font-medium text-[rgba(255,255,255,0.6)]">{tarih}</div>
              <div className={cn(
                "text-[#ffffff]",
                platform === "ios"
                  ? "text-[58px] font-light leading-none tracking-tight"
                  : "text-[48px] font-normal leading-none"
              )}>
                {clock}
              </div>
            </div>

            <div className="mt-6 animate-fade-up">
              <NotificationCard title={baslik} body={govde} platform={platform} urgent={urgent} />
            </div>

            <div className="mt-auto flex items-center justify-between px-6 pb-8 text-[rgba(255,255,255,0.7)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                <path d="M12 18.5A6.5 6.5 0 1 1 18.5 12" /><path d="M12 6v6l4 2" />
              </svg>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-5 w-5">
                <rect x="4" y="7" width="16" height="12" rx="3" /><circle cx="12" cy="13" r="3" />
              </svg>
            </div>
          </div>
        )}

        {/* ══════════ UYGULAMA AÇIK (sadece uygulama içi) ══════════ */}
        {channel === "inapp" && (
          <div className="flex h-full flex-col" style={{ background: "#0b0b0f" }}>
            {/* Uygulama başlığı */}
            <div className="flex items-center gap-2.5 border-b border-[rgba(255,255,255,0.1)] px-4 pb-2.5 pt-1">
              <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-[7px] bg-[#ffffff]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/kays1.png" alt="" className="h-[76%] w-[76%] object-contain" />
              </div>
              <span className="text-[15px] font-semibold text-[#ffffff]">Bildirimler</span>
              <span className="ml-auto rounded-full bg-[rgba(255,255,255,0.1)] px-2 py-[2px] text-[10.5px] font-semibold text-[rgba(255,255,255,0.8)]">
                {unread} yeni
              </span>
            </div>

            {/* Bildirim listesi */}
            <div className="flex-1 space-y-1.5 overflow-hidden px-3 pt-3">
              <div className="animate-fade-up rounded-[14px] bg-[rgba(255,255,255,0.09)] p-3">
                <div className="flex items-start gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0a84ff]" />
                  <div className="min-w-0">
                    <p className="line-clamp-4 text-[12.5px] leading-snug text-[#ffffff]">{govde}</p>
                    <span className="mt-1 block text-[10.5px] text-[rgba(255,255,255,0.45)]">şimdi</span>
                  </div>
                </div>
              </div>

              {["Ahmet gönderini beğendi", "Etkinliğe 3 yeni katılım var"].map((t, i) => (
                <div key={i} className="rounded-[14px] bg-[rgba(255,255,255,0.04)] p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-transparent" />
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] text-[rgba(255,255,255,0.55)]">{t}</p>
                      <span className="mt-1 block text-[10.5px] text-[rgba(255,255,255,0.3)]">
                        {i === 0 ? "2 saat önce" : "dün"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Sekme çubuğu */}
            <div className="flex items-center justify-around border-t border-[rgba(255,255,255,0.1)] px-4 pb-7 pt-2.5">
              {["Ana", "Keşfet", "Ekle", "Bildirim", "Profil"].map((t) => (
                <span
                  key={t}
                  className={cn(
                    "text-[9.5px]",
                    t === "Bildirim" ? "font-semibold text-[#ffffff]" : "text-[rgba(255,255,255,0.35)]"
                  )}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ══════════ ANA EKRAN (ikisi de) ══════════ */}
        {channel === "both" && (
          <div
            className="relative flex h-full flex-col"
            style={{ background: "linear-gradient(165deg,#2b2350 0%,#1a1b35 50%,#101020 100%)" }}
          >
            {/* Düşen bildirim */}
            <div className="animate-fade-up px-2.5 pt-1">
              <NotificationCard title={baslik} body={govde} platform={platform} urgent={urgent} compact />
            </div>

            {/* Uygulama ızgarası */}
            <div className="mt-5 grid grid-cols-4 gap-x-3 gap-y-4 px-4">
              <div className="flex flex-col items-center gap-1">
                <AppIcon size={50} badge={unread} />
                <span className="text-[9.5px] text-[rgba(255,255,255,0.85)]">Kays</span>
              </div>
              {OTHER_APPS.map((a) => (
                <div key={a.ad} className="flex flex-col items-center gap-1">
                  <div
                    className="h-[50px] w-[50px] rounded-[12px] opacity-70"
                    style={{ background: a.renk }}
                  />
                  <span className="text-[9.5px] text-[rgba(255,255,255,0.6)]">{a.ad}</span>
                </div>
              ))}
            </div>

            {/* Dock */}
            <div className="mt-auto mb-7 px-3">
              <div className="flex items-center justify-around rounded-[24px] bg-[rgba(255,255,255,0.1)] p-2.5 backdrop-blur">
                {["#0a84ff", "#34c759", "#ff9500", "#5e5ce6"].map((c) => (
                  <div key={c} className="h-[46px] w-[46px] rounded-[11px] opacity-80" style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </PhoneFrame>
    </div>
  )
}
