// src/components/UserDeleteButton.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// KULLANICIYI TAMAMEN SİL
//
// ★ İki aşamalı: önce SUNUCU NE SİLECEĞİNİ SAYAR (hiçbir şeye dokunmadan),
//   tablo tablo gösterilir; sonra kullanıcı adını yazarak onaylarsın.
//   Geri dönüşü olmayan bir işlemde "emin misin?" yeterli değil.
//
// ★ bans tablosu korunur — hesabını sildirip aynı cihazla dönmesin.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { useRouter } from "next/navigation"
import { previewDeleteUser, deleteUserCompletelyAction, type DeletePlan } from "@/actions/users.actions"
import { Button, ErrorBox, Input, Modal, Spinner, WarnBox } from "@/components/ui"
import { fmtNum } from "@/lib/utils"

export function UserDeleteButton({
  userId, username,
}: {
  userId: string
  username: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<DeletePlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [onay, setOnay] = useState("")
  const [err, setErr] = useState<string | null>(null)

  const anahtar = username ?? "SIL"

  async function ac() {
    setOpen(true); setLoading(true); setErr(null); setPlan(null); setOnay("")
    const r = await previewDeleteUser(userId)
    setLoading(false)
    if (!r.ok || !r.plan) { setErr(r.error ?? "Plan alınamadı."); return }
    setPlan(r.plan)
  }

  async function sil() {
    setBusy(true); setErr(null)
    const r = await deleteUserCompletelyAction(userId)
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }
    router.push("/kullanicilar")
  }

  const tablolar = plan ? Object.entries(plan.tablolar ?? {}).sort((a, b) => b[1] - a[1]) : []

  return (
    <>
      <button
        type="button"
        onClick={ac}
        aria-label="Kullanıcıyı sil"
        title="Kullanıcıyı tamamen sil"
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-danger/25 bg-danger/10 text-danger transition-colors hover:bg-danger/20"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="md"
        title="Kullanıcıyı tamamen sil"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Vazgeç</Button>
            <Button
              variant="danger"
              onClick={sil}
              disabled={busy || loading || onay.trim() !== anahtar}
            >
              {busy && <Spinner />} Kalıcı olarak sil
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {err && <ErrorBox>{err}</ErrorBox>}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-muted">
              <Spinner /> Hesaplanıyor…
            </div>
          ) : plan ? (
            <>
              <div className="rounded-xl border border-danger/25 bg-danger/[0.06] px-4 py-3">
                <div className="text-[22px] font-bold tabular-nums text-danger">
                  {fmtNum(plan.toplam_satir)}
                </div>
                <div className="text-[12.5px] text-muted">kayıt silinecek</div>
              </div>

              {tablolar.length > 0 && (
                <ul className="max-h-[220px] divide-y divide-hairline overflow-y-auto rounded-xl border border-hairline">
                  {tablolar.map(([t, n]) => (
                    <li key={t} className="flex items-center justify-between px-3.5 py-2">
                      <span className="font-mono text-[12px] text-muted">{t}</span>
                      <span className="text-[12.5px] font-semibold tabular-nums text-text">
                        {fmtNum(n)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <WarnBox>
                Gönderiler, ilanlar, indirimler, etkinlikler, yorumlar ve o yorumlara
                gelen yanıtlar, mesajlar, engellemeler, takipler ve profil kaydı silinir.
                Ban kayıtları korunur.
              </WarnBox>

              <div>
                <label className="mb-1.5 block text-[13px] font-medium text-text">
                  Onaylamak için <code className="font-mono text-accent">{anahtar}</code> yaz
                </label>
                <Input
                  value={onay}
                  onChange={(e) => setOnay(e.target.value)}
                  placeholder={anahtar}
                  autoFocus
                  spellCheck={false}
                />
              </div>
            </>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
