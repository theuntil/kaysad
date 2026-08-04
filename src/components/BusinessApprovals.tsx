// src/components/BusinessApprovals.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// İŞLETME HESABI ONAYI
//
// Başvurudaki her alan kartta görünüyor — işletme adı, kategori, adres,
// website, iletişim ve doğrulama durumları. Karar vermek için başka
// sayfaya gitmen gerekmiyor; şüphe varsa "profili aç" linki var.
//
// ★ Reddederken sebep ZORUNLU ve kullanıcıya gösteriliyor. Reddedilen
//   kullanıcı tekrar başvurabiliyor (business_durum='rejected'), sebep
//   sayesinde bu kez doğru belgeyle geliyor.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { decideBusinessAction } from "@/actions/approval.actions"
import {
  Avatar, Badge, Button, EmptyState, ErrorBox, Field, KeyValue, Modal,
  Spinner, SuccessBox, Textarea,
} from "@/components/ui"
import { fmtDate } from "@/lib/utils"
import type { BusinessApplication } from "@/lib/types.v3"

export function BusinessApprovals({ items }: { items: BusinessApplication[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [reject, setReject] = useState<BusinessApplication | null>(null)
  const [reason, setReason] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function approve(app: BusinessApplication) {
    setBusy(app.id); setErr(null); setOk(null)
    const r = await decideBusinessAction({ userId: app.id, approved: true })
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Onaylanamadı."); return }
    setOk(`${app.business_name ?? app.username} onaylandı.`)
    router.refresh()
  }

  async function doReject() {
    if (!reject) return
    setBusy(reject.id); setErr(null); setOk(null)
    const r = await decideBusinessAction({
      userId: reject.id, approved: false, rejectReason: reason,
    })
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Reddedilemedi."); return }
    setReject(null); setReason("")
    setOk(r.message ?? "Başvuru reddedildi.")
    router.refresh()
  }

  if (items.length === 0) {
    return <EmptyState title="Bekleyen başvuru yok" />
  }

  return (
    <div className="space-y-4">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      {items.map((a) => (
        <div key={a.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar url={a.business_avatar_url ?? a.avatar_url} name={a.business_name ?? a.username} size={48} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-text">
                    {a.business_name ?? "İşletme adı girilmemiş"}
                  </span>
                  {(a.business_count ?? 0) > 1 && (
                    <Badge tone="expired">{a.business_count}. başvuru</Badge>
                  )}
                  {a.email_verified && <Badge tone="live">E-posta doğrulandı</Badge>}
                  {a.phone_verify && <Badge tone="live">Telefon doğrulandı</Badge>}
                </div>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  @{a.username ?? "—"} · {a.name ?? "İsim girilmemiş"} · {a.sehir ?? "Şehir belirtilmemiş"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-faint">
                  Başvuru: {fmtDate(a.business_basvuru_tarih)}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              <Link href={`/kullanicilar/${a.id}`}>
                <Button variant="secondary" size="sm">Profili aç</Button>
              </Link>
              <Button variant="danger" size="sm" onClick={() => setReject(a)} disabled={busy === a.id}>
                Reddet
              </Button>
              <Button size="sm" onClick={() => approve(a)} disabled={busy === a.id}>
                {busy === a.id && <Spinner />} Onayla
              </Button>
            </div>
          </div>

          <div className="grid gap-x-6 sm:grid-cols-2">
            <div>
              <KeyValue label="Kategori" value={a.category ?? "—"} />
              <KeyValue label="Adres" value={a.address ?? "—"} />
              <KeyValue label="Website" value={a.website ?? "—"} mono />
            </div>
            <div>
              <KeyValue label="E-posta" value={a.email ?? "—"} mono />
              <KeyValue label="Telefon" value={a.phone ?? "—"} mono />
              <KeyValue
                label="Önceki red"
                value={a.business_red ?? "—"}
                tone={a.business_red ? "warn" : "faint"}
              />
            </div>
          </div>

          {a.bio && (
            <p className="mt-3 rounded-xl border border-border bg-raised p-3 text-[12.5px] leading-relaxed text-muted">
              {a.bio}
            </p>
          )}
        </div>
      ))}

      <Modal
        open={!!reject}
        onClose={() => setReject(null)}
        title="Başvuruyu reddet"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReject(null)} disabled={!!busy}>Vazgeç</Button>
            <Button variant="danger" onClick={doReject} disabled={!!busy || !reason.trim()}>
              {busy && <Spinner />} Reddet
            </Button>
          </>
        }
      >
        <Field
          label="Red sebebi"
          required
        >
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={400} autoFocus />
        </Field>
      </Modal>
    </div>
  )
}
