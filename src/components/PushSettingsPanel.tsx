// src/components/PushSettingsPanel.tsx
"use client"

// ┌─ BU BİLEŞEN NE YAPIYOR ───────────────────────────────────────────┐
// │                                                                    │
// │ İki bölüm:                                                         │
// │  1) TİP AÇ/KAPA — hangi bildirim tipinin push gideceği. Kapatınca   │
// │     o tip uygulama içinde görünmeye devam eder, sadece telefona     │
// │     bildirim düşmez.                                                │
// │  2) SİSTEM AYARLARI — ana anahtar, sessiz saatler, panel URL'i      │
// │                                                                    │
// │ Ayarlar veritabanında tutuluyor (app_settings / push_settings),     │
// │ yani değiştirmek için yeniden deploy gerekmiyor.                    │
// │                                                                    │
// └────────────────────────────────────────────────────────────────────┘

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { setAppSetting, togglePushType } from "@/actions/push.actions"
import type { AppSetting, PushSetting } from "@/actions/push.actions"
import {
  Badge, Button, Card, CardTitle, ErrorBox, Input, Label,
  Select, SuccessBox, Table, Td, Th, WarnBox,
} from "@/components/ui"
import { fmtNum } from "@/lib/utils"

/* Tip adlarının okunabilir karşılıkları */
const TYPE_LABEL: Record<string, string> = {
  follow: "Takip",
  follow_request: "Takip isteği",
  follow_accepted: "Takip kabul",
  post_like: "Gönderi beğenisi",
  comment_like: "Yorum beğenisi",
  post_comment: "Gönderi yorumu",
  post_comment_reply: "Yorum yanıtı",
  tag: "Etiketleme",
  mention: "Bahsetme",
  message: "Mesaj",
  event_join: "Etkinlik katılımı",
  event_comment: "Etkinlik yorumu",
  event_comment_reply: "Etkinlik yanıtı",
  event_ticket: "Etkinlik bileti",
  discount_join: "İndirim katılımı",
  discount_comment: "İndirim yorumu",
  discount_comment_reply: "İndirim yanıtı",
  discount_ticket: "İndirim bileti",
  listing_favorite: "İlan favorisi",
  account_ban: "Hesap bildirimi",
  promo: "Kampanya",
  popup: "Popup",
  earthquake: "Acil uyarı",
}

const HOURS = ["", ...Array.from({ length: 24 }, (_, i) => String(i))]

export function PushSettingsPanel({
  settings,
  appSettings,
}: {
  settings: PushSetting[]
  appSettings: AppSetting[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const get = (key: string) => appSettings.find((s) => s.key === key)?.value ?? ""

  const [quietStart, setQuietStart] = useState(get("push_quiet_start"))
  const [quietEnd, setQuietEnd] = useState(get("push_quiet_end"))
  const [panelUrl, setPanelUrl] = useState(get("push_panel_url"))

  const pushEnabled = get("push_enabled") === "true"

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setMsg(null)
    startTransition(async () => {
      const res = await fn()
      setMsg({ ok: res.ok, text: res.ok ? res.message ?? "Kaydedildi." : res.error ?? "Hata." })
      router.refresh()
    })
  }

  const acikSayi = settings.filter((s) => s.enabled).length

  return (
    <div className="space-y-5">
      {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}

      {/* ═══ SİSTEM AYARLARI ═══ */}
      <Card>
        <CardTitle>
          Sistem ayarları
        </CardTitle>

        <div className="space-y-5">
          {/* Ana anahtar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-raised p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-text">Push sistemi</span>
                {pushEnabled ? <Badge tone="live">açık</Badge> : <Badge tone="danger">kapalı</Badge>}
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">
                Ana anahtar. Kapatınca hiçbir push gönderilmez — otomatik de manuel de.
                Bildirimler kuyrukta birikir, tekrar açınca gönderilir.
              </p>
            </div>
            <Button
              variant={pushEnabled ? "danger" : "primary"}
              size="sm"
              disabled={pending}
              onClick={() => run(() => setAppSetting("push_enabled", pushEnabled ? "false" : "true"))}
            >
              {pushEnabled ? "Kapat" : "Aç"}
            </Button>
          </div>

          {/* Sessiz saatler */}
          <div>
            <Label>
              Sessiz saatler
            </Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select value={quietStart} onChange={(e) => setQuietStart(e.target.value)}>
                  {HOURS.map((h) => (
                    <option key={h || "none"} value={h}>
                      {h === "" ? "— yok —" : `${h.padStart(2, "0")}:00`}
                    </option>
                  ))}
                </Select>
              </div>
              <span className="text-[13px] text-faint">→</span>
              <div className="flex-1">
                <Select value={quietEnd} onChange={(e) => setQuietEnd(e.target.value)}>
                  {HOURS.map((h) => (
                    <option key={h || "none"} value={h}>
                      {h === "" ? "— yok —" : `${h.padStart(2, "0")}:00`}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const a = await setAppSetting("push_quiet_start", quietStart || null)
                    if (!a.ok) return a
                    return setAppSetting("push_quiet_end", quietEnd || null)
                  })
                }
              >
                Kaydet
              </Button>
            </div>
            {quietStart !== "" && quietEnd === "" && (
              <p className="mt-2 text-[11.5px] text-warn">
                Başlangıç seçtin ama bitiş boş — ikisi de dolu olmalı, yoksa sessiz saat çalışmaz.
              </p>
            )}
          </div>

          {/* Panel URL */}
          <div>
            <Label>
              Panel adresi (otomatik tetikleme için)
            </Label>
            <div className="flex gap-2">
              <Input
                value={panelUrl}
                onChange={(e) => setPanelUrl(e.target.value)}
                placeholder="https://admin.kays.com.tr"
              />
              <Button
                variant="secondary"
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    setAppSetting("push_panel_url", panelUrl.trim().replace(/\/+$/, "") || null)
                  )
                }
              >
                Kaydet
              </Button>
            </div>
            {!panelUrl && (
              <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
                Şu an boş — bildirimler kuyrukta bekliyor ve panel açıkken gönderiliyor.
                Panel sunucuya taşındığında bu adresi girersen tetikleme anında olur.
              </p>
            )}
          </div>

          {panelUrl && (
            <WarnBox>
              Panel adresi girdiysen <code className="font-mono">.env</code> dosyandaki{" "}
              <code className="font-mono">PUSH_WEBHOOK_SECRET</code> değeri veritabanındaki
              gizli anahtarla <strong>aynı</strong> olmalı — yoksa veritabanının istekleri
              401 ile reddedilir. Gizli anahtar güvenlik gereği panelde gösterilmiyor;
              SQL ile ayarla:
              <br />
              <code className="mt-1.5 block font-mono text-[11.5px]">
                select admin_set_setting(&apos;push_webhook_secret&apos;, &apos;ANAHTAR&apos;);
              </code>
            </WarnBox>
          )}
        </div>
      </Card>

      {/* ═══ TİP AÇ/KAPA ═══ */}
      <Card padded={false}>
        <div className="p-5 pb-0">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <CardTitle>
              Bildirim tipleri
            </CardTitle>
            <Badge tone="neutral">
              {acikSayi}/{settings.length} açık
            </Badge>
          </div>
        </div>

        <Table className="rounded-none border-0 border-t border-border">
          <thead>
            <tr>
              <Th>Tip</Th>
              <Th>Başlık</Th>
              <Th className="text-right">7 günde</Th>
              <Th>Özellik</Th>
              <Th className="text-right">Durum</Th>
            </tr>
          </thead>
          <tbody>
            {settings.map((s) => (
              <tr key={s.type} className="transition-colors hover:bg-white/[0.02]">
                <Td>
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-medium text-text">
                      {TYPE_LABEL[s.type] ?? s.type}
                    </div>
                    <div className="truncate font-mono text-[11px] text-faint">{s.type}</div>
                  </div>
                </Td>
                <Td>
                  <span className="text-[12.5px] text-muted">{s.title_template ?? "—"}</span>
                </Td>
                <Td className="text-right tabular-nums">
                  <span className={s.gonderim_7g > 0 ? "text-text" : "text-faint"}>
                    {fmtNum(s.gonderim_7g)}
                  </span>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    {s.bypass_quiet && <Badge tone="danger">acil</Badge>}
                    {s.collapse_window_sec ? (
                      <Badge tone="neutral">{s.collapse_window_sec}sn grup</Badge>
                    ) : null}
                  </div>
                </Td>
                <Td className="text-right">
                  <Button
                    variant={s.enabled ? "secondary" : "ghost"}
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => togglePushType(s.type, !s.enabled))}
                  >
                    {s.enabled ? "Açık" : "Kapalı"}
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  )
}
