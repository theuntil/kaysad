// src/app/(dashboard)/onay/ogrenci/page.tsx
//
// ÖĞRENCİ ONAY SAYFASI
//
// Sadece bekleyenler listelenir — onaylanan öğrenciyi görmek istersen
// Kullanıcılar sayfasındaki "Öğrenci" filtresi var.

import { fetchStudentApplications } from "@/actions/approval.actions"
import { PageHeader } from "@/components/PageHeader"
import { StudentApprovals } from "@/components/StudentApprovals"
import { ErrorBox } from "@/components/ui"

export const dynamic = "force-dynamic"

export default async function StudentApprovalPage() {
  const { items, error } = await fetchStudentApplications()

  return (
    <>
      <PageHeader
        title="Öğrenci onayı"
        description="Öğrenci belgelerini incele. Reddederken sebep yazmak zorunlu."
      />

      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}

      <StudentApprovals items={items} />
    </>
  )
}
