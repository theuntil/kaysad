"use client"

// ═══════════════════════════════════════════════════════════════════════
// İÇERİK LİSTESİ VE DETAYI
//
// ★ Kart görselinde sıra: image_url → cover_url → thumbnail → ilk dizi
//   elemanı. Video gönderilerde image_url boş olduğu için kapak
//   cover_url'den geliyor; artık boş kare kalmıyor.
//
// ★ Detayda üç sekme: Bilgiler · Medya · Düzenle
//   Bilgiler sekmesinde JSON kolonlar (ilanların `detail` alanı gibi)
//   alan alan açılıyor — ham JSON basılmıyor.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { updateContentAction, deleteContentAction } from "@/actions/content.actions"
import { fetchMediaColumns, type MediaColumn } from "@/actions/contentmedia.actions"
import { ContentMediaEditor } from "@/components/ContentMediaEditor"
import { ValueView, alanAdi, genisAlan } from "@/components/ValueView"
import {
  Avatar, Badge, Button, EmptyState, ErrorBox, Field, Input, Modal,
  Segmented, Spinner, SuccessBox, Switch, Textarea,
} from "@/components/ui"
import { timeAgo } from "@/lib/utils"
import type { ContentKind, ContentRow } from "@/lib/types.v3"

const TITLE_KEYS = ["title", "baslik", "name", "ad", "isim", "urun_adi", "etkinlik_adi"]
const TEXT_KEYS  = ["description", "aciklama", "content", "icerik", "caption", "metin"]
// ★ Sıra önemli: video gönderilerde image_url boş, cover_url dolu
// ★ Sıra önemli: video gönderilerde image_url boş, cover_url dolu.
//   Liste geniş tutuldu — projedeki kolon adı ne olursa olsun yakalansın.
const IMG_KEYS   = ["image_url", "cover_url", "thumbnail_url", "thumb_url", "preview_url",
                    "kapak_url", "kapak", "cover", "thumbnail", "poster_url", "poster",
                    "photo_url", "foto_url", "resim_url", "resim",
                    "images", "gorseller", "photos", "fotolar", "media", "medya",
                    "gorsel", "media_urls", "image_urls"]

const VIDEO_KEYS = ["video_url", "video", "medya_url", "video_urls", "videolar"]
const PRICE_KEYS = ["price", "fiyat", "indirim_orani", "discount", "tutar"]
const DATE_KEYS  = ["created_at", "tarih", "olusturma_tarihi", "inserted_at", "start_at"]
const GIZLI      = ["id", "user_id", "author_id", "owner_id", "profile_id", "kullanici_id",
                    "created_by", "_sahip_username", "_sahip_avatar"]

function pick(row: ContentRow, keys: string[]): unknown {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== "") return v
  }
  return null
}

const VIDEO_RE = /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i

/**
 * ★ Kapak bulma sırası:
 *   1. Görsel kolonları (cover_url dahil) — resim olan ilk değer
 *   2. Hiç görsel yoksa VİDEO adresi → <video> etiketiyle ilk kare
 *      gösteriliyor (poster olmasa da tarayıcı ilk kareyi çiziyor).
 *   Böylece kapağı olmayan video gönderilerde de boş kare kalmıyor.
 */
function kapak(row: ContentRow): { url: string | null; video: boolean } {
  let videoAdres: string | null = null

  for (const k of IMG_KEYS.concat(VIDEO_KEYS)) {
    const v = row[k]

    const dene = (x: unknown) => {
      if (typeof x !== "string" || !x.startsWith("http")) return false
      if (VIDEO_RE.test(x)) { if (!videoAdres) videoAdres = x; return false }
      return true
    }

    if (typeof v === "string" && dene(v)) return { url: v, video: false }
    if (Array.isArray(v)) {
      for (const x of v) if (dene(x)) return { url: x as string, video: false }
    }
  }

  // Görsel yok — video varsa onu kapak olarak kullan
  if (videoAdres) return { url: videoAdres, video: true }
  return { url: null, video: false }
}

function medyaSayisi(row: ContentRow): number {
  let n = 0
  for (const k of IMG_KEYS.concat(VIDEO_KEYS)) {
    const v = row[k]
    if (typeof v === "string" && v.startsWith("http")) n++
    else if (Array.isArray(v)) n += v.filter((x) => typeof x === "string" && (x as string).startsWith("http")).length
  }
  return n
}

function asText(v: unknown): string {
  if (v === null || v === undefined) return "—"
  if (typeof v === "boolean") return v ? "Evet" : "Hayır"
  if (typeof v === "object") return JSON.stringify(v)
  return String(v)
}

export function ContentBrowser({
  kind, rows, tablo,
}: {
  kind: ContentKind
  rows: ContentRow[]
  tablo: string
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<ContentRow | null>(null)
  const [sekme, setSekme] = useState<"bilgi" | "medya">("bilgi")
  const [duzenle, setDuzenle] = useState(false)
  const [patch, setPatch] = useState<Record<string, unknown>>({})
  const [medyaKolon, setMedyaKolon] = useState<MediaColumn[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  // Detay açılınca medya kolonlarını çek
  useEffect(() => {
    if (!detail) return
    void fetchMediaColumns(kind).then((r) => setMedyaKolon(r.columns))
  }, [detail, kind])

  // Liste yenilenince açık detayı güncelle
  useEffect(() => {
    if (!detail) return
    const yeni = rows.find((r) => String(r.id) === String(detail.id))
    if (yeni) setDetail(yeni)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows])

  function ac(row: ContentRow) {
    setDetail(row); setSekme("bilgi"); setDuzenle(false); setPatch({}); setConfirmDelete(false)
    setErr(null); setOk(null)
  }

  function kaydet() {
    if (!detail) return
    startBusy(async () => {
      const r = await updateContentAction({ kind, id: String(detail.id), patch })
      if (!r.ok) { setErr(r.error ?? "Güncellenemedi."); return }
      setErr(null); setOk("Güncellendi.")
      setPatch({}); setDuzenle(false)
      router.refresh()
    })
  }

  function kaldir() {
    if (!detail) return
    startBusy(async () => {
      const r = await deleteContentAction({ kind, id: String(detail.id) })
      if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }
      setErr(null); setOk("Silindi.")
      setDetail(null); setConfirmDelete(false)
      router.refresh()
    })
  }

  if (rows.length === 0) return <EmptyState title="Kayıt yok" />

  const duzenlenebilir = detail
    ? Object.entries(detail).filter(([k, v]) => {
        if (GIZLI.includes(k)) return false
        if (medyaKolon.some((c) => c.kolon === k)) return false  // medya sekmesinde
        if (v === null) return true
        const t = typeof v
        return t === "string" || t === "number" || t === "boolean"
      })
    : []

  const bilgiAlanlari = detail
    ? Object.entries(detail).filter(([k]) => !k.startsWith("_"))
    : []

  return (
    <div className="space-y-3">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      {/* ══════ LİSTE ══════
           ★ Izgara yerine liste: 100.000 kayıtta ızgara hem çok yer
             kaplıyor hem tarayıcıyı yoruyor. Satır düzeni sabit
             yükseklikte, göz tarayarak okuyabiliyor.
           ★ Görseller loading="lazy" ve decoding="async" — ekranda
             olmayanlar indirilmiyor. */}
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
        <ul className="divide-y divide-hairline">
          {rows.map((row, i) => {
            const k = kapak(row)
            const title = pick(row, TITLE_KEYS)
            const text = pick(row, TEXT_KEYS)
            const price = pick(row, PRICE_KEYS)
            const date = pick(row, DATE_KEYS)
            const kapali = row.is_active === false || row.aktif === false
            const boost = row.super_boost === true ? "super" : row.boost === true ? "boost" : null
            const sahip = row._sahip_username as string | null
            const adet = medyaSayisi(row)

            return (
              <li key={String(row.id ?? i)}>
                <button
                  type="button"
                  onClick={() => ac(row)}
                  className="flex w-full items-center gap-3.5 px-3.5 py-3 text-left transition-colors hover:bg-white/[0.03]"
                >
                  {/* ── Kapak ── */}
                  <span className="relative h-[58px] w-[80px] shrink-0 overflow-hidden rounded-lg bg-raised">
                    {k.url ? (
                      k.video ? (
                        <video
                          src={`${k.url}#t=0.5`}
                          className="h-full w-full object-cover"
                          preload="metadata"
                          muted
                          playsInline
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={k.url}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      )
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[9.5px] text-faint">
                        Görsel yok
                      </span>
                    )}

                    {k.video && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 backdrop-blur">
                          <svg viewBox="0 0 24 24" fill="#fff" className="ml-0.5 h-3 w-3">
                            <path d="M6 4l14 8-14 8z" />
                          </svg>
                        </span>
                      </span>
                    )}

                    {adet > 1 && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/65 px-1 text-[9px] font-medium text-white">
                        {adet}
                      </span>
                    )}
                  </span>

                  {/* ── Başlık + açıklama ── */}
                  <span className="min-w-0 flex-[3]">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-medium text-text">
                        {title ? asText(title) : `#${String(row.id ?? "").slice(0, 8)}`}
                      </span>
                      {kapali && <Badge tone="off">Kapalı</Badge>}
                      {boost === "super" && <Badge tone="promo">Süper</Badge>}
                      {boost === "boost" && <Badge tone="neutral">Boost</Badge>}
                    </span>
                    {text !== null && (
                      <span className="mt-0.5 block truncate text-[12px] text-muted">
                        {asText(text)}
                      </span>
                    )}
                  </span>

                  {/* ── Sahibi ── */}
                  <span className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
                    {sahip && (
                      <>
                        <Avatar url={row._sahip_avatar as string | null} name={sahip} size={22} />
                        <span className="truncate text-[12px] text-muted">{sahip}</span>
                      </>
                    )}
                  </span>

                  {/* ── Fiyat + tarih ── */}
                  <span className="shrink-0 text-right">
                    {price !== null && (
                      <span className="block text-[13px] font-semibold tabular-nums text-text">
                        {asText(price)}
                      </span>
                    )}
                    {date !== null && (
                      <span className="block text-[11px] text-faint">{timeAgo(String(date))}</span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {/* ══════ DETAY ══════ */}
      <Modal
        open={!!detail}
        onClose={() => { setDetail(null); setPatch({}) }}
        width="lg"
        title={
          detail
            ? (pick(detail, TITLE_KEYS) ? asText(pick(detail, TITLE_KEYS)) : "Kayıt detayı")
            : ""
        }
        footer={
          duzenle ? (
            <>
              <Button variant="ghost" onClick={() => { setPatch({}); setDuzenle(false) }} disabled={busy}>
                Vazgeç
              </Button>
              <Button onClick={kaydet} disabled={busy || Object.keys(patch).length === 0}>
                {busy && <Spinner />} Kaydet
              </Button>
            </>
          ) : (
            <>
              <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                Sil
              </Button>
              <Button variant="secondary" onClick={() => setDuzenle(true)} disabled={busy}>
                Düzenle
              </Button>
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-4">
            {!duzenle && (
            <Segmented
              value={sekme}
              onChange={(v) => setSekme(v)}
              size="sm"
              options={[
                { value: "bilgi", label: "Bilgiler" },
                { value: "medya", label: `Medya (${medyaSayisi(detail)})` },
              ]}
            />
            )}

            {/* ── SAHİBİ ── */}
            {(detail.user_id || detail.author_id) ? (
              <Link
                href={`/kullanicilar/${detail.user_id ?? detail.author_id}`}
                className="flex items-center gap-2.5 rounded-xl border border-hairline bg-raised px-3.5 py-2.5 hover:border-accent/40"
              >
                <Avatar
                  url={detail._sahip_avatar as string | null}
                  name={detail._sahip_username as string | null}
                  size={30}
                />
                <span className="text-[13px] text-text">
                  {(detail._sahip_username as string | null) ?? "Sahibi"}
                </span>
                <span className="ml-auto text-[12px] text-muted">Profili aç →</span>
              </Link>
            ) : null}

            {/* ── BİLGİLER ── */}
            {!duzenle && sekme === "bilgi" && (
              <div className="grid gap-2 sm:grid-cols-2">
                {bilgiAlanlari.map(([k, v]) => (
                  <div
                    key={k}
                    className={
                      "rounded-xl border border-hairline bg-raised px-3.5 py-2.5 " +
                      (genisAlan(v) ? "sm:col-span-2" : "")
                    }
                  >
                    <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
                      {alanAdi(k)}
                    </div>
                    <div className="text-[13px] leading-relaxed text-text">
                      <ValueView k={k} v={v} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── MEDYA ── */}
            {!duzenle && sekme === "medya" && (
              <ContentMediaEditor kind={kind} row={detail} columns={medyaKolon} />
            )}

            {/* ── DÜZENLE ── */}
            {duzenle && (
              <div className="grid gap-4 sm:grid-cols-2">
                {duzenlenebilir.map(([k, v]) => {
                  const current = k in patch ? patch[k] : v
                  if (typeof v === "boolean") {
                    return (
                      <Switch
                        key={k}
                        checked={current === true}
                        onChange={(nv) => setPatch((p) => ({ ...p, [k]: nv }))}
                        label={alanAdi(k)}
                      />
                    )
                  }
                  const uzun = typeof v === "string" && v.length > 90
                  return (
                    <Field
                      key={k}
                      label={alanAdi(k)}
                      className={uzun ? "sm:col-span-2" : undefined}
                    >
                      {uzun ? (
                        <Textarea
                          value={current === null ? "" : String(current)}
                          onChange={(e) => setPatch((p) => ({ ...p, [k]: e.target.value }))}
                        />
                      ) : (
                        <Input
                          type={typeof v === "number" ? "number" : "text"}
                          value={current === null ? "" : String(current)}
                          onChange={(e) =>
                            setPatch((p) => ({
                              ...p,
                              [k]: typeof v === "number"
                                ? (e.target.value === "" ? null : Number(e.target.value))
                                : e.target.value,
                            }))
                          }
                        />
                      )}
                    </Field>
                  )
                })}

                <p className="text-[11px] text-faint sm:col-span-2">
                  Medya alanları Medya sekmesinden yönetiliyor.
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Kaydı sil"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button variant="danger" onClick={kaldir} disabled={busy}>
              {busy && <Spinner />} Sil
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          <code className="font-mono text-[12px]">{tablo}</code> tablosundaki kayıt ve
          bağlı medyası silinecek. Geri alınamaz.
        </p>
      </Modal>
    </div>
  )
}
