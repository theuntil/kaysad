// src/components/DashboardStats.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// ANA SAYFA İSTATİSTİKLERİ
//
// Üç kart: platform dağılımı (halka grafik), en çok kullanıcısı olan
// iller ve son gönderimin sonuçları.
//
// ★ Grafikler saf SVG — bir grafik kütüphanesi eklemek 100 KB+ maliyetle
//   gelirdi; ihtiyacımız olan tek şey bir halka ve birkaç çubuk.
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link"
import { Badge, Card, CardTitle, EmptyState } from "@/components/ui"
import { label } from "@/lib/format"
import { fmtNum, timeAgo } from "@/lib/utils"
import type { DashboardExtra } from "@/actions/admin.actions"

const PLATFORM_RENK: Record<string, string> = {
  ios: "rgb(var(--c-accent))",
  android: "rgb(var(--c-info))",
  bilinmiyor: "rgb(var(--c-faint))",
}

/** Halka grafik — saf SVG, tek dairede çoklu dilim */
function Donut({
  items, size = 128, thickness = 16,
}: {
  items: { ad: string; adet: number; renk: string }[]
  size?: number
  thickness?: number
}) {
  const toplam = items.reduce((s, i) => s + i.adet, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {toplam === 0 ? (
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="rgb(var(--c-border))" strokeWidth={thickness}
          />
        ) : (
          items.map((i) => {
            const uzunluk = (i.adet / toplam) * c
            const el = (
              <circle
                key={i.ad}
                cx={size / 2} cy={size / 2} r={r}
                fill="none"
                stroke={i.renk}
                strokeWidth={thickness}
                strokeDasharray={`${uzunluk} ${c - uzunluk}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += uzunluk
            return el
          })
        )}
      </g>
      <text
        x="50%" y="47%"
        textAnchor="middle"
        className="fill-[rgb(var(--c-text))] text-[18px] font-bold"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {fmtNum(toplam)}
      </text>
      <text
        x="50%" y="62%"
        textAnchor="middle"
        className="fill-[rgb(var(--c-faint))] text-[9px] uppercase tracking-wider"
      >
        cihaz
      </text>
    </svg>
  )
}

export function DashboardStats({ extra }: { extra: DashboardExtra | null }) {
  if (!extra) return null

  const platformlar = (extra.platformlar ?? []).map((p) => ({
    ad: p.platform,
    adet: p.adet,
    push: p.push,
    renk: PLATFORM_RENK[p.platform] ?? "rgb(var(--c-promo))",
  }))
  const cihazToplam = platformlar.reduce((s, p) => s + p.adet, 0)

  const sehirler = extra.top_sehirler ?? []
  const sehirMax = sehirler[0]?.kullanici ?? 1

  const son = extra.son_gonderim

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {/* ══════ PLATFORM ══════ */}
      <Card>
        <CardTitle>Platform dağılımı</CardTitle>
        {cihazToplam === 0 ? (
          <EmptyState title="Cihaz kaydı yok" />
        ) : (
          <div className="flex items-center gap-5">
            <Donut items={platformlar} />
            <div className="min-w-0 flex-1 space-y-2.5">
              {platformlar.map((p) => (
                <div key={p.ad}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-[13px] text-text">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.renk }} />
                      {label.platform(p.ad)}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums text-text">
                      %{Math.round((p.adet / cihazToplam) * 100)}
                    </span>
                  </div>
                  <div className="mt-0.5 pl-[18px] text-[11.5px] tabular-nums text-faint">
                    {fmtNum(p.adet)} cihaz · {fmtNum(p.push)} push
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ══════ EN ÇOK KULLANICI ══════ */}
      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <CardTitle>En çok kullanıcı</CardTitle>
          <Link href="/sehirler" className="text-[12px] text-muted hover:text-accent">
            Tümü →
          </Link>
        </div>
        {sehirler.length === 0 ? (
          <EmptyState title="Şehir verisi yok" />
        ) : (
          <ul className="space-y-2.5">
            {sehirler.map((s, i) => (
              <li key={s.sehir}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-4 shrink-0 text-[11px] tabular-nums text-faint">{i + 1}</span>
                    <span className="truncate text-[13px] text-text">{s.sehir}</span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-text">
                    {fmtNum(s.kullanici)}
                  </span>
                </div>
                <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-accent/55"
                    style={{ width: `${Math.max(4, (s.kullanici / sehirMax) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ══════ SON GÖNDERİM ══════ */}
      <Card>
        <div className="mb-4 flex items-start justify-between gap-3">
          <CardTitle>Son gönderim</CardTitle>
          <Link href="/gonderim" className="text-[12px] text-muted hover:text-accent">
            Gönderim →
          </Link>
        </div>

        {!son ? (
          <EmptyState title="Henüz gönderim yok" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={son.tip === "earthquake" ? "danger" : "promo"}>
                {label.sendType(son.tip)}
              </Badge>
              <span className="text-[11.5px] text-faint">{timeAgo(son.tarih)}</span>
            </div>

            <p className="line-clamp-2 text-[13px] leading-relaxed text-text">{son.mesaj}</p>

            <div className="grid grid-cols-2 gap-2">
              {[
                { l: "Alıcı", v: son.toplam, c: "text-text" },
                { l: "Okundu", v: son.okundu, c: "text-accent" },
                { l: "Push", v: son.push_sent, c: "text-info" },
                { l: "Başarısız", v: son.push_failed, c: son.push_failed > 0 ? "text-danger" : "text-faint" },
              ].map((k) => (
                <div key={k.l} className="rounded-xl border border-hairline bg-raised px-3 py-2">
                  <div className="text-[10.5px] uppercase tracking-wider text-faint">{k.l}</div>
                  <div className={`text-[16px] font-bold tabular-nums ${k.c}`}>{fmtNum(k.v)}</div>
                </div>
              ))}
            </div>

            {son.toplam > 0 && (
              <div>
                <div className="mb-1 flex items-center justify-between text-[11.5px]">
                  <span className="text-faint">Okunma</span>
                  <span className="font-semibold tabular-nums text-accent">
                    %{Math.round((son.okundu / son.toplam) * 100)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                  <div
                    className="h-full rounded-full bg-accent/60"
                    style={{ width: `${Math.max(2, (son.okundu / son.toplam) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
