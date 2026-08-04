"use client"

// src/components/MailBulkForm.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// TOPLU MAİL — filtreli alıcı seçimi
//
// ★ Kimlere gideceği ÖNCE seçiliyor, sonra yazılıyor. Tersi tehlikeli:
//   mail yazıp gönder derken "kaç kişi?" sorusu geç kalıyor.
//
// ★ Alıcı sayısı filtre değişince canlı güncelleniyor. "Karabük +
//   işletme = 34 kişi" bilgisi göndermeden önce görünüyor.
//
// ★ Ferah düzen: her adım ayrı kart, aralarında nefes payı var.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  countMailAlicilar, fetchMailSehirler, sendBulkMailAction,
  type SehirSayim,
} from "@/actions/mail.actions"
import {
  Badge, Button, Card, CardTitle, ErrorBox, Field, Input,
  Segmented, Select, Spinner, Switch, Textarea, WarnBox,
} from "@/components/ui"

const ROLLER: { v: string; l: string }[] = [
  { v: "",         l: "Herkes" },
  { v: "business", l: "Sadece işletmeler" },
  { v: "user",     l: "Sadece bireysel" },
]

const DOGRULAMA: { v: string; l: string }[] = [
  { v: "",      l: "Farketmez" },
  { v: "evet",  l: "Doğrulanmış" },
  { v: "hayir", l: "Doğrulanmamış" },
]

export function MailBulkForm() {
  const router = useRouter()

  const [sehirler, setSehirler] = useState<SehirSayim[]>([])
  const [sehir, setSehir] = useState("")
  const [rol, setRol] = useState("")
  const [dogrulama, setDogrulama] = useState("")
  const [ekAdres, setEkAdres] = useState("")

  const [adet, setAdet] = useState<number | null>(null)
  const [sayiliyor, setSayiliyor] = useState(false)

  const [konu, setKonu] = useState("")
  const [mod, setMod] = useState<"html" | "text">("html")
  const [icerik, setIcerik] = useState("")
  const [sablon, setSablon] = useState(true)

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [onay, setOnay] = useState(false)

  /* ── Şehir listesi ── */
  useEffect(() => {
    void (async () => {
      const r = await fetchMailSehirler()
      setSehirler(r.items)
    })()
  }, [])

  /* ── Alıcı sayısı — filtre değişince ──
     ★ 350 ms geciktirme: her tuşta sunucuya gitmiyor. */
  useEffect(() => {
    let iptal = false
    setSayiliyor(true)

    const z = setTimeout(() => {
      void (async () => {
        const r = await countMailAlicilar({
          sehir: sehir || null,
          rol: rol || null,
          dogrulanmis: dogrulama === "evet" ? true : dogrulama === "hayir" ? false : null,
        })
        if (iptal) return
        setAdet(r.adet)
        setSayiliyor(false)
      })()
    }, 350)

    return () => { iptal = true; clearTimeout(z) }
  }, [sehir, rol, dogrulama])

  const ekListe = ekAdres
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  const toplam = (adet ?? 0) + ekListe.length
  const hazir = konu.trim().length > 0 && icerik.trim().length > 0 && toplam > 0

  const gonder = useCallback(async () => {
    setBusy(true); setErr(null)

    const r = await sendBulkMailAction({
      subject: konu.trim(),
      body: icerik,
      mode: mod,
      useTemplate: sablon,
      filtre: {
        sehir: sehir || null,
        rol: rol || null,
        dogrulanmis: dogrulama === "evet" ? true : dogrulama === "hayir" ? false : null,
      },
      ekAdresler: ekListe,
    })

    setBusy(false)

    if (!r.ok) { setErr(r.error ?? "Gönderilemedi."); setOnay(false); return }

    // ★ Gönderdikten sonra listeye dön — formda kalmak "gitti mi?"
    //   sorusunu doğuruyordu
    // ★ "outbox" diye bir sekme yok — gelen kutusuna dönüyor
    router.push("/mail")
    router.refresh()
  }, [konu, icerik, mod, sablon, sehir, rol, dogrulama, ekListe, router])

  return (
    <div className="space-y-5">
      {err && <ErrorBox>{err}</ErrorBox>}

      {/* ══ 1. KİMLERE ══ */}
      <Card>
        <CardTitle>Kimlere gidecek</CardTitle>
        <p className="mt-1 mb-5 text-[12.5px] text-muted">
          Filtreleri daralttıkça alıcı sayısı aşağıda güncelleniyor.
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Şehir">
            <Select value={sehir} onChange={(e) => setSehir(e.target.value)}>
              <option value="">Tüm şehirler</option>
              {sehirler.map((s) => (
                <option key={s.sehir} value={s.sehir}>
                  {s.sehir} ({s.adet})
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Hesap türü">
            <Select value={rol} onChange={(e) => setRol(e.target.value)}>
              {ROLLER.map((r) => (
                <option key={r.v} value={r.v}>{r.l}</option>
              ))}
            </Select>
          </Field>

          <Field label="E-posta doğrulaması">
            <Select value={dogrulama} onChange={(e) => setDogrulama(e.target.value)}>
              {DOGRULAMA.map((d) => (
                <option key={d.v} value={d.v}>{d.l}</option>
              ))}
            </Select>
          </Field>
        </div>

        {/* Canlı sayaç */}
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-raised px-4 py-3.5">
          {sayiliyor ? (
            <span className="flex items-center gap-2 text-[13px] text-muted">
              <Spinner /> Hesaplanıyor…
            </span>
          ) : (
            <>
              <span className="text-[22px] font-bold tabular-nums leading-none text-text">
                {toplam.toLocaleString("tr-TR")}
              </span>
              <span className="text-[13px] text-muted">alıcıya gidecek</span>
              {ekListe.length > 0 && (
                <Badge tone="neutral">{ekListe.length} elle eklenen</Badge>
              )}
            </>
          )}
        </div>

        <div className="mt-4">
          <Field
            label="Ek adresler"
            hint="Filtre dışında biri varsa — virgül ya da boşlukla ayır"
          >
            <Textarea
              value={ekAdres}
              onChange={(e) => setEkAdres(e.target.value)}
              rows={2}
              placeholder="ornek@site.com, bir@baska.com"
              spellCheck={false}
            />
          </Field>
        </div>
      </Card>

      {/* ══ 2. İÇERİK ══ */}
      <Card>
        <CardTitle>Mail içeriği</CardTitle>

        <div className="mt-5 space-y-4">
          <Field label="Konu" required>
            <Input
              value={konu}
              onChange={(e) => setKonu(e.target.value)}
              maxLength={200}
              placeholder="Örnek: Yeni özellikler yayında"
            />
          </Field>

          <Segmented
            value={mod}
            onChange={setMod}
            options={[
              { value: "html", label: "HTML" },
              { value: "text", label: "Düz metin" },
            ]}
          />

          <Field label="İçerik" required>
            <Textarea
              value={icerik}
              onChange={(e) => setIcerik(e.target.value)}
              rows={10}
              placeholder={mod === "html"
                ? "<p>Merhaba,</p>\n<p>…</p>"
                : "Merhaba,\n\n…"}
              spellCheck={false}
              className="font-mono text-[13px]"
            />
          </Field>

          {mod === "html" && (
            <Switch
              checked={sablon}
              onChange={setSablon}
              label="Varsayılan şablonla sar"
            />
          )}
        </div>
      </Card>

      {/* ══ 3. GÖNDER ══ */}
      <Card>
        {!onay ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Gönder</CardTitle>
              <p className="mt-1 text-[12.5px] text-muted">
                Mailler kuyruğa eklenip sırayla gönderilecek.
              </p>
            </div>
            <Button disabled={!hazir} onClick={() => setOnay(true)}>
              Gönder
            </Button>
          </div>
        ) : (
          <>
            <CardTitle>Emin misin?</CardTitle>
            <div className="mt-3 mb-4">
              <WarnBox>
                <strong>{toplam.toLocaleString("tr-TR")} kişiye</strong> mail
                gönderilecek. Kuyruğa eklendikten sonra geri alınamaz.
              </WarnBox>
            </div>

            <div className="mb-4 space-y-1.5 rounded-xl border border-hairline bg-raised p-4 text-[13px]">
              <div className="flex justify-between gap-4">
                <span className="text-muted">Konu</span>
                <span className="truncate font-medium text-text">{konu}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted">Şehir</span>
                <span className="font-medium text-text">{sehir || "Tümü"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted">Hesap türü</span>
                <span className="font-medium text-text">
                  {ROLLER.find((r) => r.v === rol)?.l ?? "Herkes"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="danger" onClick={() => { void gonder() }} disabled={busy}>
                {busy && <Spinner />} Evet, gönder
              </Button>
              <Button variant="secondary" onClick={() => setOnay(false)} disabled={busy}>
                Vazgeç
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
