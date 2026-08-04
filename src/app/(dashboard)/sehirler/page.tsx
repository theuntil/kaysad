// src/app/(dashboard)/sehirler/page.tsx
//
// TÜM ŞEHİRLER
//
// Kullanıcılar sayfasındaki şehir widget'ı ilk 8 ili gösteriyor;
// "Tüm şehirler" bu sayfaya getiriyor. Burada 81 ilin tamamı, arama ve
// sıralama ile: kullanıcı, push cihaz, öğrenci, işletme, banlı, son 7 gün.

import Link from "next/link"
import { fetchCityStatsFull } from "@/actions/admin.actions"
import { PageHeader } from "@/components/PageHeader"
import { CityTable } from "@/components/CityTable"
import { Button, ErrorBox, Stat } from "@/components/ui"
import { fmtNum } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function CitiesPage() {
  const { items, error } = await fetchCityStatsFull()

  const kayitli = items.filter((c) => c.kullanici > 0)
  const toplam = items.reduce((s, c) => s + c.kullanici, 0)
  const enKalabalik = kayitli[0]
  const yeni = items.reduce((s, c) => s + c.yeni_7g, 0)

  return (
    <>
      <PageHeader
        title="Tüm şehirler"
        description="81 ilin tamamı — kullanıcısı olmayanlar dahil."
        action={
          <Link href="/kullanicilar">
            <Button variant="secondary" size="sm">Kullanıcılar</Button>
          </Link>
        }
      />

      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Toplam kullanıcı" value={fmtNum(toplam)} />
        <Stat
          label="En kalabalık"
          value={enKalabalik?.sehir ?? "—"}
        />
        <Stat label="Yeni (7 gün)" value={fmtNum(yeni)} tone="accent" />
        <Stat
          label="Kullanıcısı olmayan"
          value={81 - kayitli.length}
          tone="default"
        />
      </div>

      <CityTable items={items} />
    </>
  )
}
