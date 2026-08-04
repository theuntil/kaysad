// src/components/UserBanButton.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// KULLANICI BAN DÜĞMESİ (sayfa başlığında)
//
// ★ Ban en sık kullanılan işlem olduğu için sayfanın en altındaki
//   "Yönetim" kartından çıkarılıp başlığa alındı — "Listeye dön"ün solunda.
//
// ★ Cihazlar ve IP'ler TEK ban kaydına yazılır (bans.device_ids / ips).
//   Eskiden her cihaz için ayrı satır açılıyordu.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { useRouter } from "next/navigation"
import { banUserAction, unbanUserAction } from "@/actions/ban.actions"
import {
  Badge, Button, ErrorBox, Field, Input, Modal, Spinner, Switch, Textarea, WarnBox,
} from "@/components/ui"

export function UserBanButton({
  userId, username, isBanned, deviceCount, ipCount,
}: {
  userId: string
  username: string | null
  isBanned: boolean
  deviceCount: number
  ipCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [until, setUntil] = useState("")
  const [banDevices, setBanDevices] = useState(true)
  const [banIps, setBanIps] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function ban() {
    setBusy(true); setErr(null)
    const r = await banUserAction({
      userId, reason, notes: notes || null,
      until: until ? new Date(until).toISOString() : null,
      banDevices, banIps,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? "Banlanamadı."); return }
    setOpen(false); setReason(""); setNotes(""); setUntil("")
    router.refresh()
  }

  async function unban() {
    setBusy(true); setErr(null)
    const r = await unbanUserAction(userId)
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? "Ban kaldırılamadı."); return }
    router.refresh()
  }

  if (isBanned) {
    return (
      <>
        {err && <div className="w-full"><ErrorBox>{err}</ErrorBox></div>}
        <Button variant="secondary" size="sm" onClick={unban} disabled={busy}>
          {busy && <Spinner />} Banı kaldır
        </Button>
      </>
    )
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
          <circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" />
        </svg>
        Hesabı banla
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`${username ?? "Kullanıcı"} banlanacak`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={ban} disabled={busy || !reason.trim()}>
              {busy && <Spinner />} Banla
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {err && <ErrorBox>{err}</ErrorBox>}

          <Field label="Ban sebebi" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={300} />
          </Field>

          <Field label="İç not">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>

          <Field label="Bitiş tarihi">
            <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>

          <Switch
            checked={banDevices}
            onChange={setBanDevices}
            label={`Cihazlarını da banla (${deviceCount})`}
            disabled={deviceCount === 0}
          />

          <Switch
            checked={banIps}
            onChange={setBanIps}
            label={`IP'lerini de banla (${ipCount})`}
            tone="warn"
            disabled={ipCount === 0}
          />

          {banIps && (
            <WarnBox>
              IP banı geniş vurur. Süreli vermen ve önce cihaz banını denemen önerilir.
            </WarnBox>
          )}

          <div className="flex flex-wrap gap-1.5">
            <Badge tone="neutral">Tek ban kaydı</Badge>
            {banDevices && deviceCount > 0 && <Badge tone="expired">{deviceCount} cihaz</Badge>}
            {banIps && ipCount > 0 && <Badge tone="promo">{ipCount} IP</Badge>}
          </div>
        </div>
      </Modal>
    </>
  )
}
