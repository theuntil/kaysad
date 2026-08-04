// src/components/DevicesList.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// CİHAZ YÖNETİMİ
//
// ★ Buradaki ban HESABA DOKUNMAZ. Amaç: aynı telefondan sürekli sahte
//   hesap açan kullanıcıyı, mevcut hesabını cezalandırmadan durdurmak.
//
// "kaç hesap" kolonu önemli: bir cihazı 8 hesap kullanmışsa ya ortak
// bir tablet ya da hesap fabrikası. Banlamadan önce ona bak.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { banDeviceAction } from "@/actions/ban.actions"
import {
  Avatar, Badge, Button, EmptyState, ErrorBox, Field, Input, Modal,
  Spinner, SuccessBox, Table, Td, Th, WarnBox,
} from "@/components/ui"
import { timeAgo } from "@/lib/utils"
import type { DeviceRow } from "@/lib/types.v3"

export function DevicesList({ items }: { items: DeviceRow[] }) {
  const router = useRouter()
  const [target, setTarget] = useState<DeviceRow | null>(null)
  const [reason, setReason] = useState("")
  const [until, setUntil] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function ban() {
    if (!target) return
    setBusy(true); setErr(null); setOk(null)
    const r = await banDeviceAction({
      deviceId: target.device_id,
      reason,
      until: until ? new Date(until).toISOString() : null,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? "Cihaz banlanamadı."); return }
    setTarget(null); setReason(""); setUntil("")
    setOk(r.message ?? "Cihaz banlandı.")
    router.refresh()
  }

  if (items.length === 0) {
    return <EmptyState title="Cihaz bulunamadı" />
  }

  return (
    <div className="space-y-3">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <Table minWidth={880}>
        <thead>
          <tr>
            <Th>Cihaz</Th>
            <Th>IP</Th>
            <Th>Sahibi</Th>
            <Th className="text-right">Hesap</Th>
            <Th>Push</Th>
            <Th>Son giriş</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.device_id} className="transition-colors hover:bg-white/[0.03]">
              <Td>
                {/* ★ Cihaza tıklayınca kendi detay sayfası açılır */}
                <Link href={`/cihazlar/${encodeURIComponent(d.device_id)}`} className="group block">
                  <div className="font-mono text-[12px] text-text group-hover:text-accent">
                    {d.device_id.slice(0, 24)}…
                  </div>
                  <div className="text-[11.5px] text-faint">
                    {d.model ?? "Model bilinmiyor"}{d.platform ? ` · ${d.platform}` : ""}
                  </div>
                </Link>
              </Td>
              <Td className="font-mono text-[12px]">
                {d.ip ?? <span className="text-faint">yok</span>}
                {d.ip_banned && <div className="text-[11px] text-danger">IP banlı</div>}
              </Td>
              <Td>
                {d.user_id ? (
                  <Link href={`/kullanicilar/${d.user_id}`} className="flex items-center gap-2 hover:text-accent">
                    <Avatar url={d.avatar_url} name={d.username} size={28} />
                    <span className="truncate text-[13px]">{d.username ?? d.user_id.slice(0, 8)}</span>
                  </Link>
                ) : (
                  <Badge tone="expired">Sahipsiz</Badge>
                )}
              </Td>
              <Td className="text-right tabular-nums">
                <span className={(d.user_count ?? 0) > 2 ? "font-semibold text-warn" : "text-muted"}>
                  {d.user_count ?? 0}
                </span>
              </Td>
              <Td>
                {d.has_push_token
                  ? d.push_enabled === false ? <Badge tone="off">Kapalı</Badge> : <Badge tone="live">Açık</Badge>
                  : <Badge tone="neutral">Token yok</Badge>}
              </Td>
              <Td className="text-[12.5px] text-muted">
                {d.last_login_at ? timeAgo(d.last_login_at) : "—"}
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  {d.is_banned ? (
                    <Badge tone="danger">Banlı</Badge>
                  ) : (
                    <Button variant="danger" size="sm" onClick={() => setTarget(d)}>Banla</Button>
                  )}
                  <Link href={`/cihazlar/${encodeURIComponent(d.device_id)}`}>
                    <Button variant="secondary" size="sm">Detay</Button>
                  </Link>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title="Sadece cihazı banla"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={ban} disabled={busy || !reason.trim()}>
              {busy && <Spinner />} Cihazı banla
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="rounded-xl border border-border bg-raised p-3 font-mono text-[12px] text-muted">
            {target?.device_id}
          </p>

          {(target?.user_count ?? 0) > 1 && (
            <WarnBox>
              Bu cihazı <strong>{target?.user_count} farklı hesap</strong> kullanmış.
              Banlarsan hepsi bu cihazdan giriş yapamaz — ortak kullanılan bir cihaz
              olabilir, emin ol.
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
    </div>
  )
}
