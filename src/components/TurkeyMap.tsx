// src/components/TurkeyMap.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// TÜRKİYE HARİTASI — kullanıcı yoğunluğu
//
// ★ Renk skalası LOGARİTMİK. İstanbul'da 40.000, Bayburt'ta 12 kullanıcı
//   varsa doğrusal skalada Bayburt görünmez olur; log ölçek küçük illeri
//   de ayırt edilebilir yapıyor.
//
// ★ Renkler tema vurgu rengiyle uyumlu: karanlıkta beyaz tonları,
//   açıkta siyah tonları (CSS değişkeni üzerinden, opaklıkla).
//
// Üzerine gelince: il adı, sıra ve kullanıcı sayısı. Tıklayınca /sehirler.
// ═══════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { TR_PROVINCES, TR_VIEWBOX } from "@/lib/turkeyMap"
import { fmtNum } from "@/lib/utils"

interface Hover {
  ad: string
  plaka: number
  adet: number
  sira: number | null
  x: number
  y: number
}

export function TurkeyMap({
  data, total,
}: {
  /** şehir → kullanıcı sayısı */
  data: Record<string, number>
  total?: number
}) {
  const router = useRouter()
  const [hover, setHover] = useState<Hover | null>(null)

  /** Sıralama: en kalabalık = 1 */
  const rank = useMemo(() => {
    const list = Object.entries(data)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
    const m = new Map<string, number>()
    list.forEach(([ad], i) => m.set(ad, i + 1))
    return m
  }, [data])

  const max = useMemo(() => Math.max(1, ...Object.values(data)), [data])

  /** Logaritmik yoğunluk → 0..1 */
  function density(n: number): number {
    if (n <= 0) return 0
    return Math.log10(n + 1) / Math.log10(max + 1)
  }

  const toplam = total ?? Object.values(data).reduce((s, v) => s + v, 0)

  return (
    <div className="relative">
      <svg
        viewBox={TR_VIEWBOX}
        className="h-auto w-full"
        role="img"
        aria-label="Türkiye kullanıcı yoğunluğu haritası"
        onMouseLeave={() => setHover(null)}
      >
        <g>
          {TR_PROVINCES.map((p) => {
            const adet = data[p.ad] ?? 0
            const d = density(adet)
            // 0 kullanıcı → çok soluk dolgu; yoğunluk arttıkça vurgu rengi
            const opacity = adet === 0 ? 0.05 : 0.14 + d * 0.72
            const aktif = hover?.ad === p.ad

            return (
              <path
                key={p.plaka}
                d={p.d}
                fill={`rgb(var(--c-accent) / ${opacity})`}
                stroke="rgb(var(--c-bg) / 0.9)"
                strokeWidth={aktif ? 1.6 : 0.8}
                className="cursor-pointer transition-[fill,stroke-width] duration-150"
                style={aktif ? { fill: `rgb(var(--c-accent) / ${Math.min(0.95, opacity + 0.25)})` } : undefined}
                onMouseMove={(e) => {
                  const box = (e.currentTarget.ownerSVGElement?.parentElement as HTMLElement)?.getBoundingClientRect()
                  setHover({
                    ad: p.ad,
                    plaka: p.plaka,
                    adet,
                    sira: rank.get(p.ad) ?? null,
                    x: box ? e.clientX - box.left : 0,
                    y: box ? e.clientY - box.top : 0,
                  })
                }}
                onClick={() => router.push(`/sehirler/${encodeURIComponent(p.ad)}`)}
              >
                <title>{`${p.ad} — ${fmtNum(adet)} kullanıcı`}</title>
              </path>
            )
          })}
        </g>
      </svg>

      {/* ── İpucu ── */}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 min-w-[150px] -translate-x-1/2 -translate-y-full rounded-xl border border-hairline bg-surface/95 px-3 py-2 shadow-pop backdrop-blur"
          style={{ left: hover.x, top: hover.y - 10 }}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] font-semibold text-text">{hover.ad}</span>
            <span className="font-mono text-[10.5px] text-faint">
              {String(hover.plaka).padStart(2, "0")}
            </span>
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            {fmtNum(hover.adet)} kullanıcı
            {toplam > 0 && hover.adet > 0 && (
              <span className="text-faint"> · %{((hover.adet / toplam) * 100).toFixed(1)}</span>
            )}
          </div>
          <div className="text-[11.5px] text-faint">
            {hover.sira ? `${hover.sira}. sırada` : "Kayıtlı kullanıcı yok"}
          </div>
        </div>
      )}

    </div>
  )
}
