// src/app/(dashboard)/icerikler/page.tsx
//
// İÇERİKLER — gönderi / ilan / indirim / etkinlik
//
// Tek sayfada dört sekme. En yeni kayıt en üstte. Karta tıklayınca
// düzenleme ve silme açılıyor (UserContent bileşeninin aynısı).

import Link from "next/link"
import { fetchAllContent, fetchContentTotals } from "@/actions/content.actions"
import { PageHeader } from "@/components/PageHeader"
import { ContentBrowser } from "@/components/ContentBrowser"
import { ErrorBox, Input, Button } from "@/components/ui"
import { fmtNum } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { ContentKind } from "@/lib/types.v3"

export const dynamic = "force-dynamic"

const TABS: { value: ContentKind; label: string; key: string }[] = [
  { value: "post",     label: "Gönderiler",  key: "post" },
  { value: "listing",  label: "İlanlar",     key: "listing" },
  { value: "discount", label: "İndirimler",  key: "discount" },
  { value: "event",    label: "Etkinlikler", key: "event" },
]

export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string; q?: string; sayfa?: string }>
}) {
  const sp = await searchParams
  const tip = (TABS.find((t) => t.value === sp.tip)?.value ?? "post") as ContentKind
  const q = sp.q ?? ""
  const sayfa = Math.max(1, Number(sp.sayfa ?? "1") || 1)
  const limit = 40

  const [{ result, error }, totals] = await Promise.all([
    fetchAllContent({ kind: tip, query: q, limit, offset: (sayfa - 1) * limit }),
    fetchContentTotals(),
  ])

  function href(next: Partial<{ tip: string; q: string; sayfa: number }>) {
    const p = new URLSearchParams()
    const t = next.tip ?? tip
    const qq = next.q ?? q
    const s = next.sayfa ?? 1
    if (t !== "post") p.set("tip", t)
    if (qq) p.set("q", qq)
    if (s > 1) p.set("sayfa", String(s))
    const str = p.toString()
    return str ? `/icerikler?${str}` : "/icerikler"
  }

  const toplam = result?.toplam ?? 0

  return (
    <>
      <PageHeader title="İçerikler" />

      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}

      <div className="scroll-hint -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const n = totals[t.key as ContentKind]
          return (
            <Link
              key={t.value}
              href={href({ tip: t.value, sayfa: 1 })}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-colors",
                t.value === tip
                  ? "border-accent/40 bg-accent/10 text-text"
                  : "border-hairline bg-surface text-muted hover:text-text"
              )}
            >
              {t.label}
              {n !== null && n !== undefined && (
                <span className="rounded-full bg-white/[0.08] px-1.5 py-[1px] text-[11px] font-bold tabular-nums">
                  {fmtNum(n)}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      <form action="/icerikler" method="get" className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Başlık, açıklama, marka, model, adres, etiket ya da ID" />
        {tip !== "post" && <input type="hidden" name="tip" value={tip} />}
        <Button type="submit" variant="secondary">Ara</Button>
      </form>

      <ContentBrowser kind={tip} rows={result?.satirlar ?? []} tablo={result?.tablo ?? ""} />

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-faint">
          {fmtNum(toplam)} kayıt · sayfa {sayfa}
        </span>
        <div className="flex gap-2">
          {sayfa > 1 && (
            <Link href={href({ sayfa: sayfa - 1 })}>
              <Button variant="secondary" size="sm">← Önceki</Button>
            </Link>
          )}
          {(result?.satirlar?.length ?? 0) === limit && (
            <Link href={href({ sayfa: sayfa + 1 })}>
              <Button variant="secondary" size="sm">Sonraki →</Button>
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
