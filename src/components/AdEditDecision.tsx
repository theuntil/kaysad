// src/components/AdEditDecision.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// REKLAM DÜZENLEME ONAYI
//
// ★ Aktif reklamın içeriği doğrudan değişmiyor. Reklam veren düzenleme
//   yaptığında değişiklik ad_edits'te bekliyor ve kampanya
//   'edit_pending' oluyor. Onaylarsan uygulanıp yayına dönüyor,
//   reddedersen eski içerikle yayında kalıyor.
//
// Aşağıda ESKİ → YENİ karşılaştırması alan alan gösteriliyor.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { useRouter } from "next/navigation"
import { decideAdEditAction } from "@/actions/ad.actions"
import {
  Button, ErrorBox, Field, Modal, Spinner, Textarea,
} from "@/components/ui"
import { timeAgo } from "@/lib/utils"

const ALAN_AD: Record<string, string> = {
  title: "Başlık",
  description: "Açıklama",
  image_url: "Görsel",
  logo_url: "Logo",
  target_type: "Yönlendirme tipi",
  target_value: "Yönlendirme adresi",
}

interface Edit {
  id: string
  patch: Record<string, unknown>
  created_at: string
}

export function AdEditDecision({
  edits, campaign,
}: {
  edits: Edit[]
  campaign: Record<string, unknown>
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [reject, setReject] = useState<Edit | null>(null)
  const [reason, setReason] = useState("")

  async function karar(e: Edit, onayla: boolean) {
    setBusy(e.id); setErr(null)
    const r = await decideAdEditAction(e.id, onayla, onayla ? undefined : reason)
    setBusy(null); setReject(null); setReason("")
    if (!r.ok) { setErr(r.error ?? "İşlem başarısız."); return }
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {err && <ErrorBox>{err}</ErrorBox>}

      {edits.map((e) => (
        <div key={e.id} className="rounded-xl border border-danger/25 bg-danger/[0.05] p-4">
          <div className="mb-3 text-[11.5px] text-faint">{timeAgo(e.created_at)}</div>

          <div className="space-y-2">
            {Object.entries(e.patch).map(([k, v]) => {
              const eski = campaign[k]
              const gorsel = k === "image_url" || k === "logo_url"
              return (
                <div key={k} className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
                  <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
                    {ALAN_AD[k] ?? k}
                  </div>
                  {gorsel ? (
                    <div className="flex items-center gap-3">
                      {eski ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={String(eski)} alt="" className="h-16 w-24 rounded-lg object-cover opacity-50" />
                      ) : (
                        <span className="text-[12px] text-faint">yok</span>
                      )}
                      <span className="text-faint">→</span>
                      {v ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={String(v)} alt="" className="h-16 w-24 rounded-lg object-cover" />
                      ) : (
                        <span className="text-[12px] text-faint">kaldırılacak</span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="text-muted line-through">{String(eski ?? "(boş)")}</span>
                      <span className="text-faint">→</span>
                      <span className="font-medium text-text">{String(v ?? "(boş)")}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={busy === e.id} onClick={() => karar(e, true)}>
              {busy === e.id && <Spinner />} Onayla
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy === e.id}
              onClick={() => { setReason(""); setReject(e) }}
            >
              Reddet
            </Button>
          </div>
        </div>
      ))}

      <Modal
        open={!!reject}
        onClose={() => setReject(null)}
        title="Düzenlemeyi reddet"
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
        <div className="space-y-3">
          <Field label="Red sebebi" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
          <p className="text-[12.5px] text-muted">
            Reklam eski içeriğiyle yayında kalmaya devam eder.
          </p>
        </div>
      </Modal>
    </div>
  )
}
