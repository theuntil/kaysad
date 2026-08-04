// src/components/ReportActions.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// ŞİKÂYET KARARI
//
// İki buton: KABUL ET (resolved) ve REDDET (dismissed). Üçüncü bir eylem
// olarak SİL var ama ayrı ve tehlikeli olarak işaretli.
//
// ★ Karar ile silme farklı şeyler: karar veri bırakır (aynı kullanıcı
//   tekrar şikâyet edilirse geçmişi görürsün), silme bırakmaz. Bu yüzden
//   silme ayrı bir onay penceresinden geçiyor.
//
// ★ Panel notu isteğe bağlı ama karar verirken yazman önerilir: 3 ay sonra
//   "bunu neden reddetmiştim" sorusunun tek cevabı o not oluyor.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { useRouter } from "next/navigation"
import { setReportStatusAction, deleteReportAction } from "@/actions/report.actions"
import {
  Badge, Button, ErrorBox, Field, Modal, Spinner, SuccessBox, Textarea, WarnBox,
} from "@/components/ui"
import { label } from "@/lib/format"
import type { ReportStatus } from "@/lib/types.v3"

export function ReportActions({
  reportId, status, adminNote, compact = false,
}: {
  reportId: string
  status: ReportStatus | null
  adminNote?: string | null
  compact?: boolean
}) {
  const router = useRouter()
  const [karar, setKarar] = useState<ReportStatus | null>(null)
  const [sil, setSil] = useState(false)
  const [not, setNot] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function uygula() {
    if (!karar) return
    setBusy(true); setErr(null); setOk(null)
    const r = await setReportStatusAction({ id: reportId, status: karar, note: not || null })
    setBusy(false)
    setKarar(null)
    if (!r.ok) { setErr(r.error ?? "Güncellenemedi."); return }
    setOk(r.message ?? "Güncellendi.")
    setNot("")
    router.refresh()
  }

  async function kaydiSil() {
    setBusy(true); setErr(null); setOk(null)
    const r = await deleteReportAction(reportId)
    setBusy(false)
    setSil(false)
    if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }
    router.push("/reports")
  }

  const karara_bagli = status === "resolved" || status === "dismissed"

  return (
    <div className={compact ? "" : "space-y-3"}>
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <div className="flex flex-wrap gap-2">
        <Button
          size={compact ? "sm" : "md"}
          onClick={() => { setNot(adminNote ?? ""); setKarar("resolved") }}
          disabled={busy || status === "resolved"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-4 w-4">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Kabul et
        </Button>

        <Button
          variant="danger"
          size={compact ? "sm" : "md"}
          onClick={() => { setNot(adminNote ?? ""); setKarar("dismissed") }}
          disabled={busy || status === "dismissed"}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          Reddet
        </Button>

        {status !== "reviewing" && !karara_bagli && (
          <Button
            variant="secondary"
            size={compact ? "sm" : "md"}
            onClick={() => { setNot(adminNote ?? ""); setKarar("reviewing") }}
            disabled={busy}
          >
            İncelemeye al
          </Button>
        )}

        {!compact && (
          <Button variant="ghost" size="md" onClick={() => setSil(true)} disabled={busy}>
            Kaydı sil
          </Button>
        )}
      </div>

      {/* ── Karar onayı ── */}
      <Modal
        open={karar !== null}
        onClose={() => setKarar(null)}
        title={
          karar === "resolved" ? "Şikâyeti kabul et"
          : karar === "dismissed" ? "Şikâyeti reddet"
          : "İncelemeye al"
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setKarar(null)} disabled={busy}>Vazgeç</Button>
            <Button
              variant={karar === "dismissed" ? "danger" : "primary"}
              onClick={uygula}
              disabled={busy}
            >
              {busy && <Spinner />} Onayla
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted">Durum:</span>
            <Badge tone="neutral">{label.report(status)}</Badge>
            <span className="text-faint">→</span>
            <Badge tone={karar === "resolved" ? "live" : karar === "dismissed" ? "off" : "expired"}>
              {label.report(karar)}
            </Badge>
          </div>

          <Field
            label="Panel notu"
          >
            <Textarea
              value={not}
              onChange={(e) => setNot(e.target.value)}
              placeholder={
                karar === "resolved"
                  ? "İçerik kaldırıldı ve kullanıcı uyarıldı."
                  : "Bildirilen içerik kurallara aykırı değil."
              }
              autoFocus
            />
          </Field>

          {karar === "resolved" && (
            <WarnBox>
              Kabul etmek şikâyeti kapatır ama <strong>içeriği silmez ve kullanıcıyı
              banlamaz</strong>. O işlemleri ilgili sayfalardan ayrıca yapman gerekir.
            </WarnBox>
          )}
        </div>
      </Modal>

      {/* ── Silme onayı ── */}
      <Modal
        open={sil}
        onClose={() => setSil(false)}
        title="Şikâyet kaydını sil"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSil(false)} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={kaydiSil} disabled={busy}>
              {busy && <Spinner />} Kalıcı olarak sil
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px] leading-relaxed text-muted">
          <p>
            Karar vermek yerine silmek, aynı kullanıcı tekrar şikâyet edildiğinde
            geçmişi görememek demek. Gerçekten hatalı/spam bir kayıt değilse
            <strong className="text-text"> reddetmek</strong> daha doğru.
          </p>
          <WarnBox>Bu işlem geri alınamaz.</WarnBox>
        </div>
      </Modal>
    </div>
  )
}
