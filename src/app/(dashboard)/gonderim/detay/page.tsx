// src/app/(dashboard)/gonderim/detay/page.tsx
//
// GÖNDERİM DETAY İSTATİSTİĞİ
//
// Geçmişteki bir gönderime tıklayınca burası açılıyor. Tip ve mesaj
// adres çubuğundan geliyor (gönderimin kimliği bu ikili — aynı mesaj
// binlerce satır oluşturuyor, gruplanmış hâli tek gönderim demek).
//
// Amaç tek bir soruya cevap vermek: "bu duyuru gerçekte kime ulaştı?"
// Okundu oranı, push sonucu, şehir kırılımı, hata dağılımı ve saatlik
// akış — hepsi ikonlu kartlarda.

import Link from "next/link"
import { notFound } from "next/navigation"
import { fetchSendDetail } from "@/actions/send.actions"
import { PageHeader } from "@/components/PageHeader"
import { SendDetailView } from "@/components/SendDetailView"
import { Button, ErrorBox } from "@/components/ui"
import type { SendType } from "@/lib/types.v3"

export const dynamic = "force-dynamic"

const TYPES: SendType[] = ["promo", "earthquake", "popup"]

export default async function SendDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string; mesaj?: string }>
}) {
  const sp = await searchParams
  const tip = (sp.tip ?? "") as SendType
  const mesaj = sp.mesaj ?? ""

  if (!TYPES.includes(tip) || !mesaj) notFound()

  const { detail, error } = await fetchSendDetail(tip, mesaj)

  return (
    <>
      <PageHeader
        back={{ href: "/gonderim", label: "Gönderim" }}
        title="Gönderim detayı"
        description="Bu duyurunun kime ulaştığı, okunma ve push sonuçları."
      />

      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}

      {detail ? (
        <SendDetailView detail={detail} />
      ) : (
        !error && (
          <ErrorBox>
            Bu gönderime ait kayıt bulunamadı. Geri alınmış ya da temizlenmiş olabilir.
          </ErrorBox>
        )
      )}
    </>
  )
}
