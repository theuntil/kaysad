// src/components/Sidebar.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// NAVİGASYON — responsive
//
//   • Masaüstü (lg+): sol tarafta sabit yan panel
//   • Mobil/tablet:   üstte başlık + altta sabit sekme çubuğu
//
// İki ayrı bileşen yazmak yerine aynı link listesini iki farklı düzende
// render ediyoruz — yeni bir sayfa eklediğinde tek yerde tanımlıyorsun.
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link"
import { usePathname } from "next/navigation"
import { logoutAction } from "@/actions/auth.actions"
import { cn } from "@/lib/utils"

interface NavItem {
  href: string
  label: string
  shortLabel: string
  icon: React.ReactNode
}

const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  popup: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="4" width="18" height="14" rx="2.5" /><path d="M8 21h8" /><path d="M7 9h10M7 13h6" />
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  ),
  log: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  ),
  push: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M12 3a6 6 0 0 0-6 6v3.6L4 16h16l-2-3.4V9a6 6 0 0 0-6-6z" /><path d="M10 20a2 2 0 0 0 4 0" />
      <path d="M17 3.5a7 7 0 0 1 3 3M4 6.5a7 7 0 0 1 3-3" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" />
    </svg>
  ),
}

const NAV: NavItem[] = [
  { href: "/",              label: "Genel Bakış",  shortLabel: "Özet",      icon: Icon.dashboard },
  { href: "/popups",        label: "Popup'lar",    shortLabel: "Popup",     icon: Icon.popup },
  { href: "/notifications", label: "Bildirimler",  shortLabel: "Bildirim",  icon: Icon.bell },
  { href: "/push",          label: "Push",         shortLabel: "Push",      icon: Icon.push },
  { href: "/audit",         label: "İşlem Kaydı",  shortLabel: "Kayıt",     icon: Icon.log },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

/* ═══════════════ MASAÜSTÜ YAN PANEL ═══════════════ */

export function DesktopSidebar({ username }: { username: string }) {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex lg:w-[248px] lg:shrink-0 lg:flex-col lg:border-r lg:border-border lg:bg-surface">
      {/* Marka */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent">
          <span className="text-[15px] font-extrabold text-black">K</span>
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold tracking-tight text-text">Kays Admin</div>
          <div className="truncate text-[11px] text-faint">{username}</div>
        </div>
      </div>

      {/* Linkler */}
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                active
                  ? "bg-accent/12 text-accent"
                  : "text-muted hover:bg-white/[0.05] hover:text-text"
              )}
            >
              <span className={active ? "text-accent" : "text-faint"}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Çıkış */}
      <div className="border-t border-border p-3">
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium
                       text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <span className="text-faint">{Icon.logout}</span>
            Çıkış yap
          </button>
        </form>
      </div>
    </aside>
  )
}

/* ═══════════════ MOBİL ÜST BAŞLIK ═══════════════ */

export function MobileHeader({ username }: { username: string }) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent">
          <span className="text-[13px] font-extrabold text-black">K</span>
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold tracking-tight text-text">Kays Admin</div>
          <div className="truncate text-[10.5px] text-faint">{username}</div>
        </div>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Çıkış yap"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition-colors hover:bg-danger/10 hover:text-danger"
        >
          {Icon.logout}
        </button>
      </form>
    </header>
  )
}

/* ═══════════════ MOBİL ALT SEKME ÇUBUĞU ═══════════════ */

export function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-border bg-surface/95 backdrop-blur lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors",
              active ? "text-accent" : "text-faint hover:text-muted"
            )}
          >
            {item.icon}
            {item.shortLabel}
          </Link>
        )
      })}
    </nav>
  )
}
