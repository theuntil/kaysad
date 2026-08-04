// src/components/RecipientPicker.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// ALICI SEÇİCİ — tek alan
//
// ★ Ayrı "kullanıcı ara" ve "e-posta yaz" kutuları vardı; gereksizdi.
//   Artık tek kutu: yazdıkça kullanıcı aranıyor, listeden seçebilirsin.
//   Seçmeden ENTER'a basarsan yazdığın metin e-posta adresi kabul
//   ediliyor (geçerli bir adresse).
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react"
import { quickUserSearch, type QuickUser } from "@/actions/users.actions"
import { Avatar, Badge, Input, Spinner } from "@/components/ui"
import { formatPhoneTr, isValidEmail } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface Recipient {
  email: string
  name?: string | null
  user?: QuickUser | null
}

export function RecipientPicker({
  value, onChange, autoFocus,
}: {
  value: Recipient | null
  onChange: (r: Recipient | null) => void
  autoFocus?: boolean
}) {
  const [q, setQ] = useState("")
  const [items, setItems] = useState<QuickUser[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [uyari, setUyari] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!q.trim() || value) { setItems([]); setLoading(false); return }

    setLoading(true)
    timer.current = setTimeout(async () => {
      const r = await quickUserSearch(q, 8)
      setLoading(false)
      setItems(r.items)
      setOpen(true)
    }, 300)

    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q, value])

  function sec(u: QuickUser) {
    if (!u.email) { setUyari("Bu kullanıcının e-posta adresi yok."); return }
    onChange({ email: u.email, name: u.name ?? u.username, user: u })
    setQ(""); setItems([]); setOpen(false); setUyari(null)
  }

  /** ★ Kullanıcı seçmeden ENTER: yazılan metni e-posta kabul et */
  function enter() {
    const metin = q.trim()
    if (!metin) return

    if (items.length === 1 && items[0].email) { sec(items[0]); return }

    if (isValidEmail(metin) && metin.includes("@")) {
      onChange({ email: metin.toLowerCase(), name: null, user: null })
      setQ(""); setItems([]); setOpen(false); setUyari(null)
      return
    }

    setUyari("Geçerli bir e-posta adresi yaz ya da listeden kullanıcı seç.")
  }

  /* ── Seçim yapıldıysa ── */
  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-accent/30 bg-accent/[0.06] px-3.5 py-2.5">
        {value.user ? (
          <Avatar url={value.user.avatar_url} name={value.user.username} size={32} />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-raised text-muted">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4">
              <rect x="2" y="4" width="20" height="16" rx="2.5" /><path d="m2 7 10 6 10-6" />
            </svg>
          </span>
        )}

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13.5px] font-medium text-text">
              {value.user?.username ?? value.email}
            </span>
            {value.user?.is_banned && <Badge tone="danger">Banlı</Badge>}
            {!value.user && <Badge tone="neutral">Serbest adres</Badge>}
          </span>
          <span className="block truncate text-[11.5px] text-faint">{value.email}</span>
        </span>

        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Kaldır"
          className="shrink-0 text-faint transition-colors hover:text-danger"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    )
  }

  /* ── Arama ── */
  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setUyari(null) }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); enter() }
            if (e.key === "Escape") setOpen(false)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Kullanıcı ara ya da e-posta yazıp Enter'a bas"
          autoFocus={autoFocus}
          spellCheck={false}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-faint">
            <Spinner />
          </span>
        )}
      </div>

      {uyari && <p className="text-[12px] text-danger">{uyari}</p>}

      {open && q.trim() && items.length > 0 && (
        <ul className="max-h-[240px] overflow-y-auto rounded-xl border border-hairline bg-surface">
          {items.map((u) => (
            <li key={u.user_id}>
              <button
                type="button"
                onClick={() => sec(u)}
                disabled={!u.email}
                className={cn(
                  "flex w-full items-center gap-3 border-b border-hairline px-3.5 py-2.5 text-left last:border-0",
                  u.email ? "hover:bg-white/[0.05]" : "opacity-45"
                )}
              >
                <Avatar url={u.avatar_url} name={u.username} size={30} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text">
                    {u.username ?? "Profil yok"}
                  </span>
                  <span className="block truncate text-[11.5px] text-faint">
                    {u.email ?? (u.phone ? formatPhoneTr(u.phone) : "e-posta yok")}
                  </span>
                </span>
                {!u.email && <span className="shrink-0 text-[11px] text-warn">E-posta yok</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && q.trim() && !loading && items.length === 0 && (
        <p className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5 text-[12.5px] text-muted">
          {isValidEmail(q.trim()) && q.includes("@")
            ? "Enter'a basarsan bu adrese gönderilir."
            : "Kullanıcı bulunamadı."}
        </p>
      )}
    </div>
  )
}
