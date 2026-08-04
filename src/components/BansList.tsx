// src/components/BansList.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// BAN LİSTESİ
//
// Satır düzeni sabit üç sütun: HEDEF · SEBEP · TARİH + işlem.
// Her satır aynı yükseklikte ve aynı hizada.
//
// ★ Rozet sayısı en aza indirildi: kapsam ("Hesap · 7 cihaz · 2 IP") metin
//   olarak yazılıyor, rozet sadece yürürlükte olmayan banlarda çıkıyor.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { removeBanRecordAction } from "@/actions/ban.actions"
import {
  Avatar, Badge, Button, EmptyState, ErrorBox, Modal, Spinner, SuccessBox,
} from "@/components/ui"
import { fmtDate, timeAgo } from "@/lib/utils"
import type { BanRow } from "@/lib/types.v3"

export function BansList({ items }: { items: BanRow[] }) {
  const router = useRouter()
  const [target, setTarget] = useState<BanRow | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function remove() {
    if (!target) return
    setBusy(true); setErr(null); setOk(null)
    const r = await removeBanRecordAction(target.id)
    setBusy(false); setTarget(null)
    if (!r.ok) { setErr(r.error ?? "Kaldırılamadı."); return }
    setOk("Ban kaldırıldı.")
    router.refresh()
  }

  if (items.length === 0) {
    return <EmptyState title="Ban kaydı yok" />
  }

  return (
    <div className="space-y-3">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
        <ul className="divide-y divide-hairline">
          {items.map((b) => {
            const cihazAdet = b.device_adet ?? (b.device_id ? 1 : 0)
            const ipAdet = b.ip_adet ?? (b.ip ? 1 : 0)
            const durum = b.durum ?? (b.is_active === false ? "cancelled" : b.suresi_gecti ? "expired" : "active")

            const kapsam = [
              b.user_id ? "Hesap" : null,
              cihazAdet > 0 ? `${cihazAdet} cihaz` : null,
              ipAdet > 0 ? `${ipAdet} IP` : null,
            ].filter(Boolean).join(" · ")

            const hedefAd = b.user_id
              ? (b.username ?? b.email ?? b.user_id.slice(0, 8))
              : cihazAdet > 0
                ? `${(b.device_ids?.[0] ?? b.device_id ?? "").slice(0, 18)}…`
                : (b.ips?.[0] ?? b.ip ?? "—")

            return (
              <li
                key={b.id}
                className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.02]"
              >
                <div className="flex min-w-0 flex-[2] items-center gap-3">
                  <Avatar url={b.avatar_url} name={b.username ?? hedefAd} size={34} />
                  <div className="min-w-0">
                    {b.user_id ? (
                      <Link
                        href={`/kullanicilar/${b.user_id}`}
                        className="block truncate text-[13.5px] font-medium text-text hover:text-accent"
                      >
                        {hedefAd}
                      </Link>
                    ) : (
                      <span className="block truncate font-mono text-[12.5px] text-text">
                        {hedefAd}
                      </span>
                    )}
                    <span className="block truncate text-[11.5px] text-faint">{kapsam}</span>
                  </div>
                </div>

                <div className="hidden min-w-0 flex-[3] sm:block">
                  <span className="block truncate text-[13px] text-text">
                    {b.reason ?? "Sebep yazılmamış"}
                  </span>
                  <span className="block truncate text-[11.5px] text-faint">
                    {b.until_at ? `Bitiş: ${fmtDate(b.until_at)}` : "Kalıcı"}
                    {b.banned_by ? ` · ${b.banned_by}` : ""}
                  </span>
                </div>

                <div className="hidden w-[104px] shrink-0 text-right lg:block">
                  {durum === "active" ? (
                    <span className="text-[12px] text-muted">{timeAgo(b.created_at)}</span>
                  ) : (
                    <Badge tone={durum === "cancelled" ? "off" : "neutral"}>
                      {durum === "cancelled" ? "İptal" : "Süresi geçti"}
                    </Badge>
                  )}
                </div>

                <div className="shrink-0">
                  <Button variant="secondary" size="sm" onClick={() => setTarget(b)} disabled={busy}>
                    Kaldır
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title="Banı kaldır"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)} disabled={busy}>Vazgeç</Button>
            <Button onClick={remove} disabled={busy}>{busy && <Spinner />} Kaldır</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-[13px] leading-relaxed text-muted">
            {target?.reason ?? "Sebep yazılmamış"}
          </p>

          {((target?.device_ids?.length ?? 0) > 0 || (target?.ips?.length ?? 0) > 0) && (
            <div className="space-y-1 rounded-xl border border-hairline bg-raised p-3">
              {(target?.device_ids ?? []).map((d) => (
                <div key={d} className="break-all font-mono text-[11px] text-faint">{d}</div>
              ))}
              {(target?.ips ?? []).map((i) => (
                <div key={i} className="font-mono text-[11px] text-faint">{i}</div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
