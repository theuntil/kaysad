// src/components/StudentApprovals.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// ÖĞRENCİ ONAYI
//
// Belge (ogrenci_belgesi) bir URL — kartta doğrudan görüntüleniyor,
// indirmeye gerek yok. Kaçıncı başvuru olduğu da yazıyor: 3. kez aynı
// bulanık fotoğrafı gönderen biri için farklı davranmak isteyebilirsin.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { decideStudentAction } from "@/actions/approval.actions"
import {
  Avatar, Badge, Button, EmptyState, ErrorBox, Field, Modal, Spinner,
  SuccessBox, Textarea,
} from "@/components/ui"
import { fmtDate } from "@/lib/utils"
import type { StudentApplication } from "@/lib/types.v3"

export function StudentApprovals({ items }: { items: StudentApplication[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [reject, setReject] = useState<StudentApplication | null>(null)
  const [reason, setReason] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function approve(a: StudentApplication) {
    setBusy(a.id); setErr(null); setOk(null)
    const r = await decideStudentAction({ userId: a.id, approved: true })
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Onaylanamadı."); return }
    setOk(`@${a.username} öğrenci olarak doğrulandı.`)
    router.refresh()
  }

  async function doReject() {
    if (!reject) return
    setBusy(reject.id); setErr(null); setOk(null)
    const r = await decideStudentAction({ userId: reject.id, approved: false, rejectReason: reason })
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Reddedilemedi."); return }
    setReject(null); setReason("")
    setOk(r.message ?? "Başvuru reddedildi.")
    router.refresh()
  }

  if (items.length === 0) {
    return <EmptyState title="Bekleyen öğrenci başvurusu yok" />
  }

  return (
    <div className="space-y-4">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      {items.map((a) => (
        <div key={a.id} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <Avatar url={a.avatar_url} name={a.username ?? a.name} size={44} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[15px] font-semibold text-text">@{a.username ?? "—"}</span>
                  {(a.ogrenci_basvuru_sayisi ?? 0) > 1 && (
                    <Badge tone="expired">{a.ogrenci_basvuru_sayisi}. başvuru</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {a.name ?? "İsim girilmemiş"} · {a.sehir ?? "Şehir belirtilmemiş"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-faint">
                  Başvuru: {fmtDate(a.ogrenci_basvuru_tarih)}
                </p>
                {a.ogrenci_red_sebep && (
                  <p className="mt-1 text-[11.5px] text-warn">
                    Önceki red: {a.ogrenci_red_sebep}
                  </p>
                )}
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

          {/* Öğrenci belgesi */}
          {a.ogrenci_belgesi ? (
            <a
              href={a.ogrenci_belgesi}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-xl border border-border bg-raised"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.ogrenci_belgesi}
                alt="Öğrenci belgesi"
                className="max-h-[340px] w-full object-contain"
              />
              <span className="block border-t border-border px-3 py-2 text-[11.5px] text-faint">
                Belgeyi yeni sekmede büyüt →
              </span>
            </a>
          ) : (
            <p className="rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-3 text-[12.5px] text-warn">
              Belge yüklenmemiş. Onaylamadan önce kullanıcıdan belge istemen gerekir.
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
