// src/app/(dashboard)/layout.tsx
//
// Korumalı alanın kabuğu. `requireSession()` burada çağrılıyor —
// middleware'e EK olarak (iki katmanlı savunma).
//
// V3: tema çerezden, bekleyen iş sayaçları veritabanından okunuyor ve
// navigasyona veriliyor. Sayaç sorgusu hata verirse sıfır döner —
// panel yine açılır.

import { requireSession } from "@/lib/session"
import { getTheme } from "@/lib/theme"
import { fetchNavBadges } from "@/actions/admin.actions"
import { DesktopSidebar, MobileNav } from "@/components/Nav"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSession()
  const [theme, badges] = await Promise.all([getTheme(), fetchNavBadges()])

  return (
    <div className="flex min-h-dvh">
      <DesktopSidebar theme={theme} badges={badges} />

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav theme={theme} badges={badges} />

        {/* pb-24: mobilde alt sekme çubuğunun altında içerik kalmasın */}
        <main className="mx-auto w-full max-w-[1060px] flex-1 px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:py-9 lg:pb-10">
          {children}
        </main>
      </div>
    </div>
  )
}
