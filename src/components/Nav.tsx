// src/components/Nav.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// NAVİGASYON V3
//
// ┌─ NE DEĞİŞTİ ──────────────────────────────────────────────────────┐
// │ Eski menü düz bir listeydi; 10 sayfaya çıkınca ne nerede belli    │
// │ olmuyordu. Artık GRUPLU: Gönderim / Kullanıcılar / Güvenlik.      │
// │ Hiçbir sayfa gizlenmedi, sadece sıralandı.                        │
// │                                                                   │
// │ Bekleyen iş sayaçları menüde: panele girdiğin an "3 işletme       │
// │ başvurusu bekliyor" görüyorsun, sayfa gezmene gerek kalmıyor.     │
// │                                                                   │
// │ Mobilde alt çubuk 4 sık kullanılan sayfa + "Menü" (çekmece).      │
// │ Eskiden 5 sekme sığdırılmaya çalışılıyordu, yazılar kesiliyordu.  │
// └───────────────────────────────────────────────────────────────────┘

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { logoutAction } from "@/actions/auth.actions"
import { ThemeToggle } from "@/components/ThemeToggle"
import { cn } from "@/lib/utils"
import type { Theme } from "@/lib/theme"

export interface NavBadges {
  bekleyenIsletme: number
  bekleyenOgrenci: number
  tutarsiz: number
  banli: number
  sikayet: number
  reklam: number
  mail: number
}

const I = (d: string, extra?: string) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
       strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <path d={d} />
    {extra && <path d={extra} />}
  </svg>
)

const Icon = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  send: I("M22 2 11 13", "M22 2 15 22l-4-9-9-4z"),
  popup: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="4" width="18" height="14" rx="2.5" /><path d="M8 21h8" /><path d="M7 9h10M7 13h6" />
    </svg>
  ),
  bell: I("M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8", "M13.7 21a2 2 0 0 1-3.4 0"),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11" />
    </svg>
  ),
  store: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M3 9 4.5 4h15L21 9" /><path d="M4 9v11h16V9" /><path d="M9 20v-6h6v6" />
    </svg>
  ),
  cap: I("M22 10 12 5 2 10l10 5 10-5z", "M6 12.5V17c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"),
  ban: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" />
    </svg>
  ),
  device: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" />
    </svg>
  ),
  log: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  ),
  logout: I("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5M21 12H9"),
  gear: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
  chart: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" />
    </svg>
  ),
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="2" y="4" width="20" height="16" rx="2.5" /><path d="m2 7 10 6 10-6" />
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="18" height="18" rx="2.5" /><circle cx="8.5" cy="8.5" r="1.6" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  ),
  megaphone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  grid: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  doc: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" />
      <path d="M8 13h8M8 17h5" />
    </svg>
  ),
  flag: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V4s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" />
    </svg>
  ),
  globe: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-[18px] w-[18px]">
      <circle cx="12" cy="12" r="9" /><path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18" />
    </svg>
  ),
  menu: I("M3 6h18M3 12h18M3 18h18"),
  close: I("M18 6 6 18M6 6l12 12"),
}

interface NavItem {
  href: string
  label: string
  short: string
  icon: React.ReactNode
  badge?: (b: NavBadges) => { n: number; tone: "danger" | "warn" | "accent" } | null
}

interface NavGroup { title?: string; items: NavItem[] }

const GROUPS: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Genel Bakış", short: "Özet", icon: Icon.dashboard },
      { href: "/istatistik", label: "İstatistik", short: "İstatistik", icon: Icon.chart },
    ],
  },
  {
    title: "Gönderim",
    items: [
      // ★ Push ayarları menüden çıktı: gönderim sayfasının içinden
      //   açılıyor. Menüde iki push girişi olması karışıklık yapıyordu.
      { href: "/gonderim", label: "Bildirim & Push", short: "Gönderim", icon: Icon.send },
      { href: "/popups",   label: "Popup'lar",       short: "Popup",    icon: Icon.popup },
      {
        // Reklam teklifleri, düzenleme onayları ve boost talepleri
        href: "/reklamlar", label: "Reklamlar", short: "Reklam", icon: Icon.megaphone,
        badge: (b) => (b.reklam > 0 ? { n: b.reklam, tone: "danger" } : null),
      },
    ],
  },
  {
    title: "İletişim",
    items: [
      {
        href: "/mail", label: "Mail", short: "Mail", icon: Icon.mail,
        badge: (b) => (b.mail > 0 ? { n: b.mail, tone: "danger" } : null),
      },
      { href: "/medya", label: "Medya", short: "Medya", icon: Icon.image },
    ],
  },
  {
    title: "Kullanıcılar",
    items: [
      {
        href: "/kullanicilar", label: "Kullanıcılar", short: "Kullanıcı", icon: Icon.users,
        badge: (b) => (b.tutarsiz > 0 ? { n: b.tutarsiz, tone: "danger" } : null),
      },
      { href: "/icerikler", label: "İçerikler", short: "İçerik", icon: Icon.grid },
      { href: "/sehirler",  label: "Şehirler",  short: "Şehir",  icon: Icon.globe },
      {
        // ★ Tek giriş: iki onay sayfası /onay içinden seçiliyor.
        href: "/onay", label: "Onaylar", short: "Onay", icon: Icon.store,
        badge: (b) => {
          const n = b.bekleyenIsletme + b.bekleyenOgrenci
          return n > 0 ? { n, tone: "accent" } : null
        },
      },
    ],
  },
  {
    title: "Güvenlik",
    items: [
      {
        href: "/reports", label: "Şikâyetler", short: "Şikâyet", icon: Icon.flag,
        badge: (b) => (b.sikayet > 0 ? { n: b.sikayet, tone: "danger" } : null),
      },
      {
        // Cihaz ve IP banları da bu sayfanın sekmelerinde
        href: "/banlar", label: "Banlar", short: "Ban", icon: Icon.ban,
        badge: (b) => (b.banli > 0 ? { n: b.banli, tone: "danger" } : null),
      },
      { href: "/audit",       label: "İşlem kaydı", short: "Kayıt",    icon: Icon.log },
      { href: "/politikalar", label: "Politikalar", short: "Politika", icon: Icon.doc },
      { href: "/ayarlar",     label: "Ayarlar",     short: "Ayar",     icon: Icon.gear },
    ],
  },
]

/** Alt çubukta gösterilecek sık kullanılanlar */
const QUICK = ["/", "/gonderim", "/reklamlar", "/kullanicilar"]

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(href + "/")
}

function BadgeDot({ n, tone }: { n: number; tone: "danger" | "warn" | "accent" }) {
  // ★ Sarı kullanılmıyor — kırmızı ya da vurgu rengi
  const c = {
    danger: "bg-danger/18 text-danger",
    warn:   "bg-danger/18 text-danger",
    accent: "bg-accent/18 text-accent",
  }[tone]
  return (
    <span className={cn("ml-auto rounded-full px-1.5 py-[1px] text-[11px] font-bold tabular-nums", c)}>
      {n > 99 ? "99+" : n}
    </span>
  )
}

function NavLink({
  item, badges, onNavigate,
}: { item: NavItem; badges: NavBadges; onNavigate?: () => void }) {
  const pathname = usePathname()
  const active = isActive(pathname, item.href)
  const badge = item.badge?.(badges) ?? null

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
        active ? "bg-accent/12 text-accent" : "text-muted hover:bg-white/[0.05] hover:text-text"
      )}
    >
      <span className={active ? "text-accent" : "text-faint"}>{item.icon}</span>
      <span className="truncate">{item.label}</span>
      {badge && <BadgeDot {...badge} />}
    </Link>
  )
}

function Brand({ small }: { small?: boolean }) {
  // ★ Sadece logo — "Kays Admin" yazısı ve kullanıcı adı kaldırıldı.
  //   Menü başlığı zaten sayfa başlığında var; tekrar etmesi gereksizdi.
  const size = small ? 34 : 42
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      {/* public/kays1.png → karanlık tema · public/kays.png → açık tema */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/kays1.png"
        alt="Kays"
        width={size}
        height={size}
        className="block h-full w-full rounded-[10px] object-contain"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/kays.png"
        alt="Kays"
        width={size}
        height={size}
        className="absolute inset-0 hidden h-full w-full rounded-[10px] object-contain"
        data-light-logo
      />
    </span>
  )
}

function LogoutButton() {
  return (
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
  )
}

/* ═══════════════ MASAÜSTÜ ═══════════════ */

export function DesktopSidebar({
  theme, badges,
}: { theme: Theme; badges: NavBadges }) {
  return (
    /* ★ sticky + h-dvh: sayfa uzun olsa da menü ekranla birlikte kalıyor.
          Tema anahtarı ve çıkış her zaman görünür; aşağı kaydırmaya gerek yok.
          Menü kendi içinde kayar (overflow-y-auto). */
    <aside className="sticky top-0 hidden h-dvh lg:flex lg:w-[236px] lg:shrink-0 lg:flex-col lg:border-r lg:border-hairline lg:bg-surface">
      <div className="flex items-center px-5 py-5">
        <Brand />
      </div>

      <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {GROUPS.map((g, i) => (
          <div key={g.title ?? i} className="space-y-1">
            {g.title && (
              <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
                {g.title}
              </div>
            )}
            {g.items.map((it) => (
              <NavLink key={it.href} item={it} badges={badges} />
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto shrink-0 space-y-2 border-t border-hairline p-3">
        <ThemeToggle initial={theme} />
        <LogoutButton />
      </div>
    </aside>
  )
}

/* ═══════════════ MOBİL ═══════════════ */

export function MobileNav({
  theme, badges,
}: { theme: Theme; badges: NavBadges }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Sayfa değişince çekmece kapansın
  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => { document.body.style.overflow = prev }
  }, [open])

  const quickItems = GROUPS.flatMap((g) => g.items).filter((i) => QUICK.includes(i.href))
  const bekleyen = badges.bekleyenIsletme + badges.bekleyenOgrenci

  return (
    <>
      {/* ── Üst başlık ── */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-hairline glass px-4 py-2.5 lg:hidden">
        <Brand small />
        <div className="flex items-center gap-1">
          <ThemeToggle initial={theme} compact />
          <button
            type="button"
            aria-label="Menü"
            onClick={() => setOpen(true)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/[0.06] hover:text-text"
          >
            {Icon.menu}
            {bekleyen > 0 && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent" />
            )}
          </button>
        </div>
      </header>

      {/* ── Çekmece ── */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="animate-slide-in absolute left-0 top-0 flex h-full w-[290px] flex-col border-r border-border bg-surface shadow-pop">
            <div className="flex items-center justify-between px-4 py-4">
              <Brand small />
              <button
                type="button"
                aria-label="Kapat"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:text-text"
              >
                {Icon.close}
              </button>
            </div>

            <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-4">
              {GROUPS.map((g, i) => (
                <div key={g.title ?? i} className="space-y-1">
                  {g.title && (
                    <div className="px-3 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
                      {g.title}
                    </div>
                  )}
                  {g.items.map((it) => (
                    <NavLink key={it.href} item={it} badges={badges} onNavigate={() => setOpen(false)} />
                  ))}
                </div>
              ))}
            </nav>

            <div className="space-y-3 border-t border-border p-3">
              <ThemeToggle initial={theme} />
              <LogoutButton />
            </div>
          </div>
        </div>
      )}

      {/* ── Alt sekme çubuğu ── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-hairline glass lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {quickItems.map((item) => {
          const active = isActive(pathname, item.href)
          const badge = item.badge?.(badges) ?? null
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors",
                active ? "text-accent" : "text-faint hover:text-muted"
              )}
            >
              {item.icon}
              {item.short}
              {badge && badge.n > 0 && (
                <span className={cn(
                  "absolute right-[22%] top-1.5 h-1.5 w-1.5 rounded-full",
                  badge.tone === "danger" ? "bg-danger" : badge.tone === "warn" ? "bg-warn" : "bg-accent"
                )} />
              )}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium text-faint transition-colors hover:text-muted"
        >
          {Icon.menu}
          Menü
        </button>
      </nav>
    </>
  )
}
