"use client"

// src/components/BoostEditPanel.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// ÖNE ÇIKARMA — TAM DÜZENLEME
//
// ★ Sadece fiyat değil: seviye, içerik, süre, durum, not ve SİLME.
//   Panel onaylayan taraf olduğu için değişiklikler doğrudan yazılıyor.
//
// ★ İçerik değiştirilebiliyor ama sadece TALEP SAHİBİNİN kendi
//   kayıtları arasından. Sunucu tarafında da doğrulanıyor.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  deleteBoostAction, fetchUserContent, updateBoostAction,
  type KullaniciIcerik,
} from "@/actions/ad.actions"
import { panelGorsel } from "@/lib/storage-url"
import {
  Badge, Button, Card, CardTitle, EmptyState, ErrorBox, Field,
  Input, Modal, Segmented, Select, Spinner, SuccessBox, Switch, Textarea, WarnBox,
} from "@/components/ui"

type IcerikTuru = "listing" | "discount" | "event"
type Durum = "pending" | "approved" | "active" | "rejected" | "expired" | "cancelled"

const ICERIK: { v: IcerikTuru; l: string }[] = [
  { v: "listing",  l: "İlan" },
  { v: "discount", l: "İndirim" },
  { v: "event",    l: "Etkinlik" },
]

const DURUMLAR: { v: Durum; l: string }[] = [
  { v: "pending",   l: "Bekliyor" },
  { v: "approved",  l: "Sırada" },
  { v: "active",    l: "Aktif" },
  { v: "rejected",  l: "Reddedildi" },
  { v: "expired",   l: "Süresi doldu" },
  { v: "cancelled", l: "İptal" },
]

interface Props {
  talep: {
    id: string
    user_id: string
    content_type: IcerikTuru
    content_id: string
    boost_type: "boost" | "super_boost"
    months: number
    monthly_price: number
    note: string | null
    status: string
    reject_reason: string | null
    min_price: number
  }
}

export function BoostEditPanel({ talep }: Props) {
  const router = useRouter()

  const [acik, setAcik] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [silOnay, setSilOnay] = useState(false)

  const [tur, setTur] = useState<IcerikTuru>(talep.content_type)
  const [icerikId, setIcerikId] = useState(talep.content_id)
  const [seviye, setSeviye] = useState(talep.boost_type)
  const [fiyat, setFiyat] = useState(String(Math.round(Number(talep.monthly_price))))
  const [ay, setAy] = useState(String(talep.months || 1))
  const [not, setNot] = useState(talep.note ?? "")
  const [durum, setDurum] = useState<Durum>(talep.status as Durum)
  const [redSebep, setRedSebep] = useState(talep.reject_reason ?? "")
  const [yenidenBaslat, setYenidenBaslat] = useState(false)

  const [icerikler, setIcerikler] = useState<KullaniciIcerik[]>([])
  const [icerikYuk, setIcerikYuk] = useState(false)

  /* ── Tür değişince talep sahibinin içeriklerini getir ── */
  useEffect(() => {
    if (!acik) return
    let iptal = false
    setIcerikYuk(true)

    void (async () => {
      const r = await fetchUserContent(talep.user_id, tur)
      if (iptal) return
      setIcerikler(r.items)
      setIcerikYuk(false)

      // ★ Tür değiştiyse eski içerik geçersiz — seçimi temizle
      if (tur !== talep.content_type && !r.items.some((i) => i.id === icerikId)) {
        setIcerikId("")
      }
    })()

    return () => { iptal = true }
  }, [acik, tur, talep.user_id, talep.content_type, icerikId])

  const sayi = Number(fiyat)
  const tabanAlti = talep.min_price > 0 && sayi > 0 && sayi < talep.min_price
  const fiyatGecersiz = !Number.isFinite(sayi) || sayi < 1

  const degisti = useMemo(() => (
    tur !== talep.content_type ||
    icerikId !== talep.content_id ||
    seviye !== talep.boost_type ||
    sayi !== Math.round(Number(talep.monthly_price)) ||
    Number(ay) !== talep.months ||
    (not.trim() || null) !== talep.note ||
    durum !== talep.status ||
    (redSebep.trim() || null) !== talep.reject_reason ||
    yenidenBaslat
  ), [tur, icerikId, seviye, sayi, ay, not, durum, redSebep, yenidenBaslat, talep])

  const eksik = !icerikId
    ? "İçerik seç"
    : fiyatGecersiz
      ? "Geçerli bir fiyat gir"
      : tabanAlti
        ? `En az ${talep.min_price.toLocaleString("tr-TR")} ₺`
        : null

  const kaydet = useCallback(async () => {
    if (eksik) { setErr(eksik); return }

    setBusy(true); setErr(null); setOk(null)

    const r = await updateBoostAction({
      id: talep.id,
      content_type: tur,
      content_id: icerikId,
      boost_type: seviye,
      monthly_price: sayi,
      months: Number(ay),
      note: not.trim() || null,
      status: durum,
      reject_reason: durum === "rejected" ? (redSebep.trim() || null) : null,
      yeniden_baslat: yenidenBaslat,
    })

    setBusy(false)

    if (!r.ok) { setErr(r.error ?? "Kaydedilemedi."); return }

    setOk("Değişiklikler kaydedildi.")
    setYenidenBaslat(false)
    router.refresh()
  }, [eksik, talep.id, tur, icerikId, seviye, sayi, ay, not, durum, redSebep, yenidenBaslat, router])

  const sil = useCallback(async () => {
    setBusy(true); setErr(null)
    const r = await deleteBoostAction(talep.id)
    setBusy(false)
    setSilOnay(false)

    if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }
    router.push("/reklamlar?durum=boost")
  }, [talep.id, router])

  const sifirla = useCallback(() => {
    setTur(talep.content_type)
    setIcerikId(talep.content_id)
    setSeviye(talep.boost_type)
    setFiyat(String(Math.round(Number(talep.monthly_price))))
    setAy(String(talep.months || 1))
    setNot(talep.note ?? "")
    setDurum(talep.status as Durum)
    setRedSebep(talep.reject_reason ?? "")
    setYenidenBaslat(false)
    setErr(null); setOk(null)
  }, [talep])

  /* ═══════════ KAPALI ═══════════ */

  if (!acik) {
    return (
      <>
        {ok && <div className="mb-3"><SuccessBox>{ok}</SuccessBox></div>}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Düzenle</CardTitle>
              <p className="mt-1 text-[12.5px] text-muted">
                İçerik, seviye, süre, fiyat ve durumu değiştirebilirsin.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => setSilOnay(true)}>Sil</Button>
              <Button onClick={() => setAcik(true)}>Düzenlemeyi aç</Button>
            </div>
          </div>
        </Card>

        <SilModal
          open={silOnay}
          busy={busy}
          onClose={() => setSilOnay(false)}
          onConfirm={() => { void sil() }}
        />
      </>
    )
  }

  /* ═══════════ AÇIK ═══════════ */

  return (
    <>
      <Card>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Öne çıkarmayı düzenle</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => { sifirla(); setAcik(false) }}
          >
            Kapat
          </Button>
        </div>

        {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}
        {ok && <div className="mb-3"><SuccessBox>{ok}</SuccessBox></div>}

        {/* ══ İÇERİK ══ */}
        <div className="mb-5">
          <div className="mb-2 text-[13px] font-medium text-text">
            Öne çıkarılan içerik
          </div>

          <div className="mb-3">
            <Segmented
              value={tur}
              onChange={setTur}
              size="sm"
              options={ICERIK.map((i) => ({ value: i.v, label: i.l }))}
            />
          </div>

          {icerikYuk ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border border-hairline bg-raised py-8 text-[13px] text-muted">
              <Spinner /> Yükleniyor…
            </div>
          ) : icerikler.length === 0 ? (
            <div className="rounded-xl border border-hairline bg-raised px-4 py-6">
              <EmptyState title="Bu kullanıcının bu türde kaydı yok" />
            </div>
          ) : (
            <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
              {icerikler.map((i) => {
                const aktif = icerikId === i.id
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setIcerikId(i.id)}
                    aria-pressed={aktif}
                    className={
                      "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition " +
                      (aktif
                        ? "border-accent/50 bg-accent/[0.07]"
                        : "border-hairline bg-raised")
                    }
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-surface">
                      {i.gorsel ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={panelGorsel(i.gorsel) ?? i.gorsel}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-faint">—</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-text">
                        {i.baslik}
                      </div>
                      {i.alt_bilgi && (
                        <div className="mt-0.5 text-[11.5px] text-muted">{i.alt_bilgi}</div>
                      )}
                    </div>
                    {aktif && <Badge tone="live">seçili</Badge>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ══ SEVİYE ══ */}
        <div className="mb-5">
          <Field label="Seviye">
            <Segmented
              value={seviye}
              onChange={setSeviye}
              options={[
                { value: "boost",       label: "Öne Çıkar",       hint: "Kendi şehrinde" },
                { value: "super_boost", label: "Süper Öne Çıkar", hint: "Tüm şehirlerde" },
              ]}
            />
          </Field>
        </div>

        {/* ══ FİYAT VE SÜRE ══ */}
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <Field
            label="Aylık fiyat (₺)"
            required
            hint={talep.min_price > 0
              ? `Taban ${talep.min_price.toLocaleString("tr-TR")} ₺`
              : undefined}
          >
            <Input
              type="number"
              min={1}
              value={fiyat}
              onChange={(e) => setFiyat(e.target.value.replace(/[^0-9]/g, ""))}
            />
            {tabanAlti && (
              <span className="mt-1.5 block text-[12px] text-danger">
                Taban fiyatın altında
              </span>
            )}
          </Field>

          <Field label="Süre">
            <Select value={ay} onChange={(e) => setAy(e.target.value)}>
              {[1, 2, 3, 6, 12].map((n) => (
                <option key={n} value={String(n)}>{n} ay</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* ══ DURUM ══ */}
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <Field label="Durum">
            <Select value={durum} onChange={(e) => setDurum(e.target.value as Durum)}>
              {DURUMLAR.map((d) => (
                <option key={d.v} value={d.v}>{d.l}</option>
              ))}
            </Select>
          </Field>

          {durum === "rejected" && (
            <Field label="Red sebebi" hint="Kullanıcıya gösteriliyor">
              <Input
                value={redSebep}
                onChange={(e) => setRedSebep(e.target.value)}
                placeholder="Örnek: Görsel kurallara uymuyor"
              />
            </Field>
          )}
        </div>

        {/* ══ SÜREYİ YENİDEN BAŞLAT ══ */}
        <div className="mb-5">
          <Switch
            checked={yenidenBaslat}
            onChange={setYenidenBaslat}
            label="Süreyi bugünden yeniden başlat"
          />
          <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
            Başlangıç bugün, bitiş {ay} ay sonrası olarak yazılır.
            İşaretlenmezse mevcut başlangıç korunur.
          </p>
        </div>

        {/* ══ NOT ══ */}
        <div className="mb-5">
          <Field label="Not">
            <Textarea
              value={not}
              onChange={(e) => setNot(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Panel içi not"
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => { void kaydet() }} disabled={busy || !degisti || !!eksik}>
            {busy && <Spinner />} Kaydet
          </Button>
          <Button variant="secondary" onClick={sifirla} disabled={busy}>
            Geri al
          </Button>
          <Button
            variant="danger"
            className="ml-auto"
            disabled={busy}
            onClick={() => setSilOnay(true)}
          >
            Sil
          </Button>
        </div>

        {eksik && (
          <p className="mt-3 text-[12.5px] text-muted">{eksik}</p>
        )}
      </Card>

      <SilModal
        open={silOnay}
        busy={busy}
        onClose={() => setSilOnay(false)}
        onConfirm={() => { void sil() }}
      />
    </>
  )
}

/* ═════════════════ SİLME ONAYI ═════════════════ */

function SilModal({
  open, busy, onClose, onConfirm,
}: {
  open: boolean
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Öne çıkarmayı sil"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Vazgeç</Button>
          <Button variant="danger" onClick={onConfirm} disabled={busy}>
            {busy && <Spinner />} Kalıcı sil
          </Button>
        </>
      }
    >
      <WarnBox>
        Bu talep kalıcı olarak silinecek. Aktifse önce yayından
        kaldırılıyor — içerik listede öne çıkmış görünmeye devam etmesin.
        Geri alınamaz.
      </WarnBox>
    </Modal>
  )
}
