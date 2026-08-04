// src/app/(dashboard)/banlar/page.tsx
//
// BANLAR — hesap, cihaz ve IP banları AYNI SAYFADA
//
// ★ IP banı ayrı sayfadaydı, buraya alındı: üçü de aynı iş (engelleme),
//   aralarında gezinmek gereksizdi. Sekmeler ayırıyor:
//     Tümü · Hesap · Cihaz · IP · Süresi geçmiş
//   IP sekmesinde ban listesinin altında GÖRÜLEN IP LİSTESİ ve elle
//   IP banlama da var.

import Link from "next/link"
import { fetchBans } from "@/actions/ban.actions"
import { PageHeader } from "@/components/PageHeader"
import { BansList } from "@/components/BansList"
import { BanCreate } from "@/components/BanCreate"
import { Button, ErrorBox } from "@/components/ui"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

// ★ Filtreler HEDEF TİPİNE göre değil DURUMA göre: asıl sorulan şey
//   hangi banın hâlâ etkili olduğu. Tip bilgisi zaten satırda rozet olarak
//   görünüyor (Hesap / N cihaz / N IP).
const SCOPES = [
  { value: "active",    label: "Yürürlükte" },
  { value: "expired",   label: "Süresi geçmiş" },
  { value: "cancelled", label: "İptal edilenler" },
  { value: "all",       label: "Tümü" },
] as const

type Scope = (typeof SCOPES)[number]["value"]

export default async function BansPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  const sp = await searchParams
  const scope = (SCOPES.find((s) => s.value === sp.scope)?.value ?? "active") as Scope
  const { items, error } = await fetchBans({ scope, limit: 200 })

  return (
    <>
      <PageHeader
        title="Banlar"
        description="Hesap, cihaz ve IP engellemelerinin tamamı."
        action={
          <div className="flex gap-2">
            <Link href="/cihazlar">
              <Button variant="secondary" size="sm">Cihazlar</Button>
            </Link>
            {/* ★ Elle ban: kullanıcı / cihaz / IP */}
            <BanCreate />
          </div>
        }
      />

      <div className="scroll-hint -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {SCOPES.map((s) => (
          <Link
            key={s.value}
            href={s.value === "active" ? "/banlar" : `/banlar?scope=${s.value}`}
            className={cn(
              "shrink-0 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-colors",
              s.value === scope
                ? "border-accent/40 bg-accent/10 text-text"
                : "border-hairline bg-surface text-muted hover:text-text"
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {error && <div className="mb-4"><ErrorBox>{error}</ErrorBox></div>}

      <BansList items={items} />

    </>
  )
}
