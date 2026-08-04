// src/app/(dashboard)/reports/page.tsx
//
// ŞİKÂYETLER
//
// Üstte iki asıl sayı: CEVAPLANMAMIŞ ve TOPLAM. Altında durum sekmeleri,
// arama ve liste. Cevaplanmamışlar her zaman listenin başında.

import Link from "next/link"
import { fetchReportCounts, fetchReports } from "@/actions/report.actions"
import { PageHeader } from "@/components/PageHeader"
import { ReportsList } from "@/components/ReportsList"
import { Button, ErrorBox, Input, Stat } from "@/components/ui"
import { fmtNum } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { ReportStatus } from "@/lib/types.v3"

export const dynamic = "force-dynamic"

const TABS = [
  { value: "",          label: "Tümü" },
  { value: "pending",   label: "Bekleyen" },
  { value: "reviewing", label: "İnceleniyor" },
  { value: "resolved",  label: "Kabul edilen" },
  { value: "dismissed", label: "Reddedilen" },
] as const

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; q?: string; sayfa?: string }>
}) {
  const sp = await searchParams
  const durum = (TABS.find((t) => t.value === sp.durum)?.value ?? "") as ReportStatus | ""
  const q = sp.q ?? ""
  const sayfa = Math.max(1, Number(sp.sayfa ?? "1") || 1)
  const limit = 50

  const [{ counts, error: cErr }, { items, error }] = await Promise.all([
    fetchReportCounts(),
    fetchReports({ status: durum || null, query: q, limit, offset: (sayfa - 1) * limit }),
  ])


  function href(next: Partial<{ durum: string; q: string; sayfa: number }>) {
    const p = new URLSearchParams()
    const d = next.durum ?? durum
    const qq = next.q ?? q
    const s = next.sayfa ?? 1
    if (d) p.set("durum", d)
    if (qq) p.set("q", qq)
    if (s > 1) p.set("sayfa", String(s))
    const str = p.toString()
    return str ? `/reports?${str}` : "/reports"
  }

  return (
    <>
      <PageHeader
        title="Şikâyetler"
        description="Kullanıcı bildirimlerini incele; kabul et, reddet ya da kaydı sil."
      />

      {(error || cErr) && <div className="mb-5"><ErrorBox>{error ?? cErr}</ErrorBox></div>}

      {/* ── ÜST SAYILAR ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Cevaplanmamış"
          value={fmtNum(counts?.cevaplanmamis ?? 0)}
          tone={(counts?.cevaplanmamis ?? 0) > 0 ? "danger" : "accent"}
        />
        <Stat label="Toplam şikâyet" value={fmtNum(counts?.toplam ?? 0)} />
        <Stat
          label="Kabul edilen"
          value={fmtNum(counts?.cozuldu ?? 0)}
          tone="accent"
        />
        <Stat
          label="Son 24 saat"
          value={fmtNum(counts?.son_24_saat ?? 0)}
          tone="info"
        />
      </div>

      {/* ── ARAMA + SEKMELER ── */}
      <form action="/reports" method="get" className="mb-3 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Kullanıcı adı, sebep, açıklama ya da şikâyet ID" />
        {durum && <input type="hidden" name="durum" value={durum} />}
        <Button type="submit" variant="secondary">Ara</Button>
      </form>

      <div className="scroll-hint -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const n =
            t.value === "" ? counts?.toplam
            : t.value === "pending" ? counts?.bekleyen
            : t.value === "reviewing" ? counts?.inceleniyor
            : t.value === "resolved" ? counts?.cozuldu
            : counts?.reddedildi
          return (
            <Link
              key={t.value}
              href={href({ durum: t.value, sayfa: 1 })}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-colors",
                t.value === durum
                  ? "border-accent/40 bg-accent/10 text-text"
                  : "border-hairline bg-surface text-muted hover:text-text"
              )}
            >
              {t.label}
              {n !== undefined && (
                <span className="rounded-full bg-white/[0.08] px-1.5 py-[1px] text-[11px] font-bold tabular-nums">
                  {fmtNum(n ?? 0)}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <ReportsList items={items} />

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-faint">
          Sayfa {sayfa} · {items.length} kayıt
        </span>
        <div className="flex gap-2">
          {sayfa > 1 && (
            <Link href={href({ sayfa: sayfa - 1 })}>
              <Button variant="secondary" size="sm">← Önceki</Button>
            </Link>
          )}
          {items.length === limit && (
            <Link href={href({ sayfa: sayfa + 1 })}>
              <Button variant="secondary" size="sm">Sonraki →</Button>
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
