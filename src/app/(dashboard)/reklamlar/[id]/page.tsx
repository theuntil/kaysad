// src/app/(dashboard)/reklamlar/[id]/page.tsx
//
// REKLAM DETAYI — teklif geçmişi, düzenleme talepleri, istatistik

import Link from "next/link"
import { notFound } from "next/navigation"
import { fetchAdDetail } from "@/actions/ad.actions"
import { PageHeader } from "@/components/PageHeader"
import { AdEditDecision } from "@/components/AdEditDecision"
import { AdEditPanel } from "@/components/AdEditPanel"
import {
  Avatar, Badge, Bar, Button, Card, CardTitle, EmptyState, ErrorBox, KeyValue, Stat,
} from "@/components/ui"
import { fmtDate, fmtNum, timeAgo } from "@/lib/utils"
import { panelGorsel } from "@/lib/storage-url"

export const dynamic = "force-dynamic"

interface Detail {
  kampanya: Record<string, unknown> | null
  reklamveren: Record<string, unknown> | null
  teklifler: Record<string, unknown>[]
  duzenlemeler: Record<string, unknown>[]
  istatistik: {
    gosterim: number; tiklama: number
    gunluk: { gun: string; gosterim: number; tiklama: number }[]
  }
}

export default async function AdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { detail, error } = await fetchAdDetail(id)

  if (error) {
    return (
      <>
        <PageHeader back={{ href: "/reklamlar", label: "Reklamlar" }}
        title="Reklam detayı" />
        <ErrorBox>{error}</ErrorBox>
      </>
    )
  }

  const d = detail as Detail | null
  if (!d?.kampanya) notFound()

  const c = d.kampanya
  const rv = d.reklamveren
  const ist = d.istatistik
  const maxGun = Math.max(1, ...(ist?.gunluk ?? []).map((g) => g.gosterim))
  const ctr = ist && ist.gosterim > 0 ? ((ist.tiklama / ist.gosterim) * 100).toFixed(1) : "0.0"

  return (
    <>
      <PageHeader
        title={String(c.title ?? "Reklam")}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gösterim" value={fmtNum(ist?.gosterim ?? 0)} />
        <Stat label="Tıklama" value={fmtNum(ist?.tiklama ?? 0)} />
        <Stat label="Tıklanma oranı" value={`${ctr}%`} tone="accent" />
        <Stat
          label="Kalan gün"
          value={c.kalan_gun !== null && c.kalan_gun !== undefined ? String(c.kalan_gun) : "—"}
          tone={typeof c.kalan_gun === "number" && c.kalan_gun <= 7 ? "danger" : "default"}
        />
      </div>

      {/* ── DÜZENLEME ── */}
      <div className="mb-5">
        <AdEditPanel
          kampanya={{
            id: String(c.id),
            title: String(c.title ?? ""),
            description: (c.description as string | null) ?? null,
            image_url: (c.image_url as string | null) ?? null,
            logo_url: (c.logo_url as string | null) ?? null,
            target_value: (c.target_value as string | null) ?? null,
            monthly_price: Number(c.monthly_price ?? 0),
            months: Number(c.months ?? 1),
            status: String(c.status ?? ""),
          }}
        />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        {/* İçerik */}
        <Card className="lg:col-span-2">
          <CardTitle>Reklam içeriği</CardTitle>
          {/* ★ panelGorsel: görsel panelin kendi alan adı üzerinden
              geçiyor. Adreste "reklam" kelimesi kalmadığı için reklam
              engelleyici eklentiler artık engellemiyor. */}
          {c.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={String(panelGorsel(String(c.image_url)))}
              alt=""
              className="mb-3 max-h-[280px] w-full rounded-xl border border-hairline object-contain"
            />
          ) : null}
          <div className="mb-3 flex items-center gap-2">
            {c.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={String(panelGorsel(String(c.logo_url)))} alt="" className="h-8 w-8 rounded object-contain" />
            ) : null}
            <span className="text-[15px] font-semibold text-text">{String(c.title ?? "")}</span>
          </div>
          {c.description ? (
            <p className="text-[13px] leading-relaxed text-muted">{String(c.description)}</p>
          ) : null}

          <div className="mt-4 border-t border-hairline pt-3">
            <KeyValue label="Alan" value={String(c.slot_ad ?? c.slot_key ?? "—")} />
            <KeyValue
              label="Yönlendirme"
              value={c.target_value ? "Web adresi" : "Yönlendirme yok"}
            />
            {c.target_value ? <KeyValue label="Adres" value={String(c.target_value)} mono /> : null}
            <KeyValue label="Süre" value={`${c.months} ay`} />
            <KeyValue label="Aylık" value={`${fmtNum(Number(c.monthly_price ?? 0))} ₺`} />
            <KeyValue label="Toplam" value={`${fmtNum(Number(c.total_price ?? 0))} ₺`} />
            <KeyValue label="Başlangıç" value={c.starts_at ? fmtDate(String(c.starts_at)) : "—"} />
            <KeyValue label="Bitiş" value={c.ends_at ? fmtDate(String(c.ends_at)) : "—"} />
          </div>
        </Card>

        {/* Reklam veren */}
        <Card>
          <CardTitle>Reklam veren</CardTitle>
          {rv ? (
            <>
              <div className="mb-3 flex items-center gap-3">
                <Avatar url={rv.avatar_url as string | null} name={rv.username as string | null} size={44} />
                <div className="min-w-0">
                  <Link
                    href={`/kullanicilar/${rv.id}`}
                    className="block truncate text-[14px] font-semibold text-text hover:text-accent"
                  >
                    {String(rv.username ?? "—")}
                  </Link>
                  <span className="block truncate text-[12px] text-muted">
                    {String(rv.business_name ?? rv.name ?? "")}
                  </span>
                </div>
              </div>
              <KeyValue label="E-posta" value={String(rv.email ?? "—")} mono />
              <KeyValue label="Telefon" value={String(rv.phone ?? "—")} mono />
              <KeyValue label="Şehir" value={String(rv.sehir ?? "—")} />
              <div className="mt-3">
                <Link href={`/kullanicilar/${rv.id}`}>
                  <Button variant="secondary" size="sm" className="w-full">Profili aç</Button>
                </Link>
              </div>
            </>
          ) : (
            <EmptyState title="Reklam veren bulunamadı" />
          )}
        </Card>
      </div>

      {/* Düzenleme talepleri */}
      {d.duzenlemeler.filter((e) => e.status === "pending").length > 0 && (
        <div className="mb-5">
          <Card>
            <CardTitle>Onay bekleyen düzenlemeler</CardTitle>
            <AdEditDecision
              edits={d.duzenlemeler.filter((e) => e.status === "pending") as never}
              campaign={c as never}
            />
          </Card>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Teklif geçmişi */}
        <Card>
          <CardTitle>Teklif geçmişi</CardTitle>
          {d.teklifler.length === 0 ? (
            <EmptyState title="Teklif kaydı yok" />
          ) : (
            <ul className="space-y-2">
              {d.teklifler.map((o) => (
                <li
                  key={String(o.id)}
                  className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{String(o.offer_no)}. teklif</Badge>
                    <Badge tone={
                      o.status === "accepted" ? "live"
                      : o.status === "rejected" ? "off" : "expired"
                    }>
                      {o.status === "accepted" ? "Kabul"
                        : o.status === "rejected" ? "Red" : "Bekliyor"}
                    </Badge>
                    <span className="ml-auto text-[13px] font-semibold tabular-nums text-text">
                      {fmtNum(Number(o.monthly_price))} ₺ × {String(o.months)} ay
                    </span>
                  </div>
                  {o.note ? (
                    <p className="mt-1 text-[12px] text-muted">{String(o.note)}</p>
                  ) : null}
                  {o.reject_reason ? (
                    <p className="mt-1 text-[12px] text-danger">Red: {String(o.reject_reason)}</p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-faint">{timeAgo(String(o.created_at))}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Günlük istatistik */}
        <Card>
          <CardTitle>Günlük performans</CardTitle>
          {!ist?.gunluk?.length ? (
            <EmptyState title="Henüz veri yok" />
          ) : (
            <ul className="space-y-2">
              {ist.gunluk.slice(-14).reverse().map((g) => (
                <li key={g.gun} className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-[12.5px] text-text">
                      {new Date(g.gun).toLocaleDateString("tr", { day: "numeric", month: "short" })}
                    </span>
                    <span className="text-[12px] tabular-nums text-muted">
                      {fmtNum(g.gosterim)} · {fmtNum(g.tiklama)} tıklama
                    </span>
                  </div>
                  <Bar pct={(g.gosterim / maxGun) * 100} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
