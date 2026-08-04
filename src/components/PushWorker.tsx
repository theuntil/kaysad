// src/components/PushWorker.tsx
"use client"

// ┌─ BU BİLEŞEN NE YAPIYOR ───────────────────────────────────────────┐
// │                                                                    │
// │ Push kuyruğunun kontrol merkezi:                                   │
// │  • Bekleyen bildirim sayısını gösterir                             │
// │  • "Bekleyenleri Gönder" butonu                                    │
// │  • OTOMATİK YOKLAMA — panel açıkken her 30 saniyede kuyruğu        │
// │    kontrol edip gönderir                                            │
// │                                                                    │
// │ ★ NEDEN OTOMATİK YOKLAMA VAR:                                      │
// │   Panel localde çalışıyorsa veritabanı ona HTTP isteği atamaz      │
// │   (localhost dışarıdan erişilemez). Bu yüzden trigger tetiklemesi   │
// │   çalışmaz. Yoklama bu boşluğu kapatıyor: panel açık olduğu sürece  │
// │   bildirimler en fazla 30 saniye gecikmeyle gidiyor.                │
// │                                                                    │
// │   Panel sunucuya taşınırsa trigger anında tetikler; yoklama yine    │
// │   yedek olarak kalır, zararı olmaz.                                 │
// │                                                                    │
// └────────────────────────────────────────────────────────────────────┘

import { useCallback, useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { processPendingPush } from "@/actions/push.actions"
import { Badge, Button, Card, CardTitle, ErrorBox, SuccessBox, WarnBox } from "@/components/ui"
import { fmtNum } from "@/lib/utils"

const POLL_INTERVAL_MS = 30_000

export function PushWorker({
  bekleyen,
  sistemAcik,
  sessizSaatte,
  hasExpoToken,
}: {
  bekleyen: number
  sistemAcik: boolean
  sessizSaatte: boolean
  hasExpoToken: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [autoPoll, setAutoPoll] = useState(true)
  const [lastRun, setLastRun] = useState<Date | null>(null)
  const [running, setRunning] = useState(false)

  // setInterval içinden güncel değere erişmek için ref
  const runningRef = useRef(false)
  runningRef.current = running

  const run = useCallback(
    (silent: boolean) => {
      if (runningRef.current) return
      setRunning(true)
      if (!silent) setMsg(null)

      startTransition(async () => {
        try {
          const res = await processPendingPush({ source: "manual", limit: 200 })
          setLastRun(new Date())

          // Sessiz modda (otomatik yoklama) sadece iş yapıldıysa mesaj göster —
          // her 30 saniyede "0 bildirim" yazması gürültü olur.
          if (!silent || (res.gonderilen ?? 0) > 0) {
            setMsg({
              ok: res.ok,
              text: res.ok ? res.message ?? "Tamamlandı." : res.error ?? "Hata oluştu.",
            })
          }
          router.refresh()
        } catch (e) {
          if (!silent) {
            setMsg({ ok: false, text: e instanceof Error ? e.message : "Beklenmeyen hata." })
          }
        } finally {
          setRunning(false)
        }
      })
    },
    [router]
  )

  /* ── Otomatik yoklama ── */
  useEffect(() => {
    if (!autoPoll || !sistemAcik) return
    const id = setInterval(() => run(true), POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [autoPoll, sistemAcik, run])

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <CardTitle>
          Push kuyruğu
        </CardTitle>

        <div className="flex items-center gap-2">
          {sistemAcik ? (
            <Badge tone="live">sistem açık</Badge>
          ) : (
            <Badge tone="danger">sistem KAPALI</Badge>
          )}
          {sessizSaatte && <Badge tone="expired">sessiz saat</Badge>}
        </div>
      </div>

      {/* Uyarılar */}
      <div className="mb-4 space-y-3">
        {!sistemAcik && (
          <WarnBox>
            Push sistemi kapalı — hiçbir bildirim gönderilmiyor. Aşağıdaki
            <strong> Ayarlar</strong> bölümünden açabilirsin.
          </WarnBox>
        )}

        {!hasExpoToken && (
          <WarnBox>
            <strong>EXPO_ACCESS_TOKEN tanımlı değil.</strong> Push yine çalışır, ama token
            olmadan Expo gönderimi kimlik doğrulaması yapmaz — token&apos;ını bilen biri
            kullanıcılarına sahte bildirim gönderebilir. expo.dev → Account Settings →
            Access Tokens&apos;tan oluşturup <code className="font-mono">.env</code>&apos;e ekle.
          </WarnBox>
        )}

        {sessizSaatte && (
          <WarnBox>
            Şu an sessiz saat aralığında. Sadece <strong>acil</strong> olarak işaretlenmiş
            tipler (deprem uyarısı, hesap bildirimi) gönderiliyor.
          </WarnBox>
        )}
      </div>

      {/* Kuyruk durumu */}
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-raised p-4">
        <div>
          <div className="text-[11.5px] font-medium uppercase tracking-wider text-faint">
            Bekleyen
          </div>
          <div
            className={
              bekleyen > 0
                ? "mt-1 text-3xl font-bold tabular-nums text-warn"
                : "mt-1 text-3xl font-bold tabular-nums text-accent"
            }
          >
            {fmtNum(bekleyen)}
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button onClick={() => run(false)} disabled={pending || running || !sistemAcik}>
            {running ? "Gönderiliyor…" : "Bekleyenleri Gönder"}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAutoPoll((v) => !v)}
            title="Panel açıkken 30 saniyede bir kuyruğu kontrol eder"
          >
            {autoPoll ? "Otomatik: açık" : "Otomatik: kapalı"}
          </Button>
        </div>
      </div>

      {lastRun && (
        <p className="mt-3 text-[11.5px] text-faint">
          Son kontrol: {lastRun.toLocaleTimeString("tr-TR")}
          {autoPoll && sistemAcik ? " · sonraki 30 sn içinde" : ""}
        </p>
      )}

      {msg && (
        <div className="mt-4">
          {msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>}
        </div>
      )}
    </Card>
  )
}
