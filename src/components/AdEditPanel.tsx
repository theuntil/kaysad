"use client"

// src/components/AdEditPanel.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// REKLAM DÜZENLEME — panelden doğrudan
//
// ★ Reklam verenin `ad_request_edit` akışından FARKLI: panel onay
//   beklemeden yazıyor, çünkü onaylayan taraf zaten panel.
//
// ★ Görsel ve logo: ekle · değiştir · kaldır. Yükleme aynı akıllı yolu
//   kullanıyor (imzalı URL → başarısızsa sunucu vekili), böylece
//   kendi sunucusunda barındırılan Supabase'deki CORS sorunu bu ekranda
//   da çıkmıyor.
//
// ★ Yönlendirme sadece web adresi ve isteğe bağlı — mobil tarafla aynı.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { updateAdAction } from "@/actions/ad.actions"
import { createSignedUploadAction } from "@/actions/upload.actions"
import { akilliYukle } from "@/lib/upload"
import { panelGorsel } from "@/lib/storage-url"
import {
  Button, Card, CardTitle, ErrorBox, Field, Input, Select, Spinner, SuccessBox, Textarea,
} from "@/components/ui"

const URL_DESENI = /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i

/**
 * GÖRSEL ÖNİZLEME
 *
 * ★ `onError` ile yükleme hatasını yakalıyor. Eskiden görsel gelmeyince
 *   kutu boş kalıyordu ve sorunun URL'de mi yüklemede mi olduğu
 *   anlaşılmıyordu.
 *
 * ★ Sorun çıkarsa URL'i gösteriyor — bucket public değilse ya da yol
 *   yanlışsa tek bakışta belli oluyor.
 */
function GorselOnizleme({
  url, yukleniyor, bosMetin, yukseklik, icerideBosluk,
}: {
  url: string | null
  yukleniyor?: boolean
  bosMetin: string
  yukseklik: number
  icerideBosluk?: boolean
}) {
  const [hata, setHata] = useState(false)

  // URL değişince hata durumunu sıfırla
  const [sonUrl, setSonUrl] = useState(url)
  if (sonUrl !== url) { setSonUrl(url); setHata(false) }

  return (
    <div className="mb-2">
      <div
        className="flex items-center justify-center overflow-hidden rounded-xl border border-hairline bg-raised"
        style={{ height: yukseklik }}
      >
        {yukleniyor ? (
          <div className="flex flex-col items-center gap-2">
            <Spinner />
            <span className="text-[12px] text-muted">Yükleniyor…</span>
          </div>
        ) : !url ? (
          <span className="text-[12.5px] text-faint">{bosMetin}</span>
        ) : hata ? (
          /* ★ Sebebi TAHMİN ETMİYORUZ. Eskiden "bucket kapalı olabilir"
             yazıyordu ama çoğu durumda sebep o değil. Kullanıcıyı
             gerçek teşhise yönlendiriyoruz. */
          <div className="px-4 text-center">
            <span className="block text-[12.5px] font-medium text-danger">
              Görsel bu sayfada açılamadı
            </span>
            <span className="mt-1 block text-[11px] leading-relaxed text-faint">
              Adresi yeni sekmede açıp dene. Orada açılıyorsa sorun
              dosyada değil, sunucunun yanıt başlıklarında.
            </span>
            <span className="mt-1.5 block text-[11px] text-faint">
              Ayarlar → Depolama tanısı → Sunucudan test et
            </span>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            /* ★ Panel üzerinden geçiyor — adreste "reklam" kelimesi
               kalmıyor, eklentiler engellemiyor */
            src={panelGorsel(url) ?? url}
            alt=""
            onError={() => setHata(true)}
            className={
              icerideBosluk
                ? "max-h-[110px] max-w-[110px] object-contain"
                : "h-full w-full object-contain"
            }
          />
        )}
      </div>

      {/* ★ Sorun varsa URL tıklanabilir olsun — yeni sekmede test için */}
      {url && hata ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 block break-all rounded-lg bg-raised px-2.5 py-1.5 font-mono text-[10.5px] text-faint hover:text-accent"
        >
          {url}
        </a>
      ) : null}
    </div>
  )
}

interface Props {
  kampanya: {
    id: string
    title: string
    description: string | null
    image_url: string | null
    logo_url: string | null
    target_value: string | null
    monthly_price: number
    months: number
    status: string
  }
}

export function AdEditPanel({ kampanya }: Props) {
  const router = useRouter()

  const [acik, setAcik] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [title, setTitle] = useState(kampanya.title)
  const [desc, setDesc] = useState(kampanya.description ?? "")
  const [url, setUrl] = useState(kampanya.target_value ?? "")
  const [fiyat, setFiyat] = useState(String(Math.round(Number(kampanya.monthly_price))))
  const [ay, setAy] = useState(String(kampanya.months))

  /* ★ Ham adres tutuluyor; gösterimde `panelGorsel()` ile panel
     üzerinden geçiriliyor. Kaydederken ham adres yazılıyor —
     mobil doğrudan Supabase'den okumaya devam ediyor. */
  const [imageUrl, setImageUrl] = useState(kampanya.image_url)
  const [logoUrl, setLogoUrl] = useState(kampanya.logo_url)
  const [imgYuk, setImgYuk] = useState(false)
  const [logoYuk, setLogoYuk] = useState(false)

  const imgRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)

  /* ── URL doğrulaması: isteğe bağlı, doluysa biçim ── */
  const urlHata = useMemo(
    () => (url.trim() && !URL_DESENI.test(url.trim())
      ? "Adres https:// ile başlamalı"
      : null),
    [url]
  )

  const degisti = useMemo(() => (
    title.trim() !== kampanya.title ||
    (desc.trim() || null) !== kampanya.description ||
    url.trim() !== (kampanya.target_value ?? "") ||
    imageUrl !== kampanya.image_url ||
    logoUrl !== kampanya.logo_url ||
    Number(fiyat) !== Math.round(Number(kampanya.monthly_price)) ||
    Number(ay) !== kampanya.months
  ), [title, desc, url, imageUrl, logoUrl, fiyat, ay, kampanya])

  /* ── Görsel yükle ── */
  const yukle = useCallback(async (
    dosya: File,
    tur: "image" | "logo"
  ) => {
    const setYuk = tur === "image" ? setImgYuk : setLogoYuk
    setYuk(true)
    setErr(null)

    try {
      const imza = await createSignedUploadAction({
        bucket: "reklam",
        klasor: tur,
        fileName: dosya.name,
        mimeType: dosya.type || "application/octet-stream",
        sizeBytes: dosya.size,
      })

      // Boyut/yetki hatasıysa sunucu yolu da çözmez
      if (!imza.ok && imza.error && !imza.error.includes("adres")) {
        setErr(imza.error)
        return
      }

      const r = await akilliYukle({
        bucket: "reklam",
        klasor: tur,
        file: dosya,
        imza: imza.ok ? imza : null,
      })

      if (!r.ok) { setErr(r.error ?? "Yüklenemedi."); return }

      if (tur === "image") setImageUrl(r.publicUrl ?? null)
      else setLogoUrl(r.publicUrl ?? null)

      setOk(tur === "image" ? "Görsel yüklendi — kaydetmeyi unutma." : "Logo yüklendi — kaydetmeyi unutma.")
    } finally {
      setYuk(false)
    }
  }, [])

  /* ── Kaydet ── */
  const kaydet = useCallback(async () => {
    if (urlHata) { setErr(urlHata); return }
    if (title.trim().length < 3) { setErr("Başlık en az 3 karakter olmalı."); return }

    const f = Number(fiyat)
    if (!Number.isFinite(f) || f < 1) { setErr("Geçerli bir aylık fiyat gir."); return }

    setBusy(true); setErr(null); setOk(null)

    const r = await updateAdAction({
      id: kampanya.id,
      title: title.trim(),
      description: desc.trim() || null,
      image_url: imageUrl,
      logo_url: logoUrl,
      target_value: url.trim(),
      monthly_price: f,
      months: Number(ay),
    })

    setBusy(false)

    if (!r.ok) { setErr(r.error ?? "Kaydedilemedi."); return }

    setOk("Değişiklikler kaydedildi.")
    router.refresh()
  }, [kampanya.id, title, desc, url, imageUrl, logoUrl, fiyat, ay, urlHata, router])

  const sifirla = useCallback(() => {
    setTitle(kampanya.title)
    setDesc(kampanya.description ?? "")
    setUrl(kampanya.target_value ?? "")
    setFiyat(String(Math.round(Number(kampanya.monthly_price))))
    setAy(String(kampanya.months))
    setImageUrl(kampanya.image_url)
    setLogoUrl(kampanya.logo_url)
    setErr(null); setOk(null)
  }, [kampanya])

  if (!acik) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Düzenle</CardTitle>
            <p className="mt-1 text-[12.5px] text-muted">
              Başlık, açıklama, görsel, logo, adres, fiyat ve süreyi
              değiştirebilirsin. Panelden yapılan değişiklik onay beklemez.
            </p>
          </div>
          <Button onClick={() => setAcik(true)}>Düzenlemeyi aç</Button>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Reklamı düzenle</CardTitle>
        <Button variant="ghost" size="sm" onClick={() => { sifirla(); setAcik(false) }}>
          Kapat
        </Button>
      </div>

      {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}
      {ok && <div className="mb-3"><SuccessBox>{ok}</SuccessBox></div>}

      {/* ── GÖRSELLER ── */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        {/* Ana görsel */}
        <div>
          <div className="mb-2 text-[12.5px] font-semibold text-text">Reklam görseli</div>

          <GorselOnizleme
            url={imageUrl}
            yukleniyor={imgYuk}
            bosMetin="Görsel yok"
            yukseklik={150}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={imgYuk}
              onClick={() => imgRef.current?.click()}
            >
              {imgYuk && <Spinner />}
              {imageUrl ? "Değiştir" : "Görsel ekle"}
            </Button>

            {imageUrl && (
              <Button
                variant="ghost"
                size="sm"
                disabled={imgYuk}
                onClick={() => { setImageUrl(null); setOk("Görsel kaldırıldı — kaydetmeyi unutma.") }}
              >
                Kaldır
              </Button>
            )}
          </div>

          <input
            ref={imgRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (f) void yukle(f, "image")
            }}
          />
        </div>

        {/* Logo */}
        <div>
          <div className="mb-2 text-[12.5px] font-semibold text-text">
            Logo <span className="font-normal text-faint">(isteğe bağlı)</span>
          </div>

          <GorselOnizleme
            url={logoUrl}
            yukleniyor={logoYuk}
            bosMetin="Logo yok"
            yukseklik={150}
            icerideBosluk
          />

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={logoYuk}
              onClick={() => logoRef.current?.click()}
            >
              {logoYuk && <Spinner />}
              {logoUrl ? "Değiştir" : "Logo ekle"}
            </Button>

            {logoUrl && (
              <Button
                variant="ghost"
                size="sm"
                disabled={logoYuk}
                onClick={() => { setLogoUrl(null); setOk("Logo kaldırıldı — kaydetmeyi unutma.") }}
              >
                Kaldır
              </Button>
            )}
          </div>

          <input
            ref={logoRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ""
              if (f) void yukle(f, "logo")
            }}
          />
        </div>
      </div>

      {/* ── METİNLER ── */}
      <div className="mb-4 grid gap-4">
        <Field label="Başlık" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Reklam başlığı"
          />
        </Field>

        <Field label="Açıklama">
          <Textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="Kampanya açıklaması"
          />
        </Field>

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
          {urlHata && (
            <span className="mt-1.5 block text-[12px] text-danger">{urlHata}</span>
          )}
        </Field>
      </div>

      {/* ── FİYAT VE SÜRE ── */}
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <Field label="Aylık fiyat (₺)" required>
          <Input
            type="number"
            min={1}
            value={fiyat}
            onChange={(e) => setFiyat(e.target.value.replace(/[^0-9]/g, ""))}
          />
        </Field>

        <Field label="Süre">
          <Select value={ay} onChange={(e) => setAy(e.target.value)}>
            <option value="1">1 ay</option>
            <option value="2">2 ay</option>
            <option value="3">3 ay</option>
          </Select>
        </Field>
      </div>

      {/* Toplam önizleme */}
      {Number(fiyat) > 0 && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-hairline bg-raised px-4 py-3">
          <span className="text-[13px] text-muted">{ay} aylık toplam</span>
          <span className="text-[16px] font-bold text-text">
            {(Number(fiyat) * Number(ay)).toLocaleString("tr-TR")} ₺
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={kaydet} disabled={busy || !degisti || imgYuk || logoYuk}>
          {busy && <Spinner />}
          Kaydet
        </Button>
        <Button variant="secondary" onClick={sifirla} disabled={busy}>
          Geri al
        </Button>
      </div>

      {kampanya.status === "active" && (
        <p className="mt-3 text-[12px] leading-relaxed text-faint">
          Bu reklam şu anda yayında. Değişiklikler kaydeder kaydetmez
          uygulamada görünür.
        </p>
      )}
    </Card>
  )
}
