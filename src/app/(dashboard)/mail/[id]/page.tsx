// src/app/(dashboard)/mail/[id]/page.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// MAİL DETAYI — AYRI ROUTE
//
// ★ Eskiden liste bileşeninin içinde durum değişimiyle açılıyordu.
//   Artık kendi adresi var: `/mail/<id>`. Sonuçları:
//     · Tarayıcı geri düğmesi çalışıyor
//     · Maile doğrudan bağlantı verilebiliyor
//     · İstatistik kutuları ve sekme çubuğu görünmüyor — sadece mail
// ═══════════════════════════════════════════════════════════════════════

import { notFound } from "next/navigation"
import { fetchMailDetail } from "@/actions/mail.actions"
import { MailDetailView } from "@/components/MailDetailView"
import { PageHeader } from "@/components/PageHeader"
import { ErrorBox } from "@/components/ui"

export const dynamic = "force-dynamic"

interface Detay {
  mail: Record<string, unknown> | null
  kullanici: Record<string, unknown> | null
}

export default async function MailDetayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { detail, error } = await fetchMailDetail(id)

  if (error) {
    return (
      <>
        <PageHeader back={{ href: "/mail", label: "Mail" }} title="Mail" />
        <ErrorBox>{error}</ErrorBox>
      </>
    )
  }

  const d = detail as Detay | null
  if (!d?.mail) notFound()

  const m = d.mail
  const k = d.kullanici

  return (
    <>
      <PageHeader
        back={{ href: "/mail", label: "Gelen kutusu" }}
        title={String(m.subject ?? "(konu yok)")}
      />

      <MailDetailView
        mail={{
          id: String(m.id),
          subject: (m.subject as string | null) ?? null,
          from_name: (m.from_name as string | null) ?? null,
          from_email: String(m.from_email ?? ""),
          to_email: (m.to_email as string | null) ?? null,
          received_at: String(m.received_at ?? ""),
          body_html: (m.body_html as string | null) ?? null,
          body_text: (m.body_text as string | null) ?? null,
          is_starred: m.is_starred === true,
          is_archived: m.is_archived === true,
        }}
        kullanici={k ? {
          id: String(k.id),
          username: (k.username as string | null) ?? null,
          name: (k.name as string | null) ?? null,
          email: (k.email as string | null) ?? null,
        } : null}
      />
    </>
  )
}
