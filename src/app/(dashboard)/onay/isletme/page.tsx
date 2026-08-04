// src/app/(dashboard)/onay/isletme/page.tsx
//
// İŞLETME HESABI ONAY SAYFASI
//
// Sekmeler: bekleyen / onaylanmış / reddedilmiş. Bekleyende tam kayıt
// (adres, website, belge alanları) gösterilir; geçmişte özet yeterli.

import Link from "next/link"
import { fetchBusinessApplications } from "@/actions/approval.actions"
import { PageHeader } from "@/components/PageHeader"
import { BusinessApprovals } from "@/components/BusinessApprovals"
import { ErrorBox } from "@/components/ui"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const TABS = [
  { value: "pending",  label: "Bekleyen" },
  { value: "approved", label: "Onaylanan" },
  { value: "rejected", label: "Reddedilen" },
] as const

export default async function BusinessApprovalPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string }>
}) {
  const sp = await searchParams
  const durum = (TABS.find((t) => t.value === sp.durum)?.value ?? "pending") as string

  const { items, error } = await fetchBusinessApplications(durum)

  return (
    <>
      <PageHeader
        title="İşletme onayı"
        description="Başvuruları incele, onayla ya da sebebini yazarak reddet."
      />

      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}

      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "pending" ? "/onay/isletme" : `/onay/isletme?durum=${t.value}`}
            className={cn(
              "shrink-0 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors",
              t.value === durum
                ? "border-accent/35 bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:text-text"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <BusinessApprovals items={items} />
    </>
  )
}
