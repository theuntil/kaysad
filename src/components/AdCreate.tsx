// src/components/AdCreate.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// PANELDEN REKLAM OLUŞTURMA
//
// ★ Reklam verenin uygulamadan teklif göndermesini beklemek zorunda
//   değilsin: anlaşmayı telefonda yaptıysan buradan doğrudan kampanya
//   açıp yayına alabilirsin.
//
// ★ "Hemen yayına al" açıkken alan doluysa kampanya yine oluşuyor ama
//   'Bekliyor' kalıyor ve panel uyarıyor — kapasite kuralı SQL'de.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  createAdAction, createBoostAction, fetchUserContent,
  type KullaniciIcerik,
} from "@/actions/ad.actions"
import { createSignedUploadAction } from "@/actions/upload.actions"
import { akilliYukle } from "@/lib/upload"
import { panelGorsel } from "@/lib/storage-url"
import { UserPicker } from "@/components/UserPicker"
import {
  Badge, Button, EmptyState, ErrorBox, Field, Input, Modal, Segmented,
  Select, Spinner, SuccessBox, Switch, Textarea, WarnBox,
} from "@/components/ui"
import type { QuickUser } from "@/actions/users.actions"


export function AdCreate({
  slots,
}: {
  slots: { key: string; ad: string; capacity: number; aktif: number }[]
}) {
  const router = useRouter()
  const gorselInput = useRef<HTMLInputElement>(null)
  const logoInput = useRef<HTMLInputElement>(null)

  /* ★ TEK AKIŞ: modalın en başında tür seçiliyor, forma göre alanlar
     değişiyor. İki ayrı düğme yerine bağlama uyan tek bir yer. */
  const [tur, setTur] = useState<"reklam" | "boost">("reklam")

  /* Boost alanları */
  const [icerikTuru, setIcerikTuru] = useState<"listing" | "discount" | "event">("listing")
  const [icerikler, setIcerikler] = useState<KullaniciIcerik[]>([])
  const [icerikYukleniyor, setIcerikYukleniyor] = useState(false)
  const [seciliIcerik, setSeciliIcerik] = useState<KullaniciIcerik | null>(null)
  const [seviye, setSeviye] = useState<"boost" | "super_boost">("boost")
  const [hemenAktif, setHemenAktif] = useState(false)

  const [open, setOpen] = useState(false)
  const [users, setUsers] = useState<QuickUser[]>([])
  const [slot, setSlot] = useState(slots[0]?.key ?? "home")
  const [title, setTitle] = useState("")
  const [desc, setDesc] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  const [logoUrl, setLogoUrl] = useState("")
  /* ★ Yönlendirme sadece web adresi ve İSTEĞE BAĞLI.
     Mobil tarafla aynı: profil/ilan/indirim/etkinlik seçenekleri kalktı.
     Boş bırakılırsa reklam yönlendirmiyor. */
  const [url, setUrl] = useState("")
  const [months, setMonths] = useState(1)
  const [price, setPrice] = useState("")
  const [aktif, setAktif] = useState(true)
  const [not, setNot] = useState("")

  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const secilenAlan = slots.find((s) => s.key === slot)
  const dolu = secilenAlan ? secilenAlan.aktif >= secilenAlan.capacity : false

  async function medyaYukle(file: File, tur: "image" | "logo") {
    setBusy(tur); setErr(null)

    const imza = await createSignedUploadAction({
      bucket: "reklam",
      klasor: tur,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    })

    if (!imza.ok && imza.error && !imza.error.includes("adres")) {
      setBusy(null); setErr(imza.error); return
    }

    const r = await akilliYukle({
      bucket: "reklam", klasor: tur, file, imza: imza.ok ? imza : null,
    })

    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Yüklenemedi."); return }
    if (tur === "image") setImageUrl(r.publicUrl ?? "")
    else setLogoUrl(r.publicUrl ?? "")
  }

  async function olustur() {
    setBusy("save"); setErr(null); setOk(null)

    const r = await createAdAction({
      advertiserId: users[0]?.user_id ?? "",
      slot,
      title,
      description: desc || null,
      imageUrl: imageUrl || null,
      logoUrl: logoUrl || null,
      // ★ Adres doluysa external, boşsa yönlendirme yok
      targetType: url.trim() ? "external" : "none",
      targetValue: url.trim() || null,
      months,
      monthlyPrice: Number(price) || 0,
      activate: aktif,
      note: not || null,
    })

    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Oluşturulamadı."); return }

    setOpen(false)
    setUsers([]); setTitle(""); setDesc(""); setImageUrl(""); setLogoUrl("")
    setUrl(""); setPrice(""); setNot("")
    setOk(r.message ?? "Reklam oluşturuldu.")
    router.refresh()
  }

  /* ── Boost: kullanıcı ya da içerik türü değişince listeyi getir ── */
  const seciliKullanici = users[0] ?? null

  useEffect(() => {
    if (tur !== "boost" || !seciliKullanici) {
      setIcerikler([]); setSeciliIcerik(null)
      return
    }

    let iptal = false
    setIcerikYukleniyor(true)
    setSeciliIcerik(null)

    void (async () => {
      const r = await fetchUserContent(seciliKullanici.user_id, icerikTuru)
      if (iptal) return
      setIcerikler(r.items)
      setIcerikYukleniyor(false)
    })()

    return () => { iptal = true }
  }, [tur, seciliKullanici, icerikTuru])

  /* ── Eksik alan — tek doğruluk kaynağı ── */
  const eksik = useMemo<string | null>(() => {
    if (!seciliKullanici) return "Kullanıcı seç"

    if (tur === "boost") {
      if (!seciliIcerik) return "Öne çıkarılacak içeriği seç"
    } else {
      if (!title.trim()) return "Başlık gir"
    }

    if (!price || Number(price) < 1) return "Aylık fiyat gir"
    return null
  }, [seciliKullanici, tur, seciliIcerik, title, price])

  /* ── Boost gönderimi ── */
  const boostOlustur = async () => {
    if (!seciliKullanici || !seciliIcerik) return

    setBusy("save"); setErr(null)

    const r = await createBoostAction({
      userId: seciliKullanici.user_id,
      contentType: icerikTuru,
      contentId: seciliIcerik.id,
      boostType: seviye,
      monthlyPrice: Number(price),
      months: Number(months),
      activate: hemenAktif,
      note: not.trim() || null,
    })

    setBusy(null)

    if (!r.ok) { setErr(r.error ?? "Oluşturulamadı."); return }

    setOpen(false)
    sifirla()
    setOk(r.message ?? "Öne çıkarma oluşturuldu.")
    router.refresh()
  }

  /* ── Formu temizle ── */
  const sifirla = () => {
    setUsers([]); setTitle(""); setDesc(""); setImageUrl(""); setLogoUrl("")
    setUrl(""); setPrice(""); setNot("")
    setSeciliIcerik(null); setIcerikler([])
    setIcerikTuru("listing"); setSeviye("boost"); setHemenAktif(false)
  }

  return (
    <>
      {ok && <div className="mb-4"><SuccessBox>{ok}</SuccessBox></div>}

      <Button size="sm" onClick={() => { setErr(null); setOpen(true) }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Reklam ekle
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        width="lg"
        title={tur === "boost" ? "Yeni öne çıkarma" : "Yeni reklam"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy !== null}>
              Vazgeç
            </Button>
            <Button
              onClick={() => { void (tur === "boost" ? boostOlustur() : olustur()) }}
              disabled={busy !== null || !!eksik}
            >
              {busy === "save" && <Spinner />}
              {tur === "boost" && hemenAktif ? "Oluştur ve yayına al" : "Oluştur"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {err && <ErrorBox>{err}</ErrorBox>}

          <input
            ref={gorselInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void medyaYukle(f, "image")
              e.target.value = ""
            }}
          />
          <input
            ref={logoInput}
            type="file"
            accept="image/png,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void medyaYukle(f, "logo")
              e.target.value = ""
            }}
          />

          {/* ══ 1. TÜR — formun en başı ══
              ★ İki ayrı düğme yerine tek akış. Seçime göre aşağıdaki
                alanlar değişiyor. */}
          <div>
            <div className="mb-2 text-[13px] font-medium text-text">Ne oluşturuyorsun?</div>
            <Segmented
              value={tur}
              onChange={setTur}
              options={[
                { value: "reklam", label: "Reklam", hint: "Kendi görseliyle ayrı alan" },
                { value: "boost",  label: "Öne Çıkarma", hint: "Mevcut içeriği üste taşı" },
              ]}
            />
          </div>

          <div>
            <div className="mb-2 text-[13px] font-medium text-text">
              {tur === "boost" ? "Kullanıcı" : "Reklam veren"}
            </div>
            <UserPicker selected={users} onChange={setUsers} autoFocus />
          </div>

          {/* ══ 2. BOOST: içerik seçimi ══ */}
          {tur === "boost" && seciliKullanici && (
            <div>
              <div className="mb-2 text-[13px] font-medium text-text">
                Öne çıkarılacak içerik
              </div>

              <div className="mb-3">
                <Segmented
                  value={icerikTuru}
                  onChange={setIcerikTuru}
                  size="sm"
                  options={[
                    { value: "listing",  label: "İlan" },
                    { value: "discount", label: "İndirim" },
                    { value: "event",    label: "Etkinlik" },
                  ]}
                />
              </div>

              {icerikYukleniyor ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-hairline bg-raised py-8 text-[13px] text-muted">
                  <Spinner /> Yükleniyor…
                </div>
              ) : icerikler.length === 0 ? (
                <div className="rounded-xl border border-hairline bg-raised px-4 py-6">
                  <EmptyState title="Bu kullanıcının bu türde kaydı yok" />
                </div>
              ) : (
                /* ★ UUID yazdırmıyoruz — kartlar görselli, tıklayarak seçiliyor */
                <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                  {icerikler.map((i) => {
                    const aktif = seciliIcerik?.id === i.id
                    return (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => setSeciliIcerik(i)}
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
          )}

          {/* ══ 3. BOOST: seviye ══ */}
          {tur === "boost" && (
            <Field label="Seviye" required>
              <Segmented
                value={seviye}
                onChange={setSeviye}
                options={[
                  { value: "boost",       label: "Öne Çıkar",       hint: "Kendi şehrinde" },
                  { value: "super_boost", label: "Süper Öne Çıkar", hint: "Tüm şehirlerde" },
                ]}
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {tur === "reklam" ? (
              <Field label="Alan" required>
                <Select value={slot} onChange={(e) => setSlot(e.target.value)}>
                  {slots.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.ad} ({s.aktif}/{s.capacity})
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}

            <Field label="Süre" required>
              <Select value={String(months)} onChange={(e) => setMonths(Number(e.target.value))}>
                <option value="1">1 ay</option>
                <option value="2">2 ay</option>
                <option value="3">3 ay</option>
              </Select>
            </Field>
          </div>

          {/* ══ 4. REKLAM-ÖZEL ALANLAR ══
              ★ Boost'ta başlık, görsel, logo ve adres YOK —
                bunlar kullanıcının kendi içeriğinden geliyor. */}
          {tur === "reklam" ? (
            <>
          <Field label="Başlık" required>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </Field>

          <Field label="Açıklama">
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
          </Field>

          {/* ── GÖRSEL ── */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-text">Görsel</div>
              <div className="overflow-hidden rounded-xl border border-hairline bg-raised">
                <div className="aspect-video">
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11.5px] text-faint">
                      Görsel yok
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={busy !== null}
                    onClick={() => gorselInput.current?.click()}
                  >
                    {busy === "image" && <Spinner />} {imageUrl ? "Değiştir" : "Yükle"}
                  </Button>
                </div>
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[13px] font-medium text-text">Logo</div>
              <div className="overflow-hidden rounded-xl border border-hairline bg-raised">
                <div className="aspect-video">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="" className="h-full w-full object-contain p-3" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11.5px] text-faint">
                      İsteğe bağlı
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    disabled={busy !== null}
                    onClick={() => logoInput.current?.click()}
                  >
                    {busy === "logo" && <Spinner />} {logoUrl ? "Değiştir" : "Yükle"}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ── YÖNLENDİRME ──
              ★ Tek alan, isteğe bağlı. Boş bırakılırsa reklam sadece
                gösterilir, dokunulduğunda bir yere gitmez. */}
          <Field
            label="Web adresi"
            hint="İsteğe bağlı — boş bırakılırsa reklam yönlendirmez"
          >
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://siteniz.com"
              spellCheck={false}
              autoComplete="off"
            />
          </Field>
            </>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Aylık fiyat (₺)" required>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                min="1"
              />
            </Field>

            <Field label="Not">
              <Input value={not} onChange={(e) => setNot(e.target.value)} />
            </Field>
          </div>

          <Switch
            checked={tur === "boost" ? hemenAktif : aktif}
            onChange={tur === "boost" ? setHemenAktif : setAktif}
            label="Hemen yayına al"
          />

          {/* ★ Alan doluluğu uyarısı sadece reklamda anlamlı */}
          {tur === "reklam" && aktif && dolu && (
            <WarnBox>
              {secilenAlan?.ad} dolu ({secilenAlan?.aktif}/{secilenAlan?.capacity}).
              Kampanya oluşturulacak ama yayına alınamayacak — önce mevcut
              reklamlardan birini pasife alman gerekiyor.
            </WarnBox>
          )}

          {price && months ? (
            <div className="rounded-xl border border-hairline bg-raised px-4 py-3">
              <div className="flex items-baseline justify-between">
                <span className="text-[12.5px] text-muted">Toplam</span>
                <span className="text-[18px] font-bold tabular-nums text-text">
                  {(Number(price) * months).toLocaleString("tr")} ₺
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </>
  )
}
