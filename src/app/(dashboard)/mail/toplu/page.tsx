// src/app/(dashboard)/mail/toplu/page.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// TOPLU MAİL — AYRI EKRAN
//
// ★ Tekil mailden ayrı tutuluyor: alıcı seçimi, filtreler ve onay adımı
//   var. Aynı formda toplamak ikisini de karmaşıklaştırırdı.
// ═══════════════════════════════════════════════════════════════════════

import { MailBulkForm } from "@/components/MailBulkForm"
import { PageHeader } from "@/components/PageHeader"

export const dynamic = "force-dynamic"

export default function TopluMailPage() {
  return (
    <>
      <PageHeader
        back={{ href: "/mail", label: "Mail" }}
        title="Toplu mail"
      />
      <MailBulkForm />
    </>
  )
}
