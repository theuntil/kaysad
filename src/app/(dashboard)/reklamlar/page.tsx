// src/app/(dashboard)/reklamlar/page.tsx
//
// REKLAM VE BOOST
//
// Üstte alan doluluk göstergeleri: her alanın kapasitesi ve kaç aktif
// reklamı olduğu. Alan doluysa yeni teklif onaylansa bile yayına
// alınmıyor — bu yüzden doluluk en görünür yerde.

import Link from "next/link"
import { fetchAdCounts, fetchAds, fetchBoosts } from "@/actions/ad.actions"
import { PageHeader } from "@/components/PageHeader"
import { AdsManager } from "@/components/AdsManager"
import { AdCreate } from "@/components/AdCreate"
import { StatusFilter } from "@/components/StatusFilter"
import { BoostManager } from "@/components/BoostManager"
import { Card, CardTitle, ErrorBox, Stat } from "@/components/ui"
import { fmtNum } from "@/lib/utils"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

// ★ Dokuz sekme fazlaydı. Sık kullanılan dördü sekmede, geri kalanı
//   yanındaki açılır listede — üst satır ferah kaldı.
const TABS = [
  { value: "",        label: "Tümü" },
  { value: "pending", label: "Bekleyen" },
  { value: "active",  label: "Yayında" },
  { value: "boost",   label: "Boost" },
] as const

const DIGER = [
  { value: "approved",     label: "Sırada" },
  { value: "edit_pending", label: "Düzenleme onayı" },
  { value: "paused",       label: "Pasif" },
  { value: "rejected",     label: "Reddedilen" },
  { value: "expired",      label: "Süresi dolan" },
] as const

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; alan?: string }>
}) {
  const sp = await searchParams
  const gecerli = [...TABS.map((t) => t.value), ...DIGER.map((d) => d.value)]
  const durum = (gecerli.includes((sp.durum ?? "") as never) ? sp.durum : "") as string
  const alan = sp.alan ?? ""
  const boostModu = durum === "boost"

  const [{ counts, error: cErr }, { items, error }, { items: boosts, error: bErr }] =
    await Promise.all([
      fetchAdCounts(),
      boostModu ? Promise.resolve({ items: [], error: undefined })
                : fetchAds({ status: durum || null, slot: alan || null, limit: 100 }),
      boostModu ? fetchBoosts(null) : Promise.resolve({ items: [], error: undefined }),
    ])

  function href(next: Partial<{ durum: string; alan: string }>) {
    const p = new URLSearchParams()
    const d = next.durum ?? durum
    const a = next.alan ?? alan
    if (d) p.set("durum", d)
    if (a) p.set("alan", a)
    const s = p.toString()
    return s ? `/reklamlar?${s}` : "/reklamlar"
  }

  return (
    <>
      <PageHeader
        title="Reklamlar"
        /* ★ TEK DÜĞME. Reklam mı boost mu olduğu formun EN BAŞINDA
             seçiliyor — iki ayrı düğme yerine tek akış. */
        action={<AdCreate slots={counts?.alanlar ?? []} />}
      />

      {(error || cErr || bErr) && (
        <div className="mb-5"><ErrorBox>{error ?? cErr ?? bErr}</ErrorBox></div>
      )}

      {/* ── ÖZET ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Bekleyen teklif"
          value={fmtNum(counts?.bekleyen ?? 0)}
          tone={(counts?.bekleyen ?? 0) > 0 ? "danger" : "default"}
        />
        <Stat label="Yayında" value={fmtNum(counts?.aktif ?? 0)} tone="accent" />
        <Stat
          label="Aylık gelir"
          value={`${fmtNum(counts?.aylik_gelir ?? 0)} ₺`}
          tone="info"
        />
        <Stat
          label="Yakında biten"
          value={fmtNum(counts?.yakinda_biten ?? 0)}
          tone={(counts?.yakinda_biten ?? 0) > 0 ? "danger" : "default"}
        />
      </div>

      {/* ── ALAN DOLULUĞU ── */}
      <div className="mb-5">
        <Card>
          <CardTitle>Alan doluluğu</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {(counts?.alanlar ?? []).map((s) => {
              const dolu = s.aktif >= s.capacity
              return (
                <Link
                  key={s.key}
                  href={href({ alan: alan === s.key ? "" : s.key })}
                  className={cn(
                    "rounded-xl border px-3.5 py-3 transition-colors",
                    alan === s.key
                      ? "border-accent/40 bg-accent/10"
                      : "border-hairline bg-raised hover:border-white/20"
                  )}
                >
                  <div className="text-[12.5px] text-muted">{s.ad}</div>
                  <div className="mt-1 flex items-baseline gap-1">
                    <span className={cn(
                      "text-[18px] font-bold tabular-nums",
                      dolu ? "text-danger" : "text-text"
                    )}>
                      {s.aktif}
                    </span>
                    <span className="text-[12px] text-faint">/ {s.capacity}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                    <div
                      className={cn("h-full rounded-full", dolu ? "bg-danger/60" : "bg-accent/55")}
                      style={{ width: `${Math.min(100, (s.aktif / Math.max(1, s.capacity)) * 100)}%` }}
                    />
                  </div>
                </Link>
              )
            })}
          </div>
        </Card>
      </div>

      {/* ── SEKMELER ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="scroll-hint flex gap-1.5 overflow-x-auto">
          {TABS.map((t) => {
            const n =
              t.value === "pending" ? counts?.bekleyen
              : t.value === "active" ? counts?.aktif
              : t.value === "boost" ? (counts?.boost_bekleyen ?? 0) + (counts?.boost_aktif ?? 0)
              : undefined
            return (
              <Link
                key={t.value}
                href={href({ durum: t.value })}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-colors",
                  t.value === durum
                    ? "border-accent/40 bg-accent/10 text-text"
                    : "border-hairline bg-surface text-muted hover:text-text"
                )}
              >
                {t.label}
                {n !== undefined && n > 0 && (
                  <span className="rounded-full bg-white/[0.08] px-1.5 py-[1px] text-[11px] font-bold tabular-nums">
                    {fmtNum(n)}
                  </span>
                )}
              </Link>
            )
          })}
        </div>

        {/* ★ Az kullanılan durumlar açılır listede.
             onChange bir olay işleyicisi olduğu için CLIENT bileşende
             olmak zorunda — sunucu bileşeninden geçirilemiyor. */}
        <div className="ml-auto">
          <StatusFilter durum={durum} alan={alan} options={[...DIGER]} />
        </div>
      </div>

      {boostModu ? <BoostManager items={boosts} /> : <AdsManager items={items} counts={counts} />}
    </>
  )
}
