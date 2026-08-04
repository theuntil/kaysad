// src/components/IpsList.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// IP YÖNETİMİ
//
// ★ IP banı en riskli önlem: mobil operatörler CGNAT arkasından binlerce
//   aboneyi aynı IP ile çıkarır. Bu yüzden her satırda "kaç kullanıcı"
//   yazıyor ve 1'den fazlaysa sarı uyarı çıkıyor. Ban penceresi de aynı
//   uyarıyı tekrarlıyor — yanlışlıkla yüzlerce kişiyi kesmeyelim.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { useRouter } from "next/navigation"
import { banIpAction } from "@/actions/ban.actions"
import {
  Badge, Button, EmptyState, ErrorBox, Field, Input, Modal, Spinner,
  SuccessBox, Table, Td, Th, WarnBox,
} from "@/components/ui"
import { timeAgo } from "@/lib/utils"
import type { IpRow } from "@/lib/types.v3"

export function IpsList({ items }: { items: IpRow[] }) {
  const router = useRouter()
  const [target, setTarget] = useState<IpRow | null>(null)
  const [manual, setManual] = useState(false)
  const [ip, setIp] = useState("")
  const [reason, setReason] = useState("")
  const [until, setUntil] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function ban() {
    setBusy(true); setErr(null); setOk(null)
    const r = await banIpAction({
      ip: target?.ip ?? ip,
      reason,
      until: until ? new Date(until).toISOString() : null,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? "IP banlanamadı."); return }
    setTarget(null); setManual(false); setIp(""); setReason(""); setUntil("")
    setOk(r.message ?? "IP banlandı.")
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => { setManual(true); setReason("") }}>
          Elle IP banla
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Kayıtlı IP yok"
        />
      ) : (
        <Table minWidth={720}>
          <thead>
            <tr>
              <Th>IP</Th>
              <Th className="text-right">Kullanıcı</Th>
              <Th className="text-right">Cihaz</Th>
              <Th>Son görülme</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.ip} className="transition-colors hover:bg-white/[0.03]">
                <Td>
                  <div className="font-mono text-[12.5px] text-text">{r.ip}</div>
                  {r.ornek_kullanici && (
                    <div className="text-[11.5px] text-faint">ör. @{r.ornek_kullanici}</div>
                  )}
                </Td>
                <Td className="text-right tabular-nums">
                  <span className={r.kullanici > 1 ? "font-semibold text-warn" : "text-muted"}>
                    {r.kullanici}
                  </span>
                </Td>
                <Td className="text-right tabular-nums text-muted">{r.cihaz}</Td>
                <Td className="text-[12.5px] text-muted">
                  {r.son_gorulme ? timeAgo(r.son_gorulme) : "—"}
                </Td>
                <Td className="text-right">
                  {r.is_banned
                    ? <Badge tone="danger">Banlı</Badge>
                    : <Button variant="danger" size="sm" onClick={() => { setTarget(r); setReason("") }}>Banla</Button>}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal
        open={!!target || manual}
        onClose={() => { setTarget(null); setManual(false) }}
        title="IP banla"
        footer={
          <>
            <Button variant="ghost" onClick={() => { setTarget(null); setManual(false) }} disabled={busy}>
              Vazgeç
            </Button>
            <Button
              variant="danger"
              onClick={ban}
              disabled={busy || !reason.trim() || (!target && !ip.trim())}
            >
              {busy && <Spinner />} Banla
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {target ? (
            <p className="rounded-xl border border-hairline bg-raised p-3 font-mono text-[12.5px] text-muted">
              {target.ip}
            </p>
          ) : (
            <Field label="IP adresi" required>
              <Input value={ip} onChange={(e) => setIp(e.target.value)} autoFocus />
            </Field>
          )}

          {(target?.kullanici ?? 0) > 1 && (
            <WarnBox>
              Bu IP&apos;yi <strong>{target?.kullanici} farklı kullanıcı</strong> kullanmış.
              Operatör NAT&apos;ı olabilir — banlarsan masum kullanıcılar da uygulamaya
              giremez. Cihaz banı genellikle daha doğru araçtır.
            </WarnBox>
          )}

          <Field label="Sebep" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </Field>

          <Field label="Bitiş tarihi">
            <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
