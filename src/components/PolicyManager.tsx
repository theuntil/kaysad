// src/components/PolicyManager.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// POLİTİKA YÖNETİMİ
//
// Solda liste, sağda düzenleyici. Sürüm ve son güncelleme tarihi
// veritabanında otomatik artıyor — panel bunu sadece gösteriyor.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  savePolicyAction, deletePolicyAction, reorderPoliciesAction, type Policy,
} from "@/actions/policy.actions"
import {
  Badge, Button, Card, EmptyState, ErrorBox, Field, Input, Modal,
  Spinner, SuccessBox, Switch, Textarea,
} from "@/components/ui"
import { fmtDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

const BOS: Partial<Policy> = {
  slug: "", title: "", content: "", summary: "", is_published: true, sort_order: 99,
}

export function PolicyManager({ items }: { items: Policy[] }) {
  const router = useRouter()
  // ★ Başlangıçta hiçbir politika seçili DEĞİL — sayfa açılır açılmaz
  //   düzenleme formu görünmesin. Kullanıcı listeden seçince açılıyor.
  const [secili, setSecili] = useState<Partial<Policy> | null>(null)
  // ★ Sürükle-bırak sırası: yerel liste anında güncelleniyor,
  //   sunucuya arka planda yazılıyor (bekleme hissi olmasın).
  const [sira, setSira] = useState<Policy[]>(items)
  const [suruklenen, setSuruklenen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [sil, setSil] = useState(false)

  const yeni = !secili?.id

  // Sunucudan yeni liste gelince yerel sırayı tazele
  useEffect(() => { setSira(items) }, [items])

  function birak(hedefId: string) {
    if (!suruklenen || suruklenen === hedefId) { setSuruklenen(null); return }

    const kaynak = sira.findIndex((p) => p.id === suruklenen)
    const hedef = sira.findIndex((p) => p.id === hedefId)
    if (kaynak < 0 || hedef < 0) { setSuruklenen(null); return }

    const yeniSira = [...sira]
    const [tasinan] = yeniSira.splice(kaynak, 1)
    yeniSira.splice(hedef, 0, tasinan)

    setSira(yeniSira)
    setSuruklenen(null)

    void reorderPoliciesAction(yeniSira.map((p) => p.id)).then((r) => {
      if (!r.ok) { setErr(r.error ?? "Sıra kaydedilemedi."); setSira(items) }
      else router.refresh()
    })
  }

  function ac(p: Partial<Policy> | null) {
    setSecili(p ? { ...p } : null)
    setErr(null); setOk(null)
  }

  async function kaydet() {
    if (!secili) return
    setBusy(true); setErr(null); setOk(null)
    const r = await savePolicyAction({
      id: secili.id ?? null,
      slug: secili.slug ?? "",
      title: secili.title ?? "",
      content: secili.content ?? "",
      summary: secili.summary ?? null,
      published: secili.is_published !== false,
      sort: secili.sort_order ?? 99,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? "Kaydedilemedi."); return }
    setOk(r.message ?? "Kaydedildi.")
    router.refresh()
  }

  async function kaldir() {
    if (!secili?.id) return
    setBusy(true)
    const r = await deletePolicyAction(secili.id)
    setBusy(false); setSil(false)
    if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }
    setSecili(null)
    router.refresh()
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      {/* ── LİSTE ── */}
      <div className="space-y-2">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={() => ac({ ...BOS })}
        >
          Yeni politika
        </Button>

        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
          {sira.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-faint">Politika yok</p>
          ) : (
            <ul className="divide-y divide-hairline">
              {sira.map((p) => (
                <li
                  key={p.id}
                  draggable
                  onDragStart={() => setSuruklenen(p.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => birak(p.id)}
                  onDragEnd={() => setSuruklenen(null)}
                  className={cn(
                    "transition-opacity",
                    suruklenen === p.id && "opacity-40"
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center gap-2 px-2 py-3 transition-colors",
                      secili?.id === p.id ? "bg-accent/10" : "hover:bg-white/[0.03]"
                    )}
                  >
                    {/* ★ Sürükleme tutamağı */}
                    <span className="shrink-0 cursor-grab px-1 text-faint active:cursor-grabbing">
                      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                        <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
                        <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
                        <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
                      </svg>
                    </span>

                    <button
                      type="button"
                      onClick={() => ac(p)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-text">{p.title}</span>
                        {!p.is_published && <Badge tone="off">Taslak</Badge>}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[11px] text-faint">{p.slug}</div>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── DÜZENLEYİCİ ── */}
      <div className="min-w-0">
        {!secili ? (
          <EmptyState
            title="Politika seç"
            hint="Soldaki listeden bir politikaya tıkla ya da yeni politika oluştur."
          />
        ) : (
          <Card>
            {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}
            {ok && <div className="mb-3"><SuccessBox>{ok}</SuccessBox></div>}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold text-text">
                  {yeni ? "Yeni politika" : secili.title}
                </span>
                {!yeni && (
                  <>
                    <Badge tone="neutral">v{secili.version}</Badge>
                    <span className="text-[11.5px] text-faint">
                      {fmtDate(secili.updated_at ?? null)}
                    </span>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                {!yeni && (
                  <Button variant="danger" size="sm" onClick={() => setSil(true)} disabled={busy}>
                    Sil
                  </Button>
                )}
                <Button size="sm" onClick={kaydet} disabled={busy}>
                  {busy && <Spinner />} Kaydet
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Başlık" required>
                  <Input
                    value={secili.title ?? ""}
                    onChange={(e) => setSecili({ ...secili, title: e.target.value })}
                  />
                </Field>
                <Field label="Slug" required>
                  <Input
                    value={secili.slug ?? ""}
                    onChange={(e) => setSecili({ ...secili, slug: e.target.value.toLowerCase() })}
                    spellCheck={false}
                  />
                </Field>
              </div>

              <Field label="Özet">
                <Input
                  value={secili.summary ?? ""}
                  onChange={(e) => setSecili({ ...secili, summary: e.target.value })}
                />
              </Field>

              <Field label="İçerik">
                <Textarea
                  value={secili.content ?? ""}
                  onChange={(e) => setSecili({ ...secili, content: e.target.value })}
                  className="min-h-[420px] font-mono text-[12.5px]"
                  spellCheck={false}
                />
              </Field>
              <Switch
                checked={secili.is_published !== false}
                onChange={(v) => setSecili({ ...secili, is_published: v })}
                label="Yayında"
              />
            </div>
          </Card>
        )}
      </div>

      <Modal
        open={sil}
        onClose={() => setSil(false)}
        title="Politikayı sil"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSil(false)} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={kaldir} disabled={busy}>
              {busy && <Spinner />} Sil
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          {secili?.title} kalıcı olarak silinecek. Uygulamada bu politikaya
          bağlantı veren ekranlar boş kalır.
        </p>
      </Modal>
    </div>
  )
}
