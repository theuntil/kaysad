// src/components/MaintenancePanel.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// KUYRUK VE TEMİZLİK
//
// Otomatik temizlik her gece 04:00'te çalışıyor. Buradakiler elle
// tetikleme için.
//
// ★ Kuyruk temizlemede iki mod var ve farkı önemli:
//   "Sadece push'u iptal et" → bildirim uygulamada görünmeye devam eder
//   "Bildirimleri sil"       → hiç olmamış gibi olur
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  clearPushQueueAction, runCleanupAction, type QueueStatus,
} from "@/actions/maintenance.actions"
import {
  Badge, Button, Card, CardTitle, ErrorBox, Modal, Spinner, SuccessBox, WarnBox,
} from "@/components/ui"
import { fmtNum, timeAgo } from "@/lib/utils"

export function MaintenancePanel({ queue }: { queue: QueueStatus | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [clear, setClear] = useState<null | "skip" | "delete">(null)

  async function calistir(anahtar: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(anahtar); setErr(null); setOk(null)
    const r = await fn()
    setBusy(null); setClear(null)
    if (!r.ok) { setErr(r.error ?? "İşlem başarısız."); return }
    setOk(r.message ?? "Tamamlandı.")
    router.refresh()
  }

  const bekleyen = (queue?.pending ?? 0) + (queue?.sending ?? 0)

  return (
    <div className="space-y-5">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <Card>
        <CardTitle>Push kuyruğu</CardTitle>

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { l: "Bekleyen", v: queue?.pending ?? 0, t: (queue?.pending ?? 0) > 0 ? "text-danger" : "text-text" },
            { l: "Gönderiliyor", v: queue?.sending ?? 0, t: "text-info" },
            { l: "Başarısız", v: queue?.failed ?? 0, t: (queue?.failed ?? 0) > 0 ? "text-danger" : "text-faint" },
            { l: "Uyandırma", v: queue?.uyandirma_sayisi ?? 0, t: "text-muted" },
          ].map((k) => (
            <div key={k.l} className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
              <div className="text-[11px] uppercase tracking-wider text-faint">{k.l}</div>
              <div className={`text-[18px] font-bold tabular-nums ${k.t}`}>{fmtNum(k.v)}</div>
            </div>
          ))}
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {queue?.push_acik === false && <Badge tone="danger">Push kapalı</Badge>}
          {queue?.sessiz_saat && <Badge tone="expired">Sessiz saat</Badge>}
          {queue?.en_eski && bekleyen > 0 && (
            <Badge tone="neutral">En eski: {timeAgo(queue.en_eski)}</Badge>
          )}
          {queue?.son_uyandirma && (
            <Badge tone="neutral">Son tetikleme: {timeAgo(queue.son_uyandirma)}</Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={bekleyen === 0 || busy !== null}
            onClick={() => setClear("skip")}
          >
            Push&apos;u iptal et
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={bekleyen === 0 || busy !== null}
            onClick={() => setClear("delete")}
          >
            Kuyruğu sil
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Temizlik</CardTitle>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { k: "notifications" as const, ad: "Bildirimler", not: "10 günden eski · kişi başı son 10 korunur" },
            { k: "audit" as const, ad: "İşlem kayıtları", not: "30 günden eski" },
            { k: "push_log" as const, ad: "Push kayıtları", not: "7 günden eski" },
            { k: "all" as const, ad: "Hepsi", not: "Gece 04:00'te otomatik çalışır" },
          ].map((c) => (
            <div
              key={c.k}
              className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-raised px-3.5 py-3"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-text">{c.ad}</div>
                <div className="text-[11px] text-faint">{c.not}</div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={() => calistir(c.k, () => runCleanupAction(c.k))}
              >
                {busy === c.k && <Spinner />} Çalıştır
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={clear !== null}
        onClose={() => setClear(null)}
        title={clear === "skip" ? "Push'u iptal et" : "Kuyruğu sil"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setClear(null)} disabled={busy !== null}>Vazgeç</Button>
            <Button
              variant="danger"
              disabled={busy !== null}
              onClick={() => clear && calistir("clear", () => clearPushQueueAction(clear))}
            >
              {busy === "clear" && <Spinner />}
              {clear === "skip" ? "İptal et" : "Sil"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-muted">
            Kuyrukta <strong className="text-text">{fmtNum(bekleyen)}</strong> bildirim var.
          </p>
          {clear === "skip" ? (
            <p className="text-[13px] leading-relaxed text-muted">
              Telefona push gönderilmeyecek ama bildirimler uygulamada görünmeye
              devam edecek.
            </p>
          ) : (
            <WarnBox>
              Bildirim kayıtları tamamen silinecek — kullanıcılar bu bildirimleri
              uygulamada da göremeyecek. Geri alınamaz.
            </WarnBox>
          )}
        </div>
      </Modal>
    </div>
  )
}
