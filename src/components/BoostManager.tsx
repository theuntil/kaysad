// src/components/BoostManager.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// BOOST YÖNETİMİ
//
// boost       → içerik kendi şehrinde öne çıkar
// super_boost → tüm şehirlerde öne çıkar
//
// ★ Onaylandığında SQL tarafı içeriğin boost/super_boost bayrağını
//   otomatik açıyor (boost_apply_flags). Panel bayrağa elle dokunmuyor.
// ★ Süre her zaman 1 ay; uzatmak isteyen yeni teklif gönderiyor.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { decideBoostAction, stopBoostAction, type BoostRow } from "@/actions/ad.actions"
import {
  Avatar, Badge, Button, EmptyState, ErrorBox, Field, Modal, Spinner,
  SuccessBox, Textarea,
} from "@/components/ui"
import { label } from "@/lib/format"
import { fmtNum, timeAgo } from "@/lib/utils"

const DURUM: Record<string, { ad: string; tone: "live" | "expired" | "off" | "neutral" }> = {
  pending:   { ad: "Bekliyor",     tone: "expired" },
  active:    { ad: "Aktif",        tone: "live" },
  rejected:  { ad: "Reddedildi",   tone: "off" },
  expired:   { ad: "Süresi doldu", tone: "neutral" },
  cancelled: { ad: "Durduruldu",   tone: "off" },
  approved:  { ad: "Onaylı",       tone: "live" },
}

export function BoostManager({ items }: { items: BoostRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [reject, setReject] = useState<BoostRow | null>(null)
  const [reason, setReason] = useState("")

  async function karar(b: BoostRow, onayla: boolean) {
    setBusy(b.id); setErr(null); setOk(null)
    const r = await decideBoostAction(b.id, onayla, onayla ? undefined : reason)
    setBusy(null); setReject(null); setReason("")
    if (!r.ok) { setErr(r.error ?? "İşlem başarısız."); return }
    setOk(r.message ?? "Tamam.")
    router.refresh()
  }

  async function durdur(b: BoostRow) {
    setBusy(b.id); setErr(null)
    const r = await stopBoostAction(b.id)
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Durdurulamadı."); return }
    setOk("Boost durduruldu.")
    router.refresh()
  }

  if (items.length === 0) return <EmptyState title="Boost talebi yok" />

  return (
    <div className="space-y-3">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
        <ul className="divide-y divide-hairline">
          {items.map((b) => {
            const d = DURUM[b.status] ?? { ad: b.status, tone: "neutral" as const }
            return (
              /*
                ★ KART TAMAMEN TIKLANABİLİR — reklam kartlarıyla aynı
                  desen. "Görüntüle" düğmesi kaldırıldı; ayrıca o düğme
                  sadece `pending` durumunda çıkıyordu, yani aktif bir
                  boost'un detayına ulaşmanın yolu YOKTU.

                  Görünmez bağlantı katmanı kartın üstüne yayılıyor,
                  içerideki düğmeler `relative z-10` ile üstte kalıyor.
              */
              <li
                key={b.id}
                className="group relative flex flex-wrap items-center gap-4 px-4 py-3.5 transition-colors hover:bg-raised"
              >
                <Link
                  href={`/reklamlar/boost/${b.id}`}
                  aria-label={`${b.content_title ?? "İçerik"} detayı`}
                  className="absolute inset-0 z-0"
                />
                <div className="min-w-0 flex-[3]">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <Badge tone={d.tone}>{d.ad}</Badge>
                    <Badge tone={b.boost_type === "super_boost" ? "promo" : "neutral"}>
                      {b.boost_type === "super_boost" ? "Süper boost" : "Boost"}
                    </Badge>
                    <Badge tone="neutral">{label.content(b.content_type)}</Badge>
                    {b.offer_no > 1 && <Badge tone="expired">{b.offer_no}. teklif</Badge>}
                  </div>
                  <div className="truncate text-[13.5px] font-medium text-text transition-colors group-hover:text-accent">
                    {b.content_title ?? b.content_id.slice(0, 8)}
                  </div>
                  {b.note && <div className="truncate text-[11.5px] text-muted">{b.note}</div>}
                  {b.reject_reason && (
                    <div className="truncate text-[11.5px] text-danger">Red: {b.reject_reason}</div>
                  )}
                </div>

                {/* ★ z-10: kart bağlantısının üstünde — profile gidiyor */}
                <Link
                  href={`/kullanicilar/${b.user_id}`}
                  className="relative z-10 flex min-w-0 flex-1 items-center gap-2 hover:text-accent"
                >
                  <Avatar url={b.avatar_url} name={b.username} size={26} />
                  <span className="truncate text-[12.5px] text-muted">{b.username ?? "—"}</span>
                </Link>

                <div className="shrink-0 text-right">
                  <div className="text-[14px] font-bold tabular-nums text-text">
                    {fmtNum(b.monthly_price)} ₺
                  </div>
                  <div className="text-[11px] text-faint">
                    {b.status === "active" && b.kalan_gun !== null
                      ? `${b.kalan_gun} gün kaldı`
                      : timeAgo(b.created_at)}
                  </div>
                </div>

                {/* ★ z-10: kart bağlantısının ÜSTÜNDE — onay/red
                    düğmelerine basınca detaya gitmiyor */}
                <div className="relative z-10 flex shrink-0 gap-1.5">
                  {b.status === "pending" && (
                    <>
                      <Button size="sm" disabled={busy === b.id} onClick={() => karar(b, true)}>
                        {busy === b.id && <Spinner />} Onayla
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={busy === b.id}
                        onClick={() => { setReason(""); setReject(b) }}
                      >
                        Reddet
                      </Button>
                    </>
                  )}
                  {b.status === "active" && (
                    <Button variant="secondary" size="sm" disabled={busy === b.id} onClick={() => durdur(b)}>
                      Durdur
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <Modal
        open={!!reject}
        onClose={() => setReject(null)}
        title="Boost talebini reddet"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReject(null)} disabled={!!busy}>Vazgeç</Button>
            <Button
              variant="danger"
              onClick={() => reject && karar(reject, false)}
              disabled={!!busy || !reason.trim()}
            >
              {busy && <Spinner />} Reddet
            </Button>
          </>
        }
      >
        <Field label="Red sebebi" required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
      </Modal>
    </div>
  )
}
