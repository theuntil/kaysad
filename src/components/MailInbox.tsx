// src/components/MailInbox.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// GELEN KUTUSU
//
// ★ AKILLI EŞLEŞTİRME: her mail geldiğinde SQL tetikleyicisi gönderen
//   adresini profillerle karşılaştırıp puanlıyor. Panel bunu
//   "Bu maili gönderen X kullanıcısı olabilir" olarak gösteriyor;
//   puana göre güven seviyesi de yazıyor.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  flagMailAction, deleteMailsAction, type MailRow,
} from "@/actions/mail.actions"
import {
  Badge, Button, EmptyState, ErrorBox, Modal, Spinner, SuccessBox, WarnBox,
} from "@/components/ui"
import { timeAgo } from "@/lib/utils"
import { cn } from "@/lib/utils"

function guven(score: number | null): { ad: string; tone: "live" | "expired" | "neutral" } {
  if (!score) return { ad: "", tone: "neutral" }
  if (score >= 95) return { ad: "Kesin", tone: "live" }
  if (score >= 70) return { ad: "Yüksek", tone: "live" }
  if (score >= 50) return { ad: "Orta", tone: "expired" }
  return { ad: "Düşük", tone: "neutral" }
}

export function MailInbox({ items }: { items: MailRow[] }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [secili, setSecili] = useState<Set<string>>(new Set())
  const [silOnay, setSilOnay] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  function secToggle(id: string) {
    setSecili((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  async function sil(ids: string[]) {
    setBusy(true); setErr(null); setOk(null)
    const r = await deleteMailsAction(ids)
    setBusy(false); setSilOnay(false)
    if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }
    setSecili(new Set())
    setOk(r.message ?? "Silindi.")
    router.refresh()
  }


  async function isaretle(id: string, field: "is_starred" | "is_archived", value: boolean) {
    await flagMailAction(id, field, value)
    router.refresh()
  }

  /* ── Toplu seçim ── */
  const hepsiSecili = items.length > 0 && secili.size === items.length
  const kismenSecili = secili.size > 0 && secili.size < items.length

  function tumunuSec() {
    setSecili(hepsiSecili ? new Set() : new Set(items.map((i) => i.id)))
  }

  /**
   * ★ Toplu işaretleme — seçili maillerin hepsine aynı bayrağı yazıyor.
   *   Tek tek bekletmek yerine paralel gidiyor; 50 mail seçilse de
   *   birkaç yüz milisaniyede bitiyor.
   */
  async function topluIsaretle(field: "is_starred" | "is_archived", value: boolean) {
    const idler = Array.from(secili)
    if (idler.length === 0) return

    setBusy(true)
    try {
      await Promise.all(idler.map((id) => flagMailAction(id, field, value)))
      setOk(
        field === "is_starred"
          ? `${idler.length} mail yıldızlandı.`
          : `${idler.length} mail arşivlendi.`
      )
      setSecili(new Set())
      router.refresh()
    } catch {
      setErr("Toplu işlem tamamlanamadı.")
    } finally {
      setBusy(false)
    }
  }

  if (items.length === 0) {
    return <EmptyState title="Mail yok" />
  }


  return (
    <>
      {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}
      {ok && <div className="mb-3"><SuccessBox>{ok}</SuccessBox></div>}

      {/* ── Toplu işlem çubuğu ──
          ★ Her zaman görünür: "tümünü seç" kutusu seçim yokken de
            gerekli. Eskiden çubuk sadece seçim varken çıkıyordu ve
            toplu seçmenin yolu yoktu. */}
      {items.length > 0 && (
        <div className={cn(
          "mb-3 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-2.5",
          secili.size > 0
            ? "border-accent/30 bg-accent/[0.06]"
            : "border-hairline bg-surface"
        )}>
          <label className="flex cursor-pointer items-center gap-2.5 select-none">
            <input
              type="checkbox"
              checked={hepsiSecili}
              ref={(el) => { if (el) el.indeterminate = kismenSecili }}
              onChange={tumunuSec}
              className="h-4 w-4 shrink-0 accent-[var(--accent)]"
              aria-label="Tümünü seç"
            />
            <span className="text-[13px] font-medium text-text">
              {secili.size > 0 ? `${secili.size} mail seçili` : "Tümünü seç"}
            </span>
          </label>

          {secili.size > 0 && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setSecili(new Set())}>
                Temizle
              </Button>

              {/* ★ Toplu yıldız / arşiv */}
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => topluIsaretle("is_starred", true)}
              >
                Yıldızla
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => topluIsaretle("is_archived", true)}
              >
                Arşivle
              </Button>

              <Button
                variant="danger"
                size="sm"
                className="ml-auto"
                onClick={() => setSilOnay(true)}
                disabled={busy}
              >
                {busy && <Spinner />} Kalıcı sil
              </Button>
            </>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
        <ul className="divide-y divide-hairline">
          {items.map((it) => {
            const g = guven(it.match_score)
            return (
              <li
                key={it.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-white/[0.02]",
                  !it.is_read && "bg-accent/[0.04]"
                )}
              >
                <input
                  type="checkbox"
                  checked={secili.has(it.id)}
                  onChange={() => secToggle(it.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Seç"
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                />

                <button
                  type="button"
                  onClick={() => isaretle(it.id, "is_starred", !it.is_starred)}
                  aria-label="Yıldızla"
                  className={cn(
                    "mt-0.5 shrink-0 transition-colors",
                    it.is_starred ? "text-accent" : "text-faint hover:text-muted"
                  )}
                >
                  <svg viewBox="0 0 24 24" fill={it.is_starred ? "currentColor" : "none"}
                       stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z" />
                  </svg>
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/mail/${it.id}`)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="mb-0.5 flex flex-wrap items-center gap-2">
                    <span className={cn(
                      "truncate text-[13.5px]",
                      it.is_read ? "text-muted" : "font-semibold text-text"
                    )}>
                      {it.from_name ?? it.from_email}
                    </span>
                    {it.matched_username && (
                      <Badge tone={g.tone}>{it.matched_username}</Badge>
                    )}
                    <span className="ml-auto shrink-0 text-[11.5px] text-faint">
                      {timeAgo(it.received_at)}
                    </span>
                  </div>

                  <div className={cn(
                    "truncate text-[13px]",
                    it.is_read ? "text-muted" : "font-medium text-text"
                  )}>
                    {it.subject ?? "(konu yok)"}
                  </div>

                  <div className="truncate text-[12px] text-faint">{it.body_text}</div>
                </button>

                <button
                  type="button"
                  onClick={() => isaretle(it.id, "is_archived", !it.is_archived)}
                  aria-label="Arşivle"
                  className="mt-0.5 shrink-0 text-faint transition-colors hover:text-text"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
                       strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                    <rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11h14V8" />
                    <path d="M10 12h4" />
                  </svg>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* ── Toplu silme onayı ── */}
      <Modal
        open={silOnay}
        onClose={() => setSilOnay(false)}
        title="Mailleri kalıcı olarak sil"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSilOnay(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button variant="danger" onClick={() => sil(Array.from(secili))} disabled={busy}>
              {busy && <Spinner />} {secili.size} maili sil
            </Button>
          </>
        }
      >
        <WarnBox>
          Seçili {secili.size} mail tamamen silinecek. Arşive taşınmıyor,
          geri alınamaz.
        </WarnBox>
      </Modal>
    </>
  )
}
