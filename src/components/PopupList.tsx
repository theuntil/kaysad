// src/components/PopupList.tsx
"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  togglePopupAction, deletePopupAction, } from "@/actions/popup.actions"
import { Badge, Button, Card, EmptyState, ErrorBox, Input, Select, SuccessBox } from "@/components/ui"
import type { Popup } from "@/lib/types"
import { fmtNum, popupLiveState, timeAgo } from "@/lib/utils"

type Filter = "all" | "live" | "off" | "scheduled" | "expired"

const FREQ_LABEL: Record<string, string> = {
  once: "1 kez",
  once_per_day: "günde 1",
  n_times: "toplam N",
  max_per_day: "günde N",
  every_time: "her seferinde",
}

const PLACEMENT_LABEL: Record<string, string> = {
  app_open: "Açılışta",
  screen: "Ekran",
  notification: "Bildirim",
  manual: "Elle",
}

export function PopupList({ popups }: { popups: Popup[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [filter, setFilter] = useState<Filter>("all")
  const [q, setQ] = useState("")
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setMsg(null)
    startTransition(async () => {
      const res = await fn()
      setMsg({ ok: res.ok, text: res.ok ? (res.message ?? "Tamamlandı.") : (res.error ?? "Hata oluştu.") })
      setConfirmDelete(null)
      router.refresh()
    })
  }

  const filtered = popups.filter((p) => {
    if (filter !== "all" && popupLiveState(p).tone !== filter) return false
    if (q.trim()) {
      const needle = q.toLocaleLowerCase("tr")
      const hay = [p.title, p.description ?? "", p.note ?? "", (p.target_cities ?? []).join(" ")]
        .join(" ")
        .toLocaleLowerCase("tr")
      if (!hay.includes(needle)) return false
    }
    return true
  })

  const counts = {
    all: popups.length,
    live: popups.filter((p) => popupLiveState(p).tone === "live").length,
    scheduled: popups.filter((p) => popupLiveState(p).tone === "scheduled").length,
    expired: popups.filter((p) => popupLiveState(p).tone === "expired").length,
    off: popups.filter((p) => popupLiveState(p).tone === "off").length,
  }

  return (
    <div className="space-y-4">
      {/* Mesajlar */}
      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}

      {/* Filtreler */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Başlık, not veya şehir ara…" />
        </div>
        <div className="sm:w-[190px]">
          <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="all">Tümü ({counts.all})</option>
            <option value="live">Yayında ({counts.live})</option>
            <option value="scheduled">Planlandı ({counts.scheduled})</option>
            <option value="expired">Süresi doldu ({counts.expired})</option>
            <option value="off">Kapalı ({counts.off})</option>
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={popups.length === 0 ? "Henüz popup yok" : "Filtreye uyan popup yok"}
          action={
            popups.length === 0 ? (
              <Link href="/popups/new"><Button size="sm">Popup oluştur</Button></Link>
            ) : undefined
          }
        />
      ) : (
        /* ★ Masaüstünde 3 kart yan yana; eskiden tek popup tüm satırı
             kaplıyordu ve liste gereksiz uzuyordu. */
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => {
            const live = popupLiveState(p)
            const ctr = p.goruntulenme > 0 ? ((p.tiklanma / p.goruntulenme) * 100).toFixed(1) : "0"
            const isConfirming = confirmDelete === p.id

            return (
              <li key={p.id}>
                {/* ★ SADE KART: başlık, durum, iki sayı ve iki buton.
                      Yerleşim, sıklık, hedefleme, öncelik gibi ayrıntılar
                      düzenleme sayfasında — listede göz yoruyordu. */}
                <Card padded={false} className="flex h-full flex-col overflow-hidden">
                  <Link href={`/popups/${p.id}`} className="group block flex-1 p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge tone={live.tone}>{live.label}</Badge>
                      <span className="ml-auto text-[11px] text-faint">{timeAgo(p.created_at)}</span>
                    </div>

                    <h3 className="truncate text-[15px] font-semibold text-text group-hover:text-accent">
                      {p.title}
                    </h3>

                    {p.description && (
                      <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-muted">
                        {p.description}
                      </p>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-xl border border-hairline bg-raised px-3 py-2">
                        <div className="text-[15px] font-bold tabular-nums text-text">
                          {fmtNum(p.goruntulenme)}
                        </div>
                        <div className="text-[10.5px] uppercase tracking-wider text-faint">Gösterim</div>
                      </div>
                      <div className="rounded-xl border border-hairline bg-raised px-3 py-2">
                        <div className="text-[15px] font-bold tabular-nums text-text">{ctr}%</div>
                        <div className="text-[10.5px] uppercase tracking-wider text-faint">Tıklanma</div>
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2 border-t border-hairline px-4 py-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => togglePopupAction(p.id, !p.is_active))}
                    >
                      {p.is_active ? "Durdur" : "Yayına al"}
                    </Button>

                    <Link href={`/popups/${p.id}`}>
                      <Button variant="ghost" size="sm">Düzenle</Button>
                    </Link>

                    <div className="ml-auto">
                      {isConfirming ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={pending}
                            onClick={() => run(() => deletePopupAction(p.id))}
                          >
                            Sil
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
                            Vazgeç
                          </Button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          aria-label="Sil"
                          onClick={() => setConfirmDelete(p.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
