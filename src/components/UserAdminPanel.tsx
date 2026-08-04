// src/components/UserAdminPanel.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// KULLANICI YÖNETİM PANELİ (detay sayfasının işlem yapan kısmı)
//
// Üç ayrı yetki burada toplanıyor:
//   • Hesap banı (isteğe bağlı olarak cihazlarıyla birlikte)
//   • Cihaz banı (hesaba dokunmadan, tek tek)
//   • Ban kaydı kaldırma
//
// ★ Ban penceresi "cihazları da banla" anahtarını AÇIK başlatır. Sebep:
//   hesabı banlayıp cihazı serbest bırakmak, kullanıcının 2 dakikada
//   yeni hesap açıp devam etmesi anlamına geliyor. Ama kapatılabiliyor —
//   ortak kullanılan bir tablet olabilir.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  banDeviceAction, removeBanRecordAction,
} from "@/actions/ban.actions"
import {
  Badge, Button, Card, CardTitle, EmptyState, ErrorBox, Field, Input,
  Modal, Spinner, SuccessBox, Switch, Table, Td, Textarea, Th, WarnBox,
} from "@/components/ui"
import { fmtDate, timeAgo } from "@/lib/utils"
import type { BanRow, DeviceRow } from "@/lib/types.v3"

export function UserAdminPanel({
  userId, devices, bans,
}: {
  userId: string
  devices: DeviceRow[]
  bans: BanRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)


  /* cihaz banı penceresi */
  const [devTarget, setDevTarget] = useState<DeviceRow | null>(null)
  const [devReason, setDevReason] = useState("")

  function done(message?: string, error?: string) {
    setBusy(false)
    if (error) { setErr(error); return }
    setErr(null)
    setOk(message ?? "İşlem tamamlandı.")
    router.refresh()
  }


  async function doDeviceBan() {
    if (!devTarget) return
    setBusy(true); setErr(null); setOk(null)
    const r = await banDeviceAction({ deviceId: devTarget.device_id, reason: devReason })
    if (!r.ok) { setBusy(false); setErr(r.error ?? "Cihaz banlanamadı."); return }
    setDevTarget(null); setDevReason("")
    done(r.message)
  }

  async function doRemoveBan(banId: string) {
    setBusy(true); setErr(null); setOk(null)
    const r = await removeBanRecordAction(banId)
    done("Ban kaydı kaldırıldı.", r.ok ? undefined : r.error ?? "Kaldırılamadı.")
  }

  return (
    <div className="space-y-5">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      {/* ══════ CİHAZLAR ══════ */}
      <Card padded={false}>
        <div className="px-5 pt-5">
          <CardTitle>
            Cihazlar ({devices.length})
          </CardTitle>
        </div>

        {devices.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState title="Kayıtlı cihaz yok" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <thead>
                <tr>
                  <Th>Cihaz</Th>
                  <Th>IP</Th>
                  <Th>Push</Th>
                  <Th>Son giriş</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {devices.map((d) => (
                  <tr key={d.device_id}>
                    <Td>
                      <div className="font-mono text-[12px] text-text">{d.device_id.slice(0, 22)}…</div>
                      <div className="text-[11.5px] text-faint">{d.model ?? "Model bilinmiyor"}</div>
                    </Td>
                    <Td className="font-mono text-[12px] text-muted">
                      {d.ip ?? <span className="text-faint">yok</span>}
                      {d.ip_banned && <span className="ml-1.5 text-[11px] text-danger">banlı</span>}
                    </Td>
                    <Td>
                      {d.has_push_token
                        ? d.push_enabled === false
                          ? <Badge tone="off">Kapalı</Badge>
                          : <Badge tone="live">Açık</Badge>
                        : <Badge tone="neutral">Token yok</Badge>}
                    </Td>
                    <Td className="text-[12.5px] text-muted">
                      {d.last_login_at ? timeAgo(d.last_login_at) : "—"}
                    </Td>
                    <Td className="text-right">
                      {d.is_banned ? (
                        <Badge tone="danger">Banlı</Badge>
                      ) : (
                        <Button variant="danger" size="sm" onClick={() => setDevTarget(d)} disabled={busy}>
                          Cihazı banla
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ══════ BAN KAYITLARI ══════ */}
      <Card>
        <CardTitle>
          Ban kayıtları ({bans.length})
        </CardTitle>

        {bans.length === 0 ? (
          <EmptyState title="Ban kaydı yok" />
        ) : (
          <ul className="space-y-2">
            {bans.map((b) => (
              <li key={b.id} className="rounded-xl border border-border bg-raised px-4 py-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <Badge tone={b.device_id ? "expired" : "danger"}>
                        {b.device_id ? "Cihaz banı" : "Hesap banı"}
                      </Badge>
                      {b.is_active === false && <Badge tone="off">Kaldırılmış</Badge>}
                      {b.suresi_gecti && <Badge tone="neutral">Süresi geçti</Badge>}
                      <span className="text-[11.5px] text-faint">{timeAgo(b.created_at)}</span>
                    </div>
                    <p className="text-[13.5px] text-text">{b.reason ?? "Sebep yazılmamış"}</p>
                    {b.notes && <p className="mt-0.5 text-[12px] text-muted">{b.notes}</p>}
                    <p className="mt-1 text-[11.5px] text-faint">
                      {b.until_at ? `Bitiş: ${fmtDate(b.until_at)}` : "Kalıcı"}
                      {b.banned_by ? ` · ${b.banned_by}` : ""}
                      {b.device_id ? ` · ${b.device_id.slice(0, 14)}…` : ""}
                    </p>
                  </div>
                  {b.is_active !== false && (
                    <Button variant="secondary" size="sm" onClick={() => doRemoveBan(b.id)} disabled={busy}>
                      Kaldır
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ══════ CİHAZ BANI PENCERESİ ══════ */}
      <Modal
        open={!!devTarget}
        onClose={() => setDevTarget(null)}
        title="Cihazı banla"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDevTarget(null)} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={doDeviceBan} disabled={busy || !devReason.trim()}>
              {busy && <Spinner />} Cihazı banla
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl border border-border bg-raised p-3 font-mono text-[12px] text-muted">
            {devTarget?.device_id}
          </p>
          <Field label="Sebep" required>
            <Input value={devReason} onChange={(e) => setDevReason(e.target.value)} autoFocus />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
