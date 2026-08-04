// src/components/PopupActions.tsx
"use client"

// Düzenleme sayfasının üstündeki hızlı işlem şeridi:
// istatistikler + bildirim olarak gönder + geçmiş sıfırla + durum değiştir.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  togglePopupAction, resetPopupViewsAction, sendPopupAsNotificationAction,
} from "@/actions/popup.actions"
import { Badge, Button, Card, ErrorBox, Input, SuccessBox, WarnBox } from "@/components/ui"
import type { Popup } from "@/lib/types"
import { fmtNum, popupLiveState } from "@/lib/utils"

export function PopupActions({ popup }: { popup: Popup }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showNotifyForm, setShowNotifyForm] = useState(false)
  const [notifyMessage, setNotifyMessage] = useState("")
  const [confirmReset, setConfirmReset] = useState(false)

  const live = popupLiveState(popup)
  const ctr = popup.goruntulenme > 0 ? ((popup.tiklanma / popup.goruntulenme) * 100).toFixed(1) : "0"

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setMsg(null)
    startTransition(async () => {
      const res = await fn()
      setMsg({ ok: res.ok, text: res.ok ? (res.message ?? "Tamamlandı.") : (res.error ?? "Hata.") })
      setConfirmReset(false)
      setShowNotifyForm(false)
      router.refresh()
    })
  }

  return (
    <Card>
      {/* Durum + istatistik */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={live.tone}>{live.label}</Badge>
          <span className="text-[12.5px] text-faint">
            öncelik {popup.priority} · {popup.placement}
            {popup.target_screen ? `/${popup.target_screen}` : ""}
          </span>
        </div>

        <div className="flex gap-5">
          <div className="text-right">
            <div className="text-[17px] font-bold tabular-nums text-text">{fmtNum(popup.goruntulenme)}</div>
            <div className="text-[10.5px] text-faint">gösterim</div>
          </div>
          <div className="text-right">
            <div className="text-[17px] font-bold tabular-nums text-info">{fmtNum(popup.tiklanma)}</div>
            <div className="text-[10.5px] text-faint">tıklama</div>
          </div>
          <div className="text-right">
            <div className="text-[17px] font-bold tabular-nums text-accent">{ctr}%</div>
            <div className="text-[10.5px] text-faint">oran</div>
          </div>
        </div>
      </div>

      {/* İşlem butonları */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => run(() => togglePopupAction(popup.id, !popup.is_active))}
        >
          {popup.is_active ? "Yayından kaldır" : "Yayına al"}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => { setShowNotifyForm((v) => !v); setMsg(null) }}
        >
          Bildirim olarak gönder
        </Button>

        {confirmReset ? (
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-warn">Tüm kullanıcılara yeniden gösterilecek — emin misin?</span>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => run(() => resetPopupViewsAction(popup.id))}
            >
              Evet, sıfırla
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>Vazgeç</Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
            Gösterim geçmişini sıfırla
          </Button>
        )}
      </div>

      {/* Bildirim gönderme formu */}
      {showNotifyForm && (
        <div className="mt-4 animate-fade-up space-y-3 rounded-xl border border-border bg-raised p-4">
          <p className="text-[12.5px] leading-relaxed text-muted">
            Bu popup, <strong className="text-text">tüm aktif kullanıcılara</strong> bildirim olarak gönderilir.
            Kullanıcı bildirime bastığında popup açılır. Şehir/öğrenci filtresi gerekiyorsa{" "}
            <strong className="text-text">Bildirimler</strong> sayfasını kullan.
          </p>
          <div>
            <Input
              value={notifyMessage}
              onChange={(e) => setNotifyMessage(e.target.value)}
              placeholder={`Bildirim metni (boşsa "${popup.title}" kullanılır)`}
              maxLength={200}
            />
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => sendPopupAsNotificationAction(popup.id, notifyMessage.trim() || null))}
            >
              {pending ? "Gönderiliyor…" : "Gönder"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowNotifyForm(false)}>Vazgeç</Button>
          </div>
        </div>
      )}

      {/* Uyarılar */}
      {live.tone === "expired" && (
        <div className="mt-4">
          <WarnBox>
            Bu popup&apos;ın bitiş tarihi geçmiş — artık hiç gösterilmiyor.
            Tekrar yayınlamak için bitiş tarihini ileri al veya temizle.
          </WarnBox>
        </div>
      )}

      {msg && <div className="mt-4">{msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>}</div>}
    </Card>
  )
}
