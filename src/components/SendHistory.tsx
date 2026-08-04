// src/components/SendHistory.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// GÖNDERİM GEÇMİŞİ
//
// Aynı duyuru binlerce satır oluşturduğu için mesaja göre gruplanıp tek
// satır gösteriliyor. Her satırda hangi kanaldan gittiği ve push'ların
// akıbeti var — "bildirim gitmedi" şikâyetinin cevabı burada.
//
// ★ Geri al: yalnızca uygulama içi satırları siler. Telefona düşmüş
//   push geri alınamaz; onay penceresi bunu açıkça yazıyor.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { undoSendAction } from "@/actions/send.actions"
import {
  Badge, Button, EmptyState, ErrorBox, Modal, Spinner, SuccessBox, WarnBox,
} from "@/components/ui"
import { timeAgo } from "@/lib/utils"
import type { SendHistoryRow } from "@/lib/types.v3"

import { label } from "@/lib/format"

export function SendHistory({ items }: { items: SendHistoryRow[] }) {
  const router = useRouter()
  const [target, setTarget] = useState<SendHistoryRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function doUndo() {
    if (!target) return
    setBusy(true); setErr(null); setOk(null)
    const r = await undoSendAction({
      type: target.type,
      message: target.message,
      withinMinutes: 60 * 24,
    })
    setBusy(false)
    setTarget(null)
    if (!r.ok) { setErr(r.error ?? "Geri alınamadı."); return }
    setOk(r.message ?? "Geri alındı.")
    router.refresh()
  }

  if (items.length === 0) {
    return <EmptyState title="Henüz gönderim yok" />
  }

  return (
    <div className="space-y-3">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <ul className="space-y-2">
        {items.map((it, i) => {
          const pushToplam = it.push_sent + it.push_failed
          return (
            <li
              key={`${it.type}-${i}`}
              className="rounded-xl border border-border bg-raised px-4 py-3.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={it.type === "earthquake" ? "danger" : it.type === "popup" ? "scheduled" : "promo"}>
                      {label.sendType(it.type)}
                    </Badge>
                    <Badge tone={it.kanal === "inapp" ? "neutral" : "live"}>
                      {it.kanal === "inapp" ? "Sadece uygulama içi" : "Uygulama içi + push"}
                    </Badge>
                    <span className="text-[11.5px] text-faint">{timeAgo(it.son)}</span>
                  </div>

                  <p className="break-words text-[13.5px] leading-relaxed text-text">{it.message}</p>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-faint">
                    <span>{it.adet.toLocaleString("tr")} kullanıcı</span>
                    <span>{it.okunan.toLocaleString("tr")} okundu</span>
                    {it.kanal !== "inapp" && (
                      <>
                        <span className={it.push_sent > 0 ? "text-accent/80" : undefined}>
                          {it.push_sent.toLocaleString("tr")} push gitti
                        </span>
                        {it.push_failed > 0 && (
                          <span className="text-danger/80">{it.push_failed} başarısız</span>
                        )}
                        {pushToplam === 0 && it.push_skip > 0 && (
                          <span className="text-warn/80">push atlandı ({it.push_skip})</span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  {/* ★ Detay: okunma, push sonucu, şehir kırılımı, hatalar */}
                  <Link
                    href={`/gonderim/detay?tip=${encodeURIComponent(it.type)}&mesaj=${encodeURIComponent(it.message)}`}
                  >
                    <Button variant="secondary" size="sm">İstatistik</Button>
                  </Link>
                  <Button variant="danger" size="sm" onClick={() => setTarget(it)}>
                    Geri al
                  </Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title="Gönderimi geri al"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={doUndo} disabled={busy}>
              {busy && <Spinner />} Sil
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px] leading-relaxed">
          <p className="rounded-xl border border-border bg-raised p-3.5 text-muted">
            {target?.message}
          </p>

          {(target?.push_sent ?? 0) > 0 && (
            <WarnBox>
              Bu gönderimin <strong>{target?.push_sent}</strong> push&apos;u telefonlara zaten
              düştü. Silmek onları geri almaz — kullanıcı bildirimi gördü. Sadece uygulama
              içindeki kayıt kaybolur.
            </WarnBox>
          )}

          <p className="text-faint">
            {target?.adet.toLocaleString("tr")} bildirim satırı silinecek. Bu işlem geri alınamaz.
          </p>
        </div>
      </Modal>
    </div>
  )
}
