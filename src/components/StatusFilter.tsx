"use client"

// Sunucu bileşeninden onChange geçirilemediği için ayrı client bileşen.
// Seçim yapılınca adres çubuğunu güncelliyor.

import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"

export function StatusFilter({
  durum, alan, options,
}: {
  durum: string
  alan: string
  options: { value: string; label: string }[]
}) {
  const router = useRouter()
  const secili = options.some((o) => o.value === durum)

  return (
    <select
      value={secili ? durum : ""}
      onChange={(e) => {
        const p = new URLSearchParams()
        if (e.target.value) p.set("durum", e.target.value)
        if (alan) p.set("alan", alan)
        const s = p.toString()
        router.push(s ? `/reklamlar?${s}` : "/reklamlar")
      }}
      className={cn(
        "h-[38px] cursor-pointer rounded-xl border px-3 text-[13px] font-medium transition-colors",
        secili
          ? "border-accent/40 bg-accent/10 text-text"
          : "border-hairline bg-surface text-muted hover:text-text"
      )}
    >
      <option value="">Diğer durumlar…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}
