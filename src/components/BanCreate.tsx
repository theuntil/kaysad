// src/components/BanCreate.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// ELLE BAN OLUŞTURMA
//
// ┌─ ÜÇ MOD ──────────────────────────────────────────────────────────┐
// │ Kullanıcı → arayıp seç (kullanıcı adı / isim / e-posta / telefon /  │
// │             UUID). İstersen cihazlarını ve IP'lerini de aynı anda   │
// │             banlayabilirsin.                                       │
// │ Cihaz     → elinde sadece device_id varsa; kullanıcı seçmek şart    │
// │             değil.                                                 │
// │ IP        → elinde sadece IP varsa.                                │
// └───────────────────────────────────────────────────────────────────┘
//
// ★ Kullanıcı seçmek ZORUNLU DEĞİL. "Ban her zaman bir hesaba bağlıdır"
//   varsayımı elde sadece cihaz kimliği olan durumları çözemiyordu.
//
// ★ Cihaz ya da IP'yi kaç hesabın kullandığı seçim anında gösteriliyor:
//   paylaşımlı bir IP'yi (CGNAT) körlemesine banlamayı engelliyor.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createBanAction, fetchDevices, fetchIps } from "@/actions/ban.actions"
import { UserPicker } from "@/components/UserPicker"
import {
  Avatar, Badge, Button, ErrorBox, Field, Input, Modal, Segmented,
  Spinner, SuccessBox, Switch, Textarea, WarnBox,
} from "@/components/ui"
import type { QuickUser } from "@/actions/users.actions"
import type { DeviceRow, IpRow } from "@/lib/types.v3"
import { cn } from "@/lib/utils"

type Mode = "user" | "device" | "ip"

export function BanCreate() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("user")

  /* hedefler */
  const [users, setUsers] = useState<QuickUser[]>([])
  const [deviceId, setDeviceId] = useState("")
  const [ip, setIp] = useState("")
  const [alsoDevices, setAlsoDevices] = useState(true)
  const [alsoIps, setAlsoIps] = useState(false)

  /* seçilen kullanıcının cihaz/IP'leri */
  const [userDevices, setUserDevices] = useState<DeviceRow[]>([])
  const [loadingDev, setLoadingDev] = useState(false)

  /* cihaz / IP arama yardımı */
  const [devHits, setDevHits] = useState<DeviceRow[]>([])
  const [ipHits, setIpHits] = useState<IpRow[]>([])
  const [searching, setSearching] = useState(false)

  /* ban bilgileri */
  const [reason, setReason] = useState("")
  const [notes, setNotes] = useState("")
  const [until, setUntil] = useState("")

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const user = users[0] ?? null

  /* Kullanıcı seçilince cihazlarını çek — kaç cihaz/IP etkilenecek */
  useEffect(() => {
    if (!user) { setUserDevices([]); return }
    setLoadingDev(true)
    fetchDevices({ query: user.username ?? user.user_id, filter: "all", limit: 50 })
      .then((r) => setUserDevices(r.items.filter((d) => d.user_id === user.user_id)))
      .finally(() => setLoadingDev(false))
  }, [user])

  /* Cihaz araması */
  async function searchDevice(q: string) {
    setDeviceId(q)
    if (q.trim().length < 3) { setDevHits([]); return }
    setSearching(true)
    const r = await fetchDevices({ query: q, filter: "all", limit: 8 })
    setSearching(false)
    setDevHits(r.items)
  }

  /* IP araması */
  async function searchIp(q: string) {
    setIp(q)
    if (q.trim().length < 3) { setIpHits([]); return }
    setSearching(true)
    const r = await fetchIps({ query: q, filter: "all", limit: 8 })
    setSearching(false)
    setIpHits(r.items)
  }

  function reset() {
    setUsers([]); setDeviceId(""); setIp("")
    setReason(""); setNotes(""); setUntil("")
    setDevHits([]); setIpHits([]); setUserDevices([])
    setAlsoDevices(true); setAlsoIps(false)
  }

  const hedefVar =
    (mode === "user" && !!user) ||
    (mode === "device" && deviceId.trim().length > 0) ||
    (mode === "ip" && ip.trim().length > 0)

  async function submit() {
    setBusy(true); setErr(null); setOk(null)

    // ★ TEK KAYIT: kullanıcı + cihazları + IP'leri hepsi BİR ban satırında.
    //   Eskiden 7 cihazlı kullanıcı 7 ayrı kayıt üretiyordu.
    if (mode === "user" && user) {
      const cihazlar = alsoDevices ? userDevices.map((d) => d.device_id) : []
      const ipler = alsoIps
        ? Array.from(new Set(userDevices.map((d) => d.ip).filter(Boolean) as string[]))
        : []

      const r = await createBanAction({
        userId: user.user_id,
        deviceIds: cihazlar,
        ips: ipler,
        reason, notes: notes || null,
        until: until ? new Date(until).toISOString() : null,
      })

      setBusy(false)
      if (!r.ok) { setErr(r.error ?? "Ban oluşturulamadı."); return }

      setOpen(false)
      setOk(r.message ?? "Ban oluşturuldu.")
      reset(); router.refresh()
      return
    }

    // Cihaz ya da IP modu
    const r = await createBanAction({
      deviceIds: mode === "device" ? [deviceId.trim()] : null,
      ips: mode === "ip" ? [ip.trim()] : null,
      reason,
      notes: notes || null,
      until: until ? new Date(until).toISOString() : null,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? "Ban oluşturulamadı."); return }

    setOpen(false)
    setOk(r.message ?? "Ban oluşturuldu.")
    reset(); router.refresh()
  }

  const secilenDevHit = devHits.find((d) => d.device_id === deviceId.trim())
  const secilenIpHit = ipHits.find((i) => i.ip === ip.trim())

  return (
    <>
      {ok && <div className="mb-4"><SuccessBox>{ok}</SuccessBox></div>}

      <Button size="sm" onClick={() => { reset(); setErr(null); setOpen(true) }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Ban ekle
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="lg"
        title="Yeni ban"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</Button>
            <Button
              variant="danger"
              onClick={submit}
              disabled={busy || !hedefVar || !reason.trim()}
            >
              {busy && <Spinner />} Banla
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {err && <ErrorBox>{err}</ErrorBox>}

          <Segmented
            value={mode}
            onChange={(v) => { setMode(v); setErr(null) }}
            options={[
              { value: "user",   label: "Kullanıcı", hint: "Arayıp seç" },
              { value: "device", label: "Cihaz",     hint: "device_id" },
              { value: "ip",     label: "IP",        hint: "IP adresi" },
            ]}
          />

          {/* ══════ KULLANICI MODU ══════ */}
          {mode === "user" && (
            <div className="space-y-3">
              <Field label="Kullanıcı" required>
                <div />
              </Field>
              <UserPicker selected={users} onChange={setUsers} autoFocus />

              {user && (
                <div className="space-y-2 rounded-xl border border-hairline bg-raised p-3.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar url={user.avatar_url} name={user.username} size={32} />
                    <div className="min-w-0">
                      <div className="truncate text-[13px] font-medium text-text">
                        {user.username ?? user.user_id.slice(0, 8)}
                      </div>
                      <div className="text-[11.5px] text-faint">
                        {loadingDev
                          ? "Cihazlar yükleniyor…"
                          : `${userDevices.length} cihaz · ${
                              new Set(userDevices.map((d) => d.ip).filter(Boolean)).size
                            } farklı IP`}
                      </div>
                    </div>
                    {user.is_banned && <Badge tone="danger">Zaten banlı</Badge>}
                  </div>

                  <Switch
                    checked={alsoDevices}
                    onChange={setAlsoDevices}
                    label={`Cihazlarını da banla (${userDevices.length})`}
                    disabled={userDevices.length === 0}
                  />

                  <Switch
                    checked={alsoIps}
                    onChange={setAlsoIps}
                    label={`IP'lerini de banla (${new Set(userDevices.map((d) => d.ip).filter(Boolean)).size})`}
                    tone="warn"
                    disabled={userDevices.every((d) => !d.ip)}
                  />

                  {alsoIps && (
                    <WarnBox>
                      IP banı geniş vurur. Süreli vermen ve önce cihaz banını
                      denemen önerilir.
                    </WarnBox>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ══════ CİHAZ MODU ══════ */}
          {mode === "device" && (
            <div className="space-y-2">
              <Field
                label="Cihaz kimliği (device_id)"
                required
              >
                <div className="relative">
                  <Input
                    value={deviceId}
                    onChange={(e) => void searchDevice(e.target.value)}
                    placeholder="ör. a3f9c2e1-…"
                    autoFocus
                    spellCheck={false}
                  />
                  {searching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-faint"><Spinner /></span>
                  )}
                </div>
              </Field>

              {devHits.length > 0 && (
                <ul className="max-h-[200px] overflow-y-auto rounded-xl border border-hairline">
                  {devHits.map((d) => (
                    <li key={d.device_id}>
                      <button
                        type="button"
                        onClick={() => { setDeviceId(d.device_id); setDevHits([d]) }}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 border-b border-hairline px-3.5 py-2.5 text-left last:border-0 hover:bg-white/[0.05]",
                          d.device_id === deviceId.trim() && "bg-accent/[0.07]"
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[12px] text-text">
                            {d.device_id}
                          </span>
                          <span className="block truncate text-[11.5px] text-faint">
                            {d.model ?? "Model bilinmiyor"}
                            {d.username ? ` · @${d.username}` : " · Sahipsiz"}
                            {d.ip ? ` · ${d.ip}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px]">
                          {d.is_banned
                            ? <Badge tone="danger">Banlı</Badge>
                            : <span className="text-faint">{d.user_count ?? 0} hesap</span>}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {secilenDevHit && (secilenDevHit.user_count ?? 0) > 1 && (
                <WarnBox>
                  Bu cihazı <strong>{secilenDevHit.user_count} hesap</strong> kullanmış.
                  Banlarsan hepsi bu cihazdan giriş yapamaz.
                </WarnBox>
              )}
            </div>
          )}

          {/* ══════ IP MODU ══════ */}
          {mode === "ip" && (
            <div className="space-y-2">
              <Field
                label="IP adresi"
                required
              >
                <div className="relative">
                  <Input
                    value={ip}
                    onChange={(e) => void searchIp(e.target.value)}
                    placeholder="ör. 88.230.12.44"
                    autoFocus
                    spellCheck={false}
                  />
                  {searching && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-faint"><Spinner /></span>
                  )}
                </div>
              </Field>

              {ipHits.length > 0 && (
                <ul className="max-h-[200px] overflow-y-auto rounded-xl border border-hairline">
                  {ipHits.map((i) => (
                    <li key={i.ip}>
                      <button
                        type="button"
                        onClick={() => { setIp(i.ip); setIpHits([i]) }}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 border-b border-hairline px-3.5 py-2.5 text-left last:border-0 hover:bg-white/[0.05]",
                          i.ip === ip.trim() && "bg-accent/[0.07]"
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-mono text-[12.5px] text-text">{i.ip}</span>
                          <span className="block text-[11.5px] text-faint">
                            {i.kullanici} kullanıcı · {i.cihaz} cihaz
                            {i.ornek_kullanici ? ` · ör. @${i.ornek_kullanici}` : ""}
                          </span>
                        </span>
                        {i.is_banned && <Badge tone="danger">Banlı</Badge>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {secilenIpHit && secilenIpHit.kullanici > 1 && (
                <WarnBox>
                  Bu IP&apos;yi <strong>{secilenIpHit.kullanici} farklı kullanıcı</strong> kullanmış.
                  Operatör NAT&apos;ı olabilir; masum kullanıcılar da engellenir.
                </WarnBox>
              )}
            </div>
          )}

          {/* ══════ BAN BİLGİLERİ ══════ */}
          <div className="space-y-3 border-t border-hairline pt-4">
            <Field label="Sebep" required>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
            </Field>

            <Field label="İç not">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <Field label="Bitiş tarihi">
              <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
            </Field>
          </div>
        </div>
      </Modal>
    </>
  )
}
