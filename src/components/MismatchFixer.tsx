// src/components/MismatchFixer.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// TUTARSIZLIK ONARIMI — "Eşleştir"
//
// ┌─ AKIŞ ────────────────────────────────────────────────────────────┐
// │ 1. "Eşleştir" → sunucudan PLAN istenir (hiçbir şey değişmez)        │
// │ 2. Plan kalem kalem gösterilir: hangi alan, hangi değerden hangi   │
// │    değere gidecek                                                 │
// │ 3. İstenmeyen kalemler tek tek kapatılabilir                       │
// │ 4. Onay → sadece seçili kalemler uygulanır                        │
// └───────────────────────────────────────────────────────────────────┘
//
// ★ AUTH ANA KAYNAK: e-posta/telefon çakışmasında auth.users doğru kabul
//   edilip profiles ona eşitlenir. Tersi olsa kullanıcının giriş yaptığı
//   adres bozulurdu.
//
// ★ Otomatik düzeltilmeyenler: mükerrer kullanıcı adı ve auth kaydı
//   olmayan profil. İkisi de veri silmeyi gerektiriyor; hangisinin
//   kalacağına insan karar vermeli. Panel bunları ayrıca listeliyor.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  previewFixMismatch, applyFixMismatch, type FixPlan,
} from "@/actions/users.actions"
import {
  Badge, Button, ErrorBox, Modal, Spinner, SuccessBox, WarnBox,
} from "@/components/ui"

export function MismatchFixer({
  userId, issueCount,
}: {
  userId: string
  issueCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [plan, setPlan] = useState<FixPlan | null>(null)
  const [secili, setSecili] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  async function openPlan() {
    setOpen(true); setLoading(true); setErr(null); setOk(null); setPlan(null)
    const r = await previewFixMismatch(userId)
    setLoading(false)
    if (!r.ok || !r.plan) { setErr(r.error ?? "Plan alınamadı."); return }
    setPlan(r.plan)
    setSecili(new Set(r.plan.plan.map((p) => p.kod)))
  }

  function toggle(kod: string) {
    setSecili((s) => {
      const n = new Set(s)
      if (n.has(kod)) n.delete(kod)
      else n.add(kod)
      return n
    })
  }

  async function apply() {
    setApplying(true); setErr(null)
    const r = await applyFixMismatch(userId, Array.from(secili))
    setApplying(false)
    if (!r.ok) { setErr(r.error ?? "Uygulanamadı."); return }
    setOpen(false); setPlan(null)
    setOk(r.message ?? "Düzeltildi.")
    router.refresh()
  }

  const duzeltilebilir = plan?.plan.length ?? 0

  return (
    <>
      {ok && <div className="mb-3"><SuccessBox>{ok}</SuccessBox></div>}

      <Button variant="secondary" size="sm" onClick={openPlan} disabled={issueCount === 0}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Eşleştir
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="lg"
        title="Tutarsızlıkları eşleştir"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={applying}>
              Vazgeç
            </Button>
            <Button onClick={apply} disabled={applying || secili.size === 0 || loading}>
              {applying && <Spinner />}
              {secili.size > 0 ? `${secili.size} düzeltmeyi uygula` : "Uygula"}
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-muted">
            <Spinner /> Plan hazırlanıyor…
          </div>
        ) : err ? (
          <ErrorBox>{err}</ErrorBox>
        ) : !plan ? null : (
          <div className="space-y-4">
            {duzeltilebilir === 0 ? (
              <SuccessBox>
                Otomatik düzeltilebilecek bir şey yok. Kalan sorunlar elle karar gerektiriyor.
              </SuccessBox>
            ) : (
              <>
                <p className="text-[12.5px] leading-relaxed text-muted">
                  <strong className="text-text">auth.users ana kaynaktır.</strong>{" "}
                  E-posta ve telefon çakışmasında profil, auth kaydına eşitlenir —
                  kullanıcı giriş yaparken auth&apos;taki değeri kullanıyor.
                </p>

                <ul className="space-y-2">
                  {plan.plan.map((p) => {
                    const on = secili.has(p.kod)
                    return (
                      <li key={p.kod}>
                        <label
                          className={
                            "flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors " +
                            (on ? "border-accent/40 bg-accent/[0.06]" : "border-hairline bg-raised")
                          }
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => toggle(p.kod)}
                            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                          />
                          <span className="min-w-0">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-[13.5px] font-semibold text-text">{p.islem}</span>
                              <code className="font-mono text-[10.5px] text-faint">{p.kod}</code>
                            </span>
                            <span className="mt-0.5 block break-words text-[12px] leading-relaxed text-muted">
                              {p.detay}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}

            {/* Elle karar gerektirenler */}
            {plan.elle_gereken.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">
                  Otomatik düzeltilemeyenler
                </h4>
                {plan.elle_gereken.map((e) => (
                  <WarnBox key={e.kod}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="expired">{e.kod}</Badge>
                    </div>
                    <p className="mt-1.5">{e.sebep}</p>
                  </WarnBox>
                ))}
              </div>
            )}

            <p className="text-[11.5px] leading-relaxed text-faint">
              Yapılan her değişiklik işlem kaydına yazılır. E-posta veya telefon
              değişirse ilgili doğrulama bayrağı da güncellenir.
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
