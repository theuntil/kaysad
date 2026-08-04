// src/components/DeviceBanButton.tsx
"use client"

// Cihaz detay sayfasındaki tek amaçlı ban düğmesi.
// Kullanıcı seçmeye gerek yok: elimizde device_id var, onu banlıyoruz.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { banDeviceAction } from "@/actions/ban.actions"
import {
  Button, ErrorBox, Field, Input, Modal, Spinner, WarnBox,
} from "@/components/ui"

export function DeviceBanButton({
  deviceId, userCount,
}: {
  deviceId: string
  userCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [until, setUntil] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function ban() {
    setBusy(true); setErr(null)
    const r = await banDeviceAction({
      deviceId, reason,
      until: until ? new Date(until).toISOString() : null,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? "Banlanamadı."); return }
    setOpen(false); setReason(""); setUntil("")
    router.refresh()
  }

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>Cihazı banla</Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cihazı banla"
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

          <p className="rounded-xl border border-hairline bg-raised p-3 font-mono text-[12px] text-muted">
            {deviceId}
          </p>

          {userCount > 1 && (
            <WarnBox>
              Bu cihazla <strong>{userCount} hesap</strong> giriş yapmış. Banlarsan
              hepsi bu cihazdan giremez.
            </WarnBox>
          )}

          <Field label="Sebep" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={300} />
          </Field>

          <Field label="Bitiş tarihi">
            <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </>
  )
}
