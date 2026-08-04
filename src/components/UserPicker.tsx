// src/components/UserPicker.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// KULLANICI SEÇİCİ
//
// Hem "tek kişiye bildirim gönder" hem "kullanıcıya ban ekle" ekranı
// bunu kullanıyor. Arama kullanıcı adı, isim, e-posta, telefon ve UUID
// üzerinden çalışıyor.
//
// ★ Arama 350 ms geciktirilerek yapılıyor (debounce). Her harfte sorgu
//   atmak service_role ile auth.users'a gereksiz yük bindiriyordu.
// ★ Sonuçta cihaz/push sayısı da görünüyor: push alamayacak birine
//   "sadece push" göndermeye çalışmayı baştan görüyorsun.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react"
import { quickUserSearch, type QuickUser } from "@/actions/users.actions"
import { Avatar, Badge, Input, Spinner } from "@/components/ui"
import { formatPhoneTr, label } from "@/lib/format"
import { cn } from "@/lib/utils"

export function UserPicker({
  selected, onChange, multiple = false, placeholder = "Kullanıcı adı, isim, e-posta, telefon ya da UUID",
  autoFocus = false,
}: {
  selected: QuickUser[]
  onChange: (users: QuickUser[]) => void
  multiple?: boolean
  placeholder?: string
  autoFocus?: boolean
}) {
  const [q, setQ] = useState("")
  const [items, setItems] = useState<QuickUser[]>([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!q.trim()) { setItems([]); setLoading(false); return }

    setLoading(true)
    timer.current = setTimeout(async () => {
      const r = await quickUserSearch(q, 12)
      setLoading(false)
      setErr(r.error ?? null)
      setItems(r.items)
      setOpen(true)
    }, 350)

    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q])

  function pick(u: QuickUser) {
    if (multiple) {
      if (selected.some((s) => s.user_id === u.user_id)) return
      onChange([...selected, u])
    } else {
      onChange([u])
      setOpen(false)
      setQ("")
    }
  }

  function drop(id: string) {
    onChange(selected.filter((s) => s.user_id !== id))
  }

  return (
    <div className="space-y-2.5">
      <div className="relative">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
        />
        {loading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-faint">
            <Spinner />
          </span>
        )}
      </div>

      {err && <p className="text-[12px] text-danger">{err}</p>}

      {/* Sonuçlar */}
      {open && q.trim() !== "" && (
        <div className="max-h-[300px] overflow-y-auto rounded-xl border border-hairline bg-surface">
          {items.length === 0 && !loading ? (
            <p className="px-3.5 py-4 text-center text-[12.5px] text-faint">
              Eşleşen kullanıcı bulunamadı.
            </p>
          ) : (
            <ul>
              {items.map((u) => {
                const secili = selected.some((s) => s.user_id === u.user_id)
                return (
                  <li key={u.user_id}>
                    <button
                      type="button"
                      onClick={() => pick(u)}
                      disabled={secili}
                      className={cn(
                        "flex w-full items-center gap-3 border-b border-hairline px-3.5 py-2.5 text-left transition-colors last:border-0",
                        secili ? "opacity-45" : "hover:bg-white/[0.05]"
                      )}
                    >
                      <Avatar url={u.avatar_url} name={u.username ?? u.name ?? u.email} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13.5px] font-medium text-text">
                            {u.username ?? <span className="text-warn">Profil yok</span>}
                          </span>
                          {u.is_banned && <Badge tone="danger">Banlı</Badge>}
                          {u.role === "business" && <Badge tone="scheduled">İşletme</Badge>}
                        </span>
                        <span className="block truncate text-[11.5px] text-faint">
                          {u.name ? `${u.name} · ` : ""}
                          {u.email ?? (u.phone ? formatPhoneTr(u.phone) : u.user_id.slice(0, 8))}
                          {u.sehir ? ` · ${u.sehir}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-[11px] text-faint">
                        {u.push_device_count > 0
                          ? `${u.push_device_count} cihaz`
                          : <span className="text-warn">Push yok</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Seçilenler */}
      {selected.length > 0 && (
        <ul className="space-y-1.5">
          {selected.map((u) => (
            <li
              key={u.user_id}
              className="flex items-center gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2"
            >
              <Avatar url={u.avatar_url} name={u.username ?? u.email} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-text">
                  {u.username ?? u.user_id.slice(0, 8)}
                </span>
                <span className="block truncate text-[11px] text-faint">
                  {u.email ?? formatPhoneTr(u.phone)} · {label.role(u.role)}
                  {u.push_device_count === 0 ? " · push alamıyor" : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => drop(u.user_id)}
                aria-label="Kaldır"
                className="shrink-0 text-faint transition-colors hover:text-danger"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
