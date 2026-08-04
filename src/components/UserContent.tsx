// src/components/UserContent.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// KULLANICI İÇERİĞİ — gönderi / ilan / indirim / etkinlik
//
// ┌─ TASARIM ─────────────────────────────────────────────────────────┐
// │ • Kolon adları koda gömülmüyor: satırlar ham json geliyor, bileşen  │
// │   bilinen adaylardan başlık/medya/fiyat/tarih çıkarıyor.           │
// │ • Detay artık JSON dökümü DEĞİL: medya galerisi + gruplanmış,       │
// │   biçimlendirilmiş alan listesi.                                   │
// │ • VİDEO GÖNDERİLERİ: image_url boşsa cover_url / thumbnail_url'e    │
// │   düşülüyor; video ise oynatıcı gösteriliyor.                      │
// │ • Medya değiştirme: dosya AYNI YOLA üzerine yazılıyor, sonra kolon  │
// │   önbellek kırıcı ?v= ile güncelleniyor.                          │
// └───────────────────────────────────────────────────────────────────┘

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  fetchUserContent, updateContentAction, deleteContentAction,
} from "@/actions/content.actions"
import { replaceMediaAction } from "@/actions/media.actions"
import { parseStorageUrl, isVideoUrl } from "@/lib/storage"
import {
  Badge, Button, EmptyState, ErrorBox, Field, Input, Modal, Skeleton,
  Spinner, SuccessBox, Switch, Textarea, WarnBox,
} from "@/components/ui"
import { fmtDate, timeAgo, cn } from "@/lib/utils"
import type { ContentKind, ContentRow, ContentListResult } from "@/lib/types.v3"

const KINDS: { value: ContentKind; label: string }[] = [
  { value: "post",     label: "Gönderiler" },
  { value: "listing",  label: "İlanlar" },
  { value: "discount", label: "İndirimler" },
  { value: "event",    label: "Etkinlikler" },
]

/* ═══════════════ ALAN TANIMA ═══════════════ */

const TITLE_KEYS = ["title", "baslik", "name", "ad", "isim", "urun_adi", "etkinlik_adi"]
const TEXT_KEYS  = ["description", "aciklama", "content", "icerik", "caption", "metin"]
// ★ Sıra önemli: videolu gönderide image_url boş, cover_url dolu olur.
const COVER_KEYS = ["cover_url", "thumbnail_url", "thumb_url", "preview_url", "kapak_url", "kapak"]
const IMAGE_KEYS = ["image_url", "photo_url", "gorsel", "resim", "banner_url", ...COVER_KEYS]
const VIDEO_KEYS = ["video_url", "video", "media_url", "klip_url"]
const ARRAY_MEDIA_KEYS = ["images", "gorseller", "media", "medya", "photos", "resimler"]
const PRICE_KEYS = ["price", "fiyat", "indirim_orani", "discount", "tutar", "ucret"]
const DATE_KEYS  = ["created_at", "tarih", "olusturma_tarihi", "inserted_at", "start_at", "baslangic"]
const STATUS_KEYS = ["is_active", "aktif", "published", "yayinda", "onayli", "is_approved", "durum", "status"]

const HIDDEN_EDIT = ["id", "user_id", "author_id", "owner_id", "profile_id",
                     "kullanici_id", "created_by", "isletme_id", "created_at", "updated_at"]

function pickKey(row: ContentRow, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && v !== "") return k
  }
  return null
}

function pick(row: ContentRow, keys: string[]): unknown {
  const k = pickKey(row, keys)
  return k ? row[k] : null
}

/** Listede gösterilecek kapak: görsel yoksa video kapağı, o da yoksa null */
function thumbOf(row: ContentRow): { url: string; video: boolean } | null {
  for (const k of [...COVER_KEYS, "image_url", "photo_url", "gorsel", "resim", "banner_url"]) {
    const v = row[k]
    if (typeof v === "string" && v.startsWith("http")) return { url: v, video: false }
  }
  for (const k of ARRAY_MEDIA_KEYS) {
    const v = row[k]
    if (Array.isArray(v)) {
      const f = v.find((x) => typeof x === "string" && x.startsWith("http"))
      if (f) return { url: f as string, video: isVideoUrl(f as string, k) }
    }
  }
  for (const k of VIDEO_KEYS) {
    const v = row[k]
    if (typeof v === "string" && v.startsWith("http")) return { url: v, video: true }
  }
  return null
}

/** Detayda gösterilecek tüm medya alanları (tek tek değiştirilebilir) */
function mediaFields(row: ContentRow): { key: string; url: string; video: boolean; index?: number }[] {
  const out: { key: string; url: string; video: boolean; index?: number }[] = []

  for (const k of [...IMAGE_KEYS, ...VIDEO_KEYS]) {
    const v = row[k]
    if (typeof v === "string" && v.startsWith("http")) {
      if (out.some((m) => m.key === k)) continue
      out.push({ key: k, url: v, video: isVideoUrl(v, k) })
    }
  }
  for (const k of ARRAY_MEDIA_KEYS) {
    const v = row[k]
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "string" && item.startsWith("http")) {
          out.push({ key: k, url: item, video: isVideoUrl(item, k), index: i })
        }
      })
    }
  }
  return out
}

/* ═══════════════ BİÇİMLENDİRME ═══════════════ */

/** snake_case → "Okunabilir Etiket" */
function label(key: string): string {
  const tr: Record<string, string> = {
    title: "Başlık", baslik: "Başlık", name: "Ad", description: "Açıklama",
    aciklama: "Açıklama", content: "İçerik", caption: "Metin", price: "Fiyat",
    fiyat: "Fiyat", sehir: "Şehir", category: "Kategori", kategori: "Kategori",
    created_at: "Oluşturma", updated_at: "Güncelleme", is_active: "Aktif",
    image_url: "Görsel", cover_url: "Kapak görseli", video_url: "Video",
    address: "Adres", adres: "Adres", like_count: "Beğeni",
    comment_count: "Yorum", view_count: "Görüntülenme",
    start_at: "Başlangıç", end_at: "Bitiş", stok: "Stok", quota: "Kota",
  }
  if (tr[key]) return tr[key]
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toLocaleUpperCase("tr"))
}

function isIsoDate(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)
}

function ValueView({ k, v }: { k: string; v: unknown }) {
  if (v === null || v === undefined || v === "") {
    return <span className="text-faint">—</span>
  }
  if (typeof v === "boolean") {
    return <Badge tone={v ? "live" : "off"}>{v ? "Evet" : "Hayır"}</Badge>
  }
  if (isIsoDate(v)) {
    return <span title={String(v)}>{fmtDate(String(v))}</span>
  }
  if (typeof v === "string" && v.startsWith("http")) {
    return (
      <a href={v} target="_blank" rel="noreferrer" className="break-all text-info hover:underline">
        {v.length > 52 ? v.slice(0, 52) + "…" : v}
      </a>
    )
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-faint">Boş</span>
    return (
      <span className="flex flex-wrap gap-1">
        {v.slice(0, 8).map((x, i) => (
          <span key={i} className="rounded-md border border-hairline bg-raised px-1.5 py-[1px] text-[11.5px]">
            {typeof x === "string" && x.startsWith("http") ? "Medya" : String(x).slice(0, 24)}
          </span>
        ))}
        {v.length > 8 && <span className="text-faint">+{v.length - 8}</span>}
      </span>
    )
  }
  if (typeof v === "object") {
    return (
      <span className="break-all font-mono text-[11.5px] text-muted">
        {JSON.stringify(v).slice(0, 120)}
      </span>
    )
  }
  if (typeof v === "number") {
    return <span className="tabular-nums">{v.toLocaleString("tr")}</span>
  }
  return <span className="whitespace-pre-wrap">{String(v)}</span>
}

/** Alanları anlamlı gruplara ayır — tek uzun liste yerine */
function groupFields(row: ContentRow) {
  const mediaKeys = new Set([...IMAGE_KEYS, ...VIDEO_KEYS, ...ARRAY_MEDIA_KEYS])
  const temel: string[] = []
  const durum: string[] = []
  const sayilar: string[] = []
  const tarih: string[] = []
  const diger: string[] = []

  for (const k of Object.keys(row)) {
    if (mediaKeys.has(k)) continue
    if (k === "id") continue
    const v = row[k]
    if (TITLE_KEYS.includes(k) || TEXT_KEYS.includes(k) || PRICE_KEYS.includes(k)) temel.push(k)
    else if (STATUS_KEYS.includes(k) || typeof v === "boolean") durum.push(k)
    else if (isIsoDate(v) || DATE_KEYS.includes(k)) tarih.push(k)
    else if (typeof v === "number") sayilar.push(k)
    else diger.push(k)
  }
  return { temel, durum, sayilar, tarih, diger }
}

/* ═══════════════ MEDYA ÖNİZLEME + DEĞİŞTİRME ═══════════════ */

function MediaBox({
  m, kind, id, userId, onChanged,
}: {
  m: { key: string; url: string; video: boolean; index?: number }
  kind: ContentKind
  id: string
  userId: string
  onChanged: (msg: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const parsed = parseStorageUrl(m.url)
  const dizi = m.index !== undefined

  async function upload(file: File) {
    setBusy(true); setErr(null)
    const fd = new FormData()
    fd.set("kind", kind)
    fd.set("id", id)
    fd.set("column", m.key)
    fd.set("currentUrl", m.url)
    fd.set("userId", userId)
    fd.set("file", file)
    const r = await replaceMediaAction(fd)
    setBusy(false)
    if (!r.ok) { setErr(r.error ?? "Değiştirilemedi."); return }
    onChanged(r.message ?? "Medya değiştirildi.")
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-raised">
      <div className="relative bg-black/40">
        {m.video ? (
          <video
            src={m.url}
            controls
            preload="metadata"
            className="max-h-[220px] w-full bg-black object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.url} alt={m.key} className="max-h-[220px] w-full object-contain" />
        )}
        <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-[2px] font-mono text-[10.5px] text-white/90">
          {m.key}{dizi ? `[${m.index}]` : ""}
        </span>
      </div>

      <div className="space-y-2 px-3 py-2.5">
        <p className="break-all font-mono text-[10.5px] leading-relaxed text-faint">
          {parsed ? `${parsed.bucket}/${parsed.path}` : "harici adres"}
        </p>

        {err && <p className="text-[11.5px] leading-relaxed text-danger">{err}</p>}

        {dizi ? (
          // ★ Dizi içindeki medyayı tek tek değiştirmek, diziyi yeniden
          //   yazmayı gerektirir; yanlış sıra bozulmasın diye kapalı.
          <p className="text-[11px] text-faint">Dizi medyası değiştirilemez.</p>
        ) : !parsed ? (
          <p className="text-[11px] text-faint">Harici adres.</p>
        ) : (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,video/mp4,video/quicktime,video/webm"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void upload(f)
                e.target.value = ""
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy && <Spinner />} {busy ? "Yükleniyor…" : "Medyayı değiştir"}
            </Button>

          </>
        )}
      </div>
    </div>
  )
}

/* ═══════════════ ANA BİLEŞEN ═══════════════ */

export function UserContent({ userId }: { userId: string }) {
  const router = useRouter()
  const [kind, setKind] = useState<ContentKind>("post")
  const [data, setData] = useState<ContentListResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [detail, setDetail] = useState<ContentRow | null>(null)
  const [editing, setEditing] = useState(false)
  const [patch, setPatch] = useState<Record<string, unknown>>({})
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, startBusy] = useTransition()

  async function load(k: ContentKind) {
    setLoading(true); setErr(null)
    const r = await fetchUserContent({ userId, kind: k, limit: 30 })
    setLoading(false)
    if (r.error) { setErr(r.error); setData(null); return }
    setData(r.result)
  }

  useEffect(() => {
    void load(kind)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, userId])

  const rows = data?.satirlar ?? []

  function save() {
    if (!detail) return
    const id = String(detail.id ?? "")
    startBusy(async () => {
      const r = await updateContentAction({ kind, id, patch, userId })
      if (!r.ok) { setErr(r.error ?? "Güncellenemedi."); return }
      setErr(null); setOk(r.message ?? "Güncellendi.")
      setDetail(null); setPatch({}); setEditing(false)
      await load(kind)
      router.refresh()
    })
  }

  function remove() {
    if (!detail) return
    const id = String(detail.id ?? "")
    startBusy(async () => {
      const r = await deleteContentAction({ kind, id, userId })
      if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }
      setErr(null); setOk(r.message ?? "Silindi.")
      setDetail(null); setConfirmDelete(false)
      await load(kind)
      router.refresh()
    })
  }

  async function afterMedia(msg: string) {
    setOk(msg)
    const id = String(detail?.id ?? "")
    await load(kind)
    // Detay penceresini tazele — yeni ?v= adresi görünsün
    const fresh = (await fetchUserContent({ userId, kind, limit: 30 })).result?.satirlar
      ?.find((r) => String(r.id) === id)
    if (fresh) setDetail(fresh)
    router.refresh()
  }

  const groups = detail ? groupFields(detail) : null
  const medias = detail ? mediaFields(detail) : []

  return (
    <div className="space-y-4">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      {/* ── Tip sekmeleri ── */}
      <div className="scroll-hint -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            className={cn(
              "shrink-0 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-colors",
              k.value === kind
                ? "border-accent/40 bg-accent/12 text-text"
                : "border-hairline bg-raised text-muted hover:text-text"
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* ── Liste ── */}
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Skeleton className="h-[84px]" />
          <Skeleton className="h-[84px]" />
          <Skeleton className="h-[84px]" />
          <Skeleton className="h-[84px]" />
        </div>
      ) : data?.hata ? (
        <WarnBox>
          <strong>{data.tablo}</strong> okunamadı: {data.hata}
        </WarnBox>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Kayıt yok"
        />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {rows.map((row, i) => {
            const th = thumbOf(row)
            const title = pick(row, TITLE_KEYS)
            const text = pick(row, TEXT_KEYS)
            const price = pick(row, PRICE_KEYS)
            const date = pick(row, DATE_KEYS)
            const kapali = (row.is_active ?? row.aktif ?? row.published ?? null) === false
            const videoVar = !!pickKey(row, VIDEO_KEYS) || (th?.video ?? false)

            return (
              <li key={String(row.id ?? i)}>
                <button
                  type="button"
                  onClick={() => { setDetail(row); setEditing(false); setPatch({}) }}
                  className="flex h-full w-full items-start gap-3 rounded-2xl border border-hairline bg-raised p-3 text-left transition-colors hover:border-accent/30"
                >
                  <span className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-hairline bg-surface">
                    {th ? (
                      th.video ? (
                        <video src={th.url} preload="metadata" muted className="h-full w-full object-cover" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={th.url} alt="" className="h-full w-full object-cover" />
                      )
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[10px] text-faint">
                        medya yok
                      </span>
                    )}
                    {videoVar && (
                      <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 text-[9px] font-semibold text-white">
                        VİDEO
                      </span>
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-text">
                        {title ? String(title) : `#${String(row.id ?? "").slice(0, 8)}`}
                      </span>
                      {kapali && <Badge tone="off">Kapalı</Badge>}
                    </span>
                    {text !== null && (
                      <span className="mt-0.5 line-clamp-2 block text-[12px] leading-relaxed text-muted">
                        {String(text)}
                      </span>
                    )}
                    <span className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-faint">
                      {price !== null && <span>{String(price)}</span>}
                      {date !== null && <span>{timeAgo(String(date))}</span>}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {rows.length >= 30 && (
        <p className="text-center text-[12px] text-faint">İlk 30 kayıt gösteriliyor.</p>
      )}

      {/* ══════ DETAY / DÜZENLEME ══════ */}
      <Modal
        open={!!detail}
        onClose={() => { setDetail(null); setEditing(false); setPatch({}) }}
        width="lg"
        title={
          editing
            ? "Kaydı düzenle"
            : detail
              ? String(pick(detail, TITLE_KEYS) ?? `#${String(detail.id ?? "").slice(0, 8)}`)
              : ""
        }
        footer={
          editing ? (
            <>
              <Button variant="ghost" onClick={() => { setEditing(false); setPatch({}) }} disabled={busy}>
                Vazgeç
              </Button>
              <Button onClick={save} disabled={busy || Object.keys(patch).length === 0}>
                {busy && <Spinner />} Kaydet
              </Button>
            </>
          ) : (
            <>
              <Button variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>Sil</Button>
              <Button variant="secondary" onClick={() => setEditing(true)} disabled={busy}>Düzenle</Button>
            </>
          )
        }
      >
        {detail && !editing && groups && (
          <div className="space-y-5">
            {/* ── Medya ── */}
            {medias.length > 0 ? (
              <div>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                  Medya ({medias.length})
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {medias.map((m, i) => (
                    <MediaBox
                      key={`${m.key}-${m.index ?? 0}-${i}`}
                      m={m}
                      kind={kind}
                      id={String(detail.id ?? "")}
                      userId={userId}
                      onChanged={(msg) => void afterMedia(msg)}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <p className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5 text-[12.5px] text-faint">
                Bu kayıtta medya alanı yok.
              </p>
            )}

            {/* ── Alan grupları ── */}
            {([
              ["Temel", groups.temel],
              ["Durum", groups.durum],
              ["Sayılar", groups.sayilar],
              ["Tarihler", groups.tarih],
              ["Diğer", groups.diger],
            ] as const).map(([baslik, keys]) =>
              keys.length === 0 ? null : (
                <div key={baslik}>
                  <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">
                    {baslik}
                  </h4>
                  {/* ★ Etiket ÜSTTE, değer ALTTA. Sol etiket / sağ değer
                       düzeni uzun metinlerde kırılıyor ve "placeholder"
                       gibi duruyordu. Bu düzen okuma yönünü bozmuyor. */}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {keys.map((k) => {
                      const v = detail[k]
                      const uzunMetin = typeof v === "string" && v.length > 80
                      return (
                        <div
                          key={k}
                          className={
                            "rounded-xl border border-hairline bg-raised px-3.5 py-2.5 " +
                            (uzunMetin ? "sm:col-span-2" : "")
                          }
                        >
                          <div className="mb-1 flex items-center gap-1.5">
                            <span className="text-[11px] font-medium uppercase tracking-wider text-faint">
                              {label(k)}
                            </span>
                            <code className="font-mono text-[10px] text-faint/60">{k}</code>
                          </div>
                          <div className="break-words text-[13px] leading-relaxed text-text">
                            <ValueView k={k} v={v} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {detail && editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(detail)
              .filter(([k, v]) => {
                if (HIDDEN_EDIT.includes(k)) return false
                if (isIsoDate(v)) return false
                if (v === null) return true
                const t = typeof v
                return t === "string" || t === "number" || t === "boolean"
              })
              .map(([k, v]) => {
                const current = k in patch ? patch[k] : v
                if (typeof v === "boolean" || typeof current === "boolean") {
                  return (
                    <Switch
                      key={k}
                      checked={current === true}
                      onChange={(nv) => setPatch((p) => ({ ...p, [k]: nv }))}
                      label={label(k)}
                    />
                  )
                }
                const uzun = typeof v === "string" && v.length > 90
                return (
                  <Field key={k} label={label(k)} className={uzun ? "sm:col-span-2" : undefined}>
                    {uzun ? (
                      <Textarea
                        value={current === null || current === undefined ? "" : String(current)}
                        onChange={(e) => setPatch((p) => ({ ...p, [k]: e.target.value }))}
                      />
                    ) : (
                      <Input
                        type={typeof v === "number" ? "number" : "text"}
                        value={current === null || current === undefined ? "" : String(current)}
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
          </div>
        )}
      </Modal>

      {/* ══════ SİLME ONAYI ══════ */}
      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Kaydı sil"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy && <Spinner />} Kalıcı olarak sil
            </Button>
          </>
        }
      >
        <p className="text-[13px] leading-relaxed text-muted">
          Kayıt <code className="font-mono text-[12px]">{String(detail?.id ?? "")}</code>{" "}
          veritabanından silinecek. Depodaki medya dosyaları SİLİNMEZ — tablonun
          silme kuralı ne diyorsa bağlı yorum/favori kayıtları da etkilenebilir.
        </p>
      </Modal>
    </div>
  )
}
