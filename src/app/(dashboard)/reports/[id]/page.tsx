// src/app/(dashboard)/reports/[id]/page.tsx
//
// ŞİKÂYET DETAYI
//
// Üç şey aynı ekranda: iki taraf (kim şikâyet etti / kim edildi),
// şikâyet edilen içeriğin kendisi ve karar butonları.
// Aynı içerik hakkındaki diğer şikâyetler de listede — tek kişinin
// hıncı mı, yoksa gerçek bir sorun mu olduğunu ayırt etmek için.

import Link from "next/link"
import { notFound } from "next/navigation"
import { fetchReportDetail } from "@/actions/report.actions"
import { PageHeader } from "@/components/PageHeader"
import { ReportActions } from "@/components/ReportActions"
import {
  Avatar, Badge, Button, Card, CardTitle, ErrorBox, InfoBox, KeyValue,
} from "@/components/ui"
import { label } from "@/lib/format"
import { fmtDate, timeAgo } from "@/lib/utils"
import type { ReportParty } from "@/lib/types.v3"

export const dynamic = "force-dynamic"

function PartyCard({
  title, p, hint,
}: {
  title: string
  p: ReportParty | null
  hint?: string
}) {
  if (!p) {
    return (
      <Card>
        <CardTitle>{title}</CardTitle>
        <p className="text-[13px] text-faint">Kullanıcı kaydı bulunamadı (silinmiş olabilir).</p>
      </Card>
    )
  }

  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <div className="flex items-start gap-3">
        <Avatar url={p.avatar_url} name={p.username ?? p.name} size={46} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/kullanicilar/${p.id}`}
              className="truncate text-[14.5px] font-semibold text-text hover:text-accent"
            >
              {p.username ?? "Kullanıcı adı yok"}
            </Link>
            {p.is_banned && <Badge tone="danger">Banlı</Badge>}
            {p.role === "business" && <Badge tone="scheduled">İşletme</Badge>}
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {p.name ?? "İsim girilmemiş"}
            {p.sehir ? ` · ${p.sehir}` : ""}
          </p>
          <p className="text-[11.5px] text-faint">{p.email ?? "—"}</p>
        </div>
      </div>

      <div className="mt-3 border-t border-hairline pt-2">
        {p.hakkinda_sikayet !== undefined && (
          <KeyValue
            label="Hakkında toplam şikâyet"
            value={p.hakkinda_sikayet}
            tone={(p.hakkinda_sikayet ?? 0) > 3 ? "danger" : "default"}
          />
        )}
        {p.cozulen !== undefined && <KeyValue label="Kabul edilen şikâyet" value={p.cozulen} />}
        {p.toplam_sikayet !== undefined && (
          <KeyValue label="Yaptığı şikâyet" value={p.toplam_sikayet} />
        )}
      </div>

      <div className="mt-3">
        <Link href={`/kullanicilar/${p.id}`}>
          <Button variant="secondary" size="sm" className="w-full">Profili aç</Button>
        </Link>
      </div>
    </Card>
  )
}

export default async function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { detail: d, error } = await fetchReportDetail(id)

  if (error) {
    return (
      <>
        <PageHeader back={{ href: "/reports", label: "Şikâyetler" }}
        title="Şikâyet detayı" />
        <ErrorBox>{error}</ErrorBox>
      </>
    )
  }
  if (!d) notFound()

  const icerik = d.icerik ?? null

  return (
    <>
      <PageHeader
        title="Şikâyet detayı"
        description={`${label.report(d.status)} · ${timeAgo(d.created_at)}`}
      />

      {/* ── ŞİKÂYET ── */}
      <Card className="mb-5">
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Badge tone={
            d.status === "resolved" ? "live"
            : d.status === "dismissed" ? "off"
            : "expired"
          }>
            {label.report(d.status)}
          </Badge>
          {d.content_type && <Badge tone="neutral">{label.content(d.content_type)}</Badge>}
          <span className="ml-auto text-[12px] text-faint">{fmtDate(d.created_at)}</span>
        </div>

        <h2 className="text-[16px] font-semibold text-text">{d.reason ?? "Sebep belirtilmemiş"}</h2>
        {d.description && (
          <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted">
            {d.description}
          </p>
        )}

        {d.admin_note && (
          <div className="mt-3">
            <InfoBox>
              <strong>Panel notu:</strong> {d.admin_note}
            </InfoBox>
          </div>
        )}

        <div className="mt-4 border-t border-hairline pt-4">
          <ReportActions reportId={d.id} status={d.status} adminNote={d.admin_note} />
        </div>
      </Card>

      {/* ── TARAFLAR ── */}
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <PartyCard title="Şikâyet eden" p={d.reporter} />
        <PartyCard
          title="Şikâyet edilen"
          p={d.reported}
        />
      </div>

      {/* ── ŞİKÂYET EDİLEN İÇERİK ── */}
      <Card className="mb-5">
        <CardTitle>
          Şikâyet edilen içerik
        </CardTitle>

        {!d.content_id ? (
          <p className="text-[13px] text-faint">
            Bu şikâyet belirli bir içeriğe değil, kullanıcıya yapılmış.
          </p>
        ) : !icerik ? (
          <div className="space-y-2">
            <p className="text-[13px] text-warn">
              İçerik bulunamadı — silinmiş olabilir.
            </p>
            <p className="font-mono text-[11.5px] text-faint">
              {d.content_type} · {d.content_id}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Görsel varsa göster */}
            {(() => {
              const gorsel = ["image_url", "cover_url", "thumbnail_url", "kapak_url"]
                .map((k) => icerik[k])
                .find((v) => typeof v === "string" && (v as string).startsWith("http")) as string | undefined
              return gorsel ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={gorsel}
                  alt=""
                  className="max-h-[260px] w-full rounded-xl border border-hairline object-contain"
                />
              ) : null
            })()}

            <div className="grid gap-2 sm:grid-cols-2">
              {Object.entries(icerik)
                .filter(([k]) => !["id"].includes(k))
                .slice(0, 18)
                .map(([k, v]) => {
                  const uzun = typeof v === "string" && v.length > 80
                  return (
                    <div
                      key={k}
                      className={
                        "rounded-xl border border-hairline bg-raised px-3.5 py-2.5 " +
                        (uzun ? "sm:col-span-2" : "")
                      }
                    >
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">
                        {k}
                      </div>
                      <div className="break-words text-[13px] leading-relaxed text-text">
                        {v === null || v === undefined || v === ""
                          ? <span className="text-faint">—</span>
                          : typeof v === "boolean"
                            ? (v ? "Evet" : "Hayır")
                            : typeof v === "object"
                              ? <span className="font-mono text-[11.5px]">{JSON.stringify(v).slice(0, 120)}</span>
                              : String(v)}
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        )}
      </Card>

      {/* ── AYNI İÇERİK HAKKINDAKİ DİĞER ŞİKÂYETLER ── */}
      {d.ayni_icerik_sikayet.length > 0 && (
        <Card>
          <CardTitle>
            Aynı içerik hakkında ({d.ayni_icerik_sikayet.length})
          </CardTitle>
          <ul className="space-y-2">
            {d.ayni_icerik_sikayet.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/reports/${r.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-raised px-3.5 py-2.5 transition-colors hover:border-accent/40"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-text">
                      {r.reason ?? "Sebep belirtilmemiş"}
                    </span>
                    <span className="text-[11.5px] text-faint">
                      {r.reporter_username ?? "bilinmiyor"} · {timeAgo(r.created_at)}
                    </span>
                  </span>
                  <Badge tone={r.status === "resolved" ? "live" : r.status === "dismissed" ? "off" : "expired"}>
                    {label.report(r.status)}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
