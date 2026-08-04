// src/components/ThemeToggle.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// TEMA ANAHTARI
//
// İki aşamalı çalışır:
//   1. <html> sınıfını ANINDA değiştirir → kullanıcı beklemez, sayfa
//      yeniden yüklenmez, form içindeki yazılar kaybolmaz.
//   2. Arka planda çereze yazar → sonraki sayfa açılışında sunucu doğru
//      temayı basar, "flash" olmaz.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState, useTransition } from "react"
import { setThemeAction } from "@/actions/theme.actions"
import { cn } from "@/lib/utils"
import type { Theme } from "@/lib/theme"

const Sun = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" className="h-[17px] w-[17px]">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </svg>
)

const Moon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
    <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.5 6.5 0 0 0 9.8 9.8z" />
  </svg>
)

export function ThemeToggle({ initial, compact = false }: { initial: Theme; compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(initial)
  const [, startTransition] = useTransition()

  // Geçiş animasyonunu sadece kullanıcı tıkladığında aç — ilk yüklemede
  // her elemanın rengi "kayarak" gelmesin.
  useEffect(() => {
    const root = document.documentElement
    root.classList.add("theme-anim")
    return () => root.classList.remove("theme-anim")
  }, [])

  function apply(next: Theme) {
    setTheme(next)
    const root = document.documentElement
    root.classList.toggle("light", next === "light")
    // Mobil tarayıcı üst çubuğu da temaya uysun
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "light" ? "#f8f9fb" : "#0b0b0d")
    startTransition(() => { void setThemeAction(next) })
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => apply(theme === "dark" ? "light" : "dark")}
        aria-label={theme === "dark" ? "Açık temaya geç" : "Karanlık temaya geç"}
        title={theme === "dark" ? "Açık tema" : "Karanlık tema"}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition-colors hover:bg-white/[0.06] hover:text-text"
      >
        {theme === "dark" ? Sun : Moon}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-1 rounded-xl border border-border bg-raised p-1">
      {(["dark", "light"] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => apply(t)}
          aria-pressed={theme === t}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            theme === t ? "bg-accent/15 text-accent" : "text-muted hover:text-text"
          )}
        >
          {t === "dark" ? Moon : Sun}
          {t === "dark" ? "Karanlık" : "Açık"}
        </button>
      ))}
    </div>
  )
}
