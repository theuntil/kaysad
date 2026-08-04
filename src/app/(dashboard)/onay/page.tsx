// src/app/(dashboard)/onay/page.tsx
//
// ONAY GİRİŞİ
//
// Menüde tek "Onaylar" sekmesi var; iki onay türü buradan seçiliyor.
// Sayfalar ayrı kalıyor (farklı alanlar, farklı kararlar) ama menü
// kalabalıklaşmıyor.

import Link from "next/link"
import { fetchUserCounts } from "@/actions/admin.actions"
import { PageHeader } from "@/components/PageHeader"
import { fmtNum } from "@/lib/utils"

export const dynamic = "force-dynamic"

const Icon = {
  store: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M3 9 4.5 4h15L21 9" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" />
    </svg>
  ),
  cap: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
      <path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" />
    </svg>
  ),
}

export default async function OnayPage() {
  const { counts } = await fetchUserCounts()

  const cards = [
    {
      href: "/onay/isletme",
      icon: Icon.store,
      title: "İşletme onayı",
      desc: "İşletme hesabı başvurularını incele; onayla ya da sebebini yazarak reddet.",
      n: counts?.bekleyen_isletme ?? 0,
    },
    {
      href: "/onay/ogrenci",
      icon: Icon.cap,
      title: "Öğrenci onayı",
      desc: "Öğrenci belgelerini görüntüle ve doğrula. Karar kullanıcıya bildirim olarak gider.",
      n: counts?.bekleyen_ogrenci ?? 0,
    },
  ]

  return (
    <>
      <PageHeader
        title="Onaylar"
        description="Bekleyen başvurular. Verdiğin karar kullanıcıya bildirim olarak iletilir."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="group">
            <div className="flex h-full flex-col rounded-2xl border border-hairline bg-surface p-5 shadow-card transition-colors group-hover:border-accent/40">
              <div className="mb-3 flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-raised text-muted">
                  {c.icon}
                </span>
                {c.n > 0 ? (
                  <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[12px] font-bold tabular-nums text-accent">
                    {fmtNum(c.n)} bekliyor
                  </span>
                ) : (
                  <span className="text-[12px] text-faint">bekleyen yok</span>
                )}
              </div>
              <div className="text-[15px] font-semibold text-text">{c.title}</div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{c.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  )
}
