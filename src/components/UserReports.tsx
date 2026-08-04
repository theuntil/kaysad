// src/components/UserReports.tsx
//
// ŞİKÂYETLER — artık json değil, kart.
//
// Eskiden bu bölüm ham JSON basıyordu; okunmuyordu. Şimdi iki yön ayrı
// gösteriliyor: kullanıcı HAKKINDA gelenler ve kullanıcının YAPTIKLARI.
// Aynı kişi hakkında çok şikâyet varsa üstte sayıyla görünüyor.

import Link from "next/link"
import { Avatar, Badge, Button, EmptyState } from "@/components/ui"
import { ReportActions } from "@/components/ReportActions"
import { label } from "@/lib/format"
import { fmtDate } from "@/lib/utils"
import type { UserReport, ReportStatus } from "@/lib/types.v3"

const TONE: Record<string, "live" | "expired" | "off" | "neutral"> = {
  pending: "expired", reviewing: "expired", resolved: "live", dismissed: "off",
}

function ReportCard({ r }: { r: UserReport }) {
  const acik = r.status === "pending" || r.status === "reviewing"

  return (
    <li className="rounded-2xl border border-hairline bg-raised px-4 py-3.5">
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <Badge tone={r.yon === "against" ? "danger" : "neutral"}>
          {r.yon === "against" ? "hakkında" : "bu kullanıcı şikâyet etti"}
        </Badge>
        <Badge tone={TONE[r.status ?? "pending"] ?? "neutral"}>{label.report(r.status)}</Badge>
        {r.content_type && <Badge tone="neutral">{label.content(r.content_type)}</Badge>}
        <span className="ml-auto text-[11.5px] text-faint">{fmtDate(r.created_at)}</span>
      </div>

      <p className="text-[13.5px] font-medium text-text">{r.reason ?? "sebep belirtilmemiş"}</p>
      {r.description && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{r.description}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        {r.karsi_taraf_id && (
          <Link
            href={`/kullanicilar/${r.karsi_taraf_id}`}
            className="flex items-center gap-2 text-[12.5px] text-muted hover:text-accent"
          >
            <Avatar url={r.karsi_taraf_avatar} name={r.karsi_taraf_username} size={22} />
            {r.yon === "against" ? "şikâyet eden: " : "şikâyet edilen: "}
            <span className="font-medium">{r.karsi_taraf_username ?? "bilinmiyor"}</span>
          </Link>
        )}
        {r.content_id && (
          <span className="font-mono text-[11px] text-faint">
            içerik: {r.content_id.slice(0, 8)}…
          </span>
        )}
      </div>

      {r.admin_note && (
        <p className="mt-2 rounded-xl border border-info/25 bg-info/[0.07] px-3 py-2 text-[12px] text-info">
          Panel notu: {r.admin_note}
        </p>
      )}

      {/* ★ Karar buradan da verilebiliyor — şikâyet sayfasına gitmeye
             gerek yok. Ayrıntı için "Detay" linki var. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline pt-3">
        {acik && (
          <ReportActions
            reportId={r.id}
            status={(r.status as ReportStatus) ?? "pending"}
            adminNote={r.admin_note}
            compact
          />
        )}
        <Link href={`/reports/${r.id}`} className="ml-auto">
          <Button variant="ghost" size="sm">Detay →</Button>
        </Link>
      </div>
    </li>
  )
}

export function UserReports({ items }: { items: UserReport[]; userId?: string }) {
  if (items.length === 0) {
    return <EmptyState title="Şikâyet kaydı yok" />
  }

  const against = items.filter((r) => r.yon === "against")
  const made = items.filter((r) => r.yon === "made")

  return (
    <div className="space-y-5">
      {against.length > 0 && (
        <div>
          <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-faint">
            Hakkında gelen ({against.length})
          </h4>
          <ul className="space-y-2">
            {against.map((r) => <ReportCard key={`a-${r.id}`} r={r} />)}
          </ul>
        </div>
      )}

      {made.length > 0 && (
        <div>
          <h4 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-faint">
            Bu kullanıcının yaptığı ({made.length})
          </h4>
          <ul className="space-y-2">
            {made.map((r) => <ReportCard key={`m-${r.id}`} r={r} />)}
          </ul>
        </div>
      )}
    </div>
  )
}
