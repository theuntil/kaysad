// src/components/ValueView.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// DEĞER GÖSTERİMİ
//
// ★ SORUN: ilanların `detail` alanı gibi JSON kolonlar ekrana ham
//   basılıyordu: {"km":"333","fuel":"Benzin","year":2022,...}
//   Okunmuyordu.
//
// ★ ÇÖZÜM: JSON nesneler alan alan açılıyor, anahtarlar Türkçeleştiriliyor
//   (km → Kilometre, fuel → Yakıt). Diziler rozet listesi, URL'ler
//   tıklanabilir bağlantı, tarihler okunur biçim, boolean'lar etiket.
// ═══════════════════════════════════════════════════════════════════════

import { Badge } from "@/components/ui"
import { fmtDate } from "@/lib/utils"

/** Bilinen alan adlarının Türkçesi */
const ALAN_ADI: Record<string, string> = {
  km: "Kilometre", fuel: "Yakıt", year: "Yıl", brand: "Marka", model: "Model",
  color: "Renk", transmission: "Vites", adres: "Adres", address: "Adres",
  price: "Fiyat", fiyat: "Fiyat", currency: "Para birimi",
  rooms: "Oda", oda: "Oda", area: "Alan", metrekare: "Metrekare",
  floor: "Kat", kat: "Kat", heating: "Isıtma", isitma: "Isıtma",
  condition: "Durum", durum: "Durum", warranty: "Garanti",
  category: "Kategori", kategori: "Kategori", subcategory: "Alt kategori",
  city: "Şehir", sehir: "Şehir", district: "İlçe", ilce: "İlçe",
  phone: "Telefon", telefon: "Telefon", email: "E-posta",
  title: "Başlık", baslik: "Başlık", description: "Açıklama", aciklama: "Açıklama",
  discount: "İndirim", indirim_orani: "İndirim oranı",
  start_date: "Başlangıç", end_date: "Bitiş", tarih: "Tarih",
  capacity: "Kapasite", kapasite: "Kapasite", ticket: "Bilet", bilet: "Bilet",
  engine: "Motor", motor: "Motor", power: "Güç", body: "Kasa",
  seller: "Satıcı", type: "Tip", tip: "Tip", status: "Durum",
  size: "Beden", beden: "Beden", material: "Malzeme", brand_new: "Sıfır",
  is_active: "Aktif", aktif: "Aktif", boost: "Öne çıkarma", super_boost: "Süper öne çıkarma",
  view_count: "Görüntülenme", goruntulenme: "Görüntülenme",
  like_count: "Beğeni", begeni: "Beğeni", comment_count: "Yorum",
  created_at: "Oluşturma", updated_at: "Güncelleme",
}

export function alanAdi(k: string): string {
  const bilinen = ALAN_ADI[k.toLowerCase()]
  if (bilinen) return bilinen
  return k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toLocaleUpperCase("tr"))
}

function isTarih(k: string, v: unknown): boolean {
  if (typeof v !== "string") return false
  if (!/(_at|date|tarih|zaman)$/i.test(k)) return false
  return !Number.isNaN(Date.parse(v))
}

function isUrl(v: unknown): v is string {
  return typeof v === "string" && /^https?:\/\//.test(v)
}

/** Tek bir değeri uygun biçimde gösterir */
export function ValueView({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined || v === "") {
    return <span className="text-faint">—</span>
  }

  if (typeof v === "boolean") {
    return <Badge tone={v ? "live" : "off"}>{v ? "Evet" : "Hayır"}</Badge>
  }

  if (isTarih(k, v)) {
    return <span>{fmtDate(String(v))}</span>
  }

  if (isUrl(v)) {
    return (
      <a href={v} target="_blank" rel="noreferrer" className="break-all text-info hover:underline">
        {v.length > 48 ? `${v.slice(0, 48)}…` : v}
      </a>
    )
  }

  if (typeof v === "number") {
    return <span className="tabular-nums">{v.toLocaleString("tr")}</span>
  }

  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-faint">Boş</span>
    return (
      <span className="flex flex-wrap gap-1">
        {v.slice(0, 12).map((x, i) => (
          <Badge key={i} tone="neutral">
            {isUrl(x) ? "Medya" : String(x).slice(0, 28)}
          </Badge>
        ))}
        {v.length > 12 && <Badge tone="neutral">+{v.length - 12}</Badge>}
      </span>
    )
  }

  // ★ JSON NESNE — alan alan açılıyor
  if (typeof v === "object") {
    const girisler = Object.entries(v as Record<string, unknown>)
    if (girisler.length === 0) return <span className="text-faint">Boş</span>

    return (
      <div className="grid gap-1.5 sm:grid-cols-2">
        {girisler.map(([ik, iv]) => (
          <div
            key={ik}
            className="flex items-baseline justify-between gap-2 rounded-lg bg-white/[0.04] px-2.5 py-1.5"
          >
            <span className="shrink-0 text-[11px] text-faint">{alanAdi(ik)}</span>
            <span className="min-w-0 break-words text-right text-[12.5px] font-medium text-text">
              {iv === null || iv === undefined || iv === ""
                ? "—"
                : typeof iv === "boolean"
                  ? (iv ? "Evet" : "Hayır")
                  : typeof iv === "object"
                    ? JSON.stringify(iv).slice(0, 60)
                    : String(iv)}
            </span>
          </div>
        ))}
      </div>
    )
  }

  return <span className="break-words">{String(v)}</span>
}

/** Bir alanın tam genişlik kaplayıp kaplamayacağı */
export function genisAlan(v: unknown): boolean {
  if (typeof v === "string" && v.length > 80) return true
  if (Array.isArray(v) && v.length > 4) return true
  if (v !== null && typeof v === "object" && !Array.isArray(v)) return true
  return false
}
