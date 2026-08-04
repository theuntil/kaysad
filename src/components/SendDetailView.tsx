// src/components/SendDetailView.tsx
//
// GÖNDERİM DETAY GÖRÜNÜMÜ
//
// Server component — veri sayfadan geliyor, burada sadece gösterim var.
// İkonlu metrik kartları, okunma oranı çubuğu, şehir/platform kırılımı,
// hata listesi ve saatlik akış grafiği.

import { Badge, Bar, Card, CardTitle, EmptyState, Table, Td, Th } from "@/components/ui"
import { fmtDate, fmtNum, timeAgo } from "@/lib/utils"
import { label, pct } from "@/lib/format"
import type { SendDetail } from "@/lib/types.v3"

const Icon = {
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  send: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4z" />
    </svg>
  ),
  alert: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  ),
  clock: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
    </svg>
  ),
  skip: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M5 4l10 8-10 8V4zM19 5v14" />
    </svg>
  ),
}

function MetricCard({
  icon, label: lbl, value, sub, tone = "default",
}: {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  tone?: "default" | "accent" | "warn" | "danger" | "info"
}) {
  const t = {
    default: "text-text",
    accent: "text-accent",
    warn: "text-warn",
    danger: "text-danger",
    info: "text-info",
  }[tone]
  const bg = {
    default: "bg-white/[0.06] text-muted",
    accent: "bg-accent/12 text-accent",
    warn: "bg-warn/12 text-warn",
    danger: "bg-danger/12 text-danger",
    info: "bg-info/12 text-info",
  }[tone]

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-card">
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${bg}`}>{icon}</span>
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-faint">{lbl}</span>
      </div>
      <div className={`text-[22px] font-bold tabular-nums tracking-tight ${t}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[12px] text-muted">{sub}</div>}
    </div>
  )
}

export function SendDetailView({ detail: d }: { detail: SendDetail }) {
  const pushToplam = d.push_sent + d.push_failed + d.push_pending
  const maxSaat = Math.max(1, ...d.zaman_cizgisi.map((z) => z.adet))
  const kanal = pushToplam === 0 && d.push_skipped > 0 ? "inapp" : "both"

  return (
    <div className="space-y-5">
      {/* ── MESAJ KARTI ── */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <Badge tone={d.tip === "earthquake" ? "danger" : d.tip === "popup" ? "scheduled" : "promo"}>
            {label.sendType(d.tip)}
          </Badge>
          <Badge tone={kanal === "inapp" ? "neutral" : "live"}>
            {kanal === "inapp" ? "Sadece uygulama içi" : "Uygulama içi + push"}
          </Badge>
          {d.mesaj.includes("{") && <Badge tone="live">Kişiselleştirilmiş</Badge>}
          <span className="ml-auto text-[12px] text-faint">
            {d.son ? timeAgo(d.son) : ""}
          </span>
        </div>
        <p className="text-[14.5px] leading-relaxed text-text">{d.mesaj}</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-hairline pt-3 text-[12px] text-faint">
          <span>İlk kayıt: {d.ilk ? fmtDate(d.ilk) : "—"}</span>
          <span>Son kayıt: {d.son ? fmtDate(d.son) : "—"}</span>
          {d.ilk_push && <span>İlk push: {fmtDate(d.ilk_push)}</span>}
          {d.son_push && <span>Son push: {fmtDate(d.son_push)}</span>}
        </div>
      </Card>

      {/* ── METRİKLER ── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <MetricCard
          icon={Icon.users}
          label="Ulaşılan kişi"
          value={fmtNum(d.toplam)}
        />
        <MetricCard
          icon={Icon.eye}
          label="Okundu"
          value={fmtNum(d.okundu)}
          tone="accent"
        />
        <MetricCard
          icon={Icon.send}
          label="Push gönderildi"
          value={fmtNum(d.push_sent)}
          tone="info"
        />
        <MetricCard
          icon={Icon.alert}
          label="Push başarısız"
          value={fmtNum(d.push_failed)}
          tone={d.push_failed > 0 ? "danger" : "default"}
        />
        <MetricCard
          icon={Icon.clock}
          label="Push bekliyor"
          value={fmtNum(d.push_pending)}
          tone={d.push_pending > 0 ? "info" : "default"}
        />
        <MetricCard
          icon={Icon.skip}
          label="Push atlandı"
          value={fmtNum(d.push_skipped)}
        />
      </div>

      {/* ── OKUNMA ÇUBUĞU ── */}
      <Card>
        <CardTitle>
          Okunma
        </CardTitle>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-muted">
              {fmtNum(d.okundu)} okundu · {fmtNum(d.okunmadi)} okunmadı
            </span>
            <span className="text-[18px] font-bold tabular-nums text-accent">
              {pct(d.okundu, d.toplam)}
            </span>
          </div>
          <Bar pct={d.toplam > 0 ? (d.okundu / d.toplam) * 100 : 0} />
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── ŞEHİR KIRILIMI ── */}
        <Card>
          <CardTitle>
            Şehir dağılımı
          </CardTitle>
          {d.sehirler.length === 0 ? (
            <EmptyState title="Şehir verisi yok" />
          ) : (
            <ul className="space-y-2">
              {d.sehirler.slice(0, 12).map((s) => (
                <li key={s.sehir} className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-text">{s.sehir}</span>
                    <span className="shrink-0 text-[12.5px] tabular-nums text-muted">
                      {fmtNum(s.adet)}
                      <span className="ml-1.5 text-[11px] text-faint">
                        · {fmtNum(s.okundu)} okundu
                      </span>
                    </span>
                  </div>
                  <Bar pct={(s.adet / (d.sehirler[0]?.adet || 1)) * 100} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── PLATFORM + HATALAR ── */}
        <div className="space-y-5">
          <Card>
            <CardTitle>
              Platform
            </CardTitle>
            {d.platformlar.length === 0 ? (
              <EmptyState title="Push kaydı yok" />
            ) : (
              <div className="space-y-2">
                {d.platformlar.map((p) => (
                  <div key={p.platform} className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
                    <span className="text-[13px] font-medium text-text">
                      {label.platform(p.platform)}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-muted">
                      {fmtNum(p.adet)}
                    </span>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 border-t border-hairline pt-2.5 text-[12.5px]">
                  <span className="text-muted">Log sonucu</span>
                  <span className="tabular-nums">
                    <span className="text-accent">{fmtNum(d.log_ok)} başarılı</span>
                    {d.log_hata > 0 && (
                      <span className="ml-2 text-danger">{fmtNum(d.log_hata)} hata</span>
                    )}
                  </span>
                </div>
              </div>
            )}
          </Card>

          {d.hatalar.length > 0 && (
            <Card>
              <CardTitle>
                Hatalar
              </CardTitle>
              <div className="space-y-2">
                {d.hatalar.map((h) => (
                  <div key={h.hata} className="rounded-xl border border-danger/25 bg-danger/[0.06] px-3.5 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 break-words font-mono text-[11.5px] text-danger">
                        {h.hata}
                      </span>
                      <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-danger">
                        {fmtNum(h.adet)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* ── SAATLİK AKIŞ ── */}
      {d.zaman_cizgisi.length > 1 && (
        <Card>
          <CardTitle>
            Zaman çizgisi
          </CardTitle>
          <div className="scroll-hint overflow-x-auto">
            <div className="flex min-w-full items-end gap-1" style={{ height: 120 }}>
              {d.zaman_cizgisi.map((z) => (
                <div key={z.saat} className="flex min-w-[26px] flex-1 flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-t-md bg-accent/50"
                    style={{ height: `${Math.max(4, (z.adet / maxSaat) * 92)}px` }}
                    title={`${fmtNum(z.adet)} bildirim`}
                  />
                  <span className="whitespace-nowrap text-[9.5px] tabular-nums text-faint">
                    {new Date(z.saat).toLocaleTimeString("tr", { hour: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {/* ── ÖZET TABLO ── */}
      <Card padded={false}>
        <div className="px-5 pt-5">
          <CardTitle>Push durumu</CardTitle>
        </div>
        <Table minWidth={480}>
          <thead>
            <tr>
              <Th>Durum</Th>
              <Th className="text-right">Adet</Th>
              <Th className="text-right">Oran</Th>
            </tr>
          </thead>
          <tbody>
            {[
              ["sent", d.push_sent],
              ["failed", d.push_failed],
              ["pending", d.push_pending],
              ["skipped", d.push_skipped],
            ].map(([k, v]) => (
              <tr key={String(k)}>
                <Td>{label.pushStatus(String(k))}</Td>
                <Td className="text-right tabular-nums">{fmtNum(Number(v))}</Td>
                <Td className="text-right tabular-nums text-muted">{pct(Number(v), d.toplam)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}
