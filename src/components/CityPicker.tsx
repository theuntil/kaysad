// src/components/CityPicker.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// ŞEHİR SEÇİCİ — 81 İL
//
// ★ V3'te değişen: eskiden sadece veritabanında kaydı olan şehirler
//   listelenirdi. Artık 81 il her zaman seçilebilir. Yanındaki sayı o
//   ildeki aktif kullanıcı sayısı — "0" olan illeri de seçebilirsin
//   (henüz kullanıcı yok ama yarın olacak).
//
// Kalabalık hissini azaltmak için üç kolaylık var:
//   • Arama (Türkçe karakter duyarsız: "sanliurfa" → Şanlıurfa)
//   • Bölge ile toplu seçim (Marmara'nın tamamı gibi)
//   • Sadece kullanıcısı olan illeri göster süzgeci
// ═══════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react"
import { CITIES, REGIONS, citiesOfRegion, normalizeTr, type Region } from "@/lib/cities"
import { Badge, Button, Chip, Input, Switch } from "@/components/ui"
import { cn } from "@/lib/utils"

export function CityPicker({
  value, onChange, counts,
}: {
  /** Boş dizi = TÜM ŞEHİRLER (filtre yok) */
  value: string[]
  onChange: (v: string[]) => void
  /** şehir → aktif kullanıcı sayısı */
  counts?: Record<string, number>
}) {
  const [q, setQ] = useState("")
  const [onlyPopulated, setOnlyPopulated] = useState(false)
  const [open, setOpen] = useState(false)

  const selected = useMemo(() => new Set(value), [value])

  const list = useMemo(() => {
    const nq = normalizeTr(q)
    return CITIES
      .filter((c) => {
        if (onlyPopulated && !selected.has(c.ad) && (counts?.[c.ad] ?? 0) === 0) return false
        if (!nq) return true
        return normalizeTr(c.ad).includes(nq) || String(c.plaka) === nq
      })
      .sort((a, b) => a.ad.localeCompare(b.ad, "tr"))
  }, [q, onlyPopulated, counts, selected])

  function toggle(ad: string) {
    onChange(selected.has(ad) ? value.filter((v) => v !== ad) : [...value, ad])
  }

  function toggleRegion(r: Region) {
    const cities = citiesOfRegion(r)
    const hepsiVar = cities.every((c) => selected.has(c))
    onChange(hepsiVar
      ? value.filter((v) => !cities.includes(v))
      : Array.from(new Set([...value, ...cities])))
  }

  const secilenKullanici = value.reduce((s, c) => s + (counts?.[c] ?? 0), 0)

  return (
    <div className="space-y-3">
      {/* ── Özet satırı ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-raised px-3.5 py-3">
        <div className="min-w-0">
          {value.length === 0 ? (
            <div className="flex items-center gap-2">
              <Badge tone="live">Tüm Türkiye</Badge>
              <span className="text-[12.5px] text-muted">81 ilin tamamı</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge tone="scheduled">{value.length} il seçili</Badge>
              {counts && (
                <span className="text-[12.5px] tabular-nums text-muted">
                  ≈ {secilenKullanici.toLocaleString("tr")} kullanıcı
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {value.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>Temizle</Button>
          )}
          <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)}>
            {open ? "Kapat" : value.length ? "Düzenle" : "İl seç"}
          </Button>
        </div>
      </div>

      {/* ── Seçili iller (kapalıyken de görünsün) ── */}
      {value.length > 0 && !open && (
        <div className="flex flex-wrap gap-1.5">
          {value.slice(0, 14).map((c) => (
            <Chip key={c} tone="accent" onRemove={() => toggle(c)}>{c}</Chip>
          ))}
          {value.length > 14 && <Chip>+{value.length - 14} il</Chip>}
        </div>
      )}

      {/* ── Seçim paneli ── */}
      {open && (
        <div className="animate-fade-up space-y-3 rounded-xl border border-border bg-surface p-3.5">
          <Input
            placeholder="İl ara — ör. Ankara ya da 06"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <Switch
            checked={onlyPopulated}
            onChange={setOnlyPopulated}
            label="Sadece kullanıcısı olan iller"
          />

          {/* Bölge kısayolları */}
          <div className="flex flex-wrap gap-1.5">
            {REGIONS.map((r) => {
              const cities = citiesOfRegion(r)
              const tamSecili = cities.every((c) => selected.has(c))
              const kismi = !tamSecili && cities.some((c) => selected.has(c))
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => toggleRegion(r)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                    tamSecili ? "border-accent/40 bg-accent/12 text-accent"
                      : kismi ? "border-accent/25 bg-accent/[0.05] text-accent/80"
                      : "border-border bg-raised text-muted hover:text-text"
                  )}
                >
                  {r}
                </button>
              )
            })}
          </div>

          {/* İl ızgarası */}
          <div className="max-h-[280px] overflow-y-auto rounded-xl border border-border">
            {list.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12.5px] text-faint">
                Aramaya uyan il yok.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-1 p-1.5 sm:grid-cols-3">
                {list.map((c) => {
                  const on = selected.has(c.ad)
                  const adet = counts?.[c.ad] ?? 0
                  return (
                    <button
                      key={c.ad}
                      type="button"
                      onClick={() => toggle(c.ad)}
                      aria-pressed={on}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                        on ? "bg-accent/12 ring-1 ring-inset ring-accent/30" : "hover:bg-white/[0.05]"
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn(
                          "shrink-0 font-mono text-[10.5px] tabular-nums",
                          on ? "text-accent/70" : "text-faint"
                        )}>
                          {String(c.plaka).padStart(2, "0")}
                        </span>
                        <span className={cn("truncate text-[13px]", on ? "font-semibold text-accent" : "text-text")}>
                          {c.ad}
                        </span>
                      </span>
                      {counts && (
                        <span className={cn(
                          "shrink-0 text-[11px] tabular-nums",
                          adet === 0 ? "text-faint" : on ? "text-accent/80" : "text-muted"
                        )}>
                          {adet}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => onChange(CITIES.map((c) => c.ad))}>
              81 ili seç
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onChange([])}>
              Seçimi temizle (tüm Türkiye)
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
