// src/app/(dashboard)/gonderim/page.tsx
//
// ★ BİRLEŞİK GÖNDERİM SAYFASI
//
// Eski /notifications ve /push composer'ının yerini alıyor. /push sayfası
// duruyor ama artık sadece AYARLAR ve LOG için (tip bazlı açma/kapama,
// sessiz saat, gönderim kaydı) — gönderim buradan yapılıyor.
//
// ★ İstatistik yok: "kaç okundu, kaç mesaj gönderildi" gibi sayılar bu
//   sayfadan kaldırıldı. Gönderim yaparken gereken tek sayı "kaç kişiye
//   gidecek" ve o da sayım butonunda.

import { fetchPopups } from "@/actions/popup.actions"
import { fetchCityStats } from "@/actions/admin.actions"
import { fetchSendHistory } from "@/actions/send.actions"
import { PageHeader } from "@/components/PageHeader"
import { SendComposer } from "@/components/SendComposer"
import { SendHistory } from "@/components/SendHistory"
import Link from "next/link"
import { Button, Card, CardTitle, ErrorBox } from "@/components/ui"

export const dynamic = "force-dynamic"

export default async function GonderimPage() {
  const [{ popups, error: popupErr }, { items: cityStats, error: cityErr }, { items: history, error: histErr }] =
    await Promise.all([fetchPopups(), fetchCityStats(), fetchSendHistory(30)])

  const cityCounts: Record<string, number> = {}
  for (const c of cityStats) cityCounts[c.sehir] = c.kullanici

  const activePopups = popups
    .filter((p) => p.is_active)
    .map((p) => ({ id: p.id, title: p.title }))

  const err = popupErr ?? cityErr ?? histErr

  return (
    <>
      <PageHeader
        title="Bildirim & Push"
        description="Tek yerden gönder: uygulama içi bildirim, telefon push'u ya da ikisi birden."
        action={
          /* ★ Push ayarları menüden çıkarıldı, buradan açılıyor:
             ayarlar gönderimin bir parçası, ayrı bir başlık değil. */
          <Link href="/push">
            <Button variant="secondary" size="sm">Push ayarları</Button>
          </Link>
        }
      />

      {err && <div className="mb-5"><ErrorBox>{err}</ErrorBox></div>}

      <SendComposer popups={activePopups} cityCounts={cityCounts} />

      <div className="mt-8">
        <Card>
          <CardTitle>
            Gönderim geçmişi
          </CardTitle>
          <SendHistory items={history} />
        </Card>
      </div>
    </>
  )
}
