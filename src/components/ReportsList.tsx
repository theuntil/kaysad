// src/components/ReportsList.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// ŞİKÂYET LİSTESİ
//
// ★ Sıralama sunucuda: cevaplanmamışlar (pending/reviewing) HER ZAMAN
//   üstte. Panelde iş biriktirmenin en kolay yolu, bekleyenlerin eski
//   kayıtların arasında kaybolmasıydı.
//
// Satırda iki taraf birlikte görünüyor: kim şikâyet etti, kim şikâyet
// edildi. Şikâyet edilen kişi hakkındaki TOPLAM şikâyet sayısı da var —
// tekrar eden isimler hemen fark ediliyor.
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link"
import { Avatar, Badge, EmptyState } from "@/components/ui"
import { label } from "@/lib/format"
import { timeAgo } from "@/lib/utils"
import type { ReportRow } from "@/lib/types.v3"

const TONE: Record<string, "expired" | "live" | "off" | "danger" | "neutral"> = {
  pending: "expired",
  reviewing: "expired",
  resolved: "live",
  dismissed: "off",
}

export function ReportsList({ items }: { items: ReportRow[] }) {
  if (items.length === 0) {
    return <EmptyState title="Şikâyet bulunamadı" />
  }

  return (
    <ul className="space-y-2">
      {items.map((r) => {
        const acik = r.status === "pending" || r.status === "reviewing"
        return (
          <li key={r.id}>
            <Link
              href={`/reports/${r.id}`}
              className={
                "block rounded-2xl border bg-surface p-4 shadow-card transition-colors hover:border-accent/40 " +
                (acik ? "border-warn/30" : "border-hairline")
              }
            >
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <Badge tone={TONE[r.status ?? "pending"] ?? "neutral"}>
                  {label.report(r.status)}
                </Badge>
                {r.content_type && <Badge tone="neutral">{label.content(r.content_type)}</Badge>}
                {r.hedef_banli && <Badge tone="danger">Hedef banlı</Badge>}
                {r.hedef_toplam_sikayet > 1 && (
                  <Badge tone="promo">{r.hedef_toplam_sikayet} şikâyet</Badge>
                )}
                <span className="ml-auto text-[11.5px] text-faint">{timeAgo(r.created_at)}</span>
              </div>

              <p className="text-[14px] font-medium text-text">{r.reason ?? "Sebep belirtilmemiş"}</p>
              {r.description && (
                <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
                  {r.description}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-2.5">
                <span className="flex items-center gap-2">
                  <Avatar url={r.reporter_avatar} name={r.reporter_username} size={24} />
                  <span className="text-[12px] text-muted">
                    <span className="text-faint">Şikâyet eden: </span>
                    {r.reporter_username ?? "bilinmiyor"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Avatar url={r.reported_avatar} name={r.reported_username} size={24} />
                  <span className="text-[12px] text-muted">
                    <span className="text-faint">Şikâyet edilen: </span>
                    {r.reported_username ?? "bilinmiyor"}
                  </span>
                </span>
                {r.admin_note && (
                  <span className="text-[11.5px] text-info">Panel notu var</span>
                )}
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
