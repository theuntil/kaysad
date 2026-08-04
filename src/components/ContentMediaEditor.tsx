// src/components/ContentMediaEditor.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// İÇERİK MEDYA YÖNETİMİ
//
// Bir içeriğin tüm medya alanlarını (cover_url, image_url, images[],
// video_url…) tek yerde gösterip değiştirmeyi sağlıyor.
//
// ★ Dizi kolonlarda her eleman ayrı ayrı değiştirilip silinebiliyor,
//   yeni eleman eklenebiliyor. İlanlarda 8 fotoğraf varsa 8'i de görünüyor.
// ═══════════════════════════════════════════════════════════════════════

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  attachContentMediaAction, removeContentMediaAction, type MediaColumn,
} from "@/actions/contentmedia.actions"
import { createSignedUploadAction } from "@/actions/upload.actions"
import { akilliYukle } from "@/lib/upload"
import { Badge, Button, ErrorBox, Modal, Spinner, SuccessBox } from "@/components/ui"
import { alanAdi } from "@/components/ValueView"
import type { ContentKind, ContentRow } from "@/lib/types.v3"

function isVideoUrl(u: string) { return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u) }

/** Tek bir medya karesi */
function MedyaKare({
  url, onDegistir, onSil, busy, etiket,
}: {
  url: string | null
  onDegistir: () => void
  onSil?: () => void
  busy: boolean
  etiket?: string
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-hairline bg-raised">
      <div className="aspect-video">
        {!url ? (
          <div className="flex h-full w-full items-center justify-center text-[11.5px] text-faint">
            Boş
          </div>
        ) : isVideoUrl(url) ? (
          <video src={url} controls className="h-full w-full object-contain" preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-contain" loading="lazy" />
        )}
      </div>

      {etiket && (
        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
          {etiket}
        </span>
      )}

      <div className="flex gap-1.5 border-t border-hairline p-2">
        <Button variant="secondary" size="sm" onClick={onDegistir} disabled={busy} className="flex-1">
          {url ? "Değiştir" : "Yükle"}
        </Button>
        {url && onSil && (
          <Button variant="danger" size="sm" onClick={onSil} disabled={busy}>
            Sil
          </Button>
        )}
      </div>
    </div>
  )
}

export function ContentMediaEditor({
  kind, row, columns,
}: {
  kind: ContentKind
  row: ContentRow
  columns: MediaColumn[]
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [yuzde, setYuzde] = useState<number | null>(null)
  const [sil, setSil] = useState<{ column: string; index: number | null } | null>(null)
  const [hedef, setHedef] = useState<{
    column: string; index: number | null; currentUrl: string; mode: "replace" | "add"
  } | null>(null)

  function sec(column: string, index: number | null, currentUrl: string, mode: "replace" | "add") {
    setHedef({ column, index, currentUrl, mode })
    // input değerini sıfırla ki aynı dosya tekrar seçilebilsin
    if (input.current) input.current.value = ""
    input.current?.click()
  }

  /** ★ Dosya doğrudan Storage'a; sunucudan geçmiyor. */
  async function yukle(file: File) {
    if (!hedef) return
    setBusy(true); setErr(null); setOk(null); setYuzde(0)

    // Eski dosya hangi bucket/klasördeyse yenisi de oraya
    let bucket = "media"
    let klasor = `${kind}/${row.id}`
    try {
      if (hedef.currentUrl) {
        const u = new URL(hedef.currentUrl)
        const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/)
        if (m) {
          bucket = decodeURIComponent(m[1])
          klasor = decodeURIComponent(m[2]).split("/").slice(0, -1).join("/")
        }
      }
    } catch { /* varsayılanlar kalsın */ }

    const gecerliBucket = ["galeri", "reklam", "media"].includes(bucket) ? bucket : "media"

    const imza = await createSignedUploadAction({
      bucket: gecerliBucket,
      klasor,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    })

    if (!imza.ok && imza.error && !imza.error.includes("adres")) {
      setBusy(false); setYuzde(null); setHedef(null)
      setErr(imza.error)
      return
    }

    const sonuc = await akilliYukle(
      { bucket: gecerliBucket, klasor, file, imza: imza.ok ? imza : null },
      (p) => setYuzde(p.yuzde)
    )

    if (!sonuc.ok) {
      setBusy(false); setYuzde(null); setHedef(null)
      setErr(sonuc.error ?? "Yüklenemedi.")
      return
    }

    const r = await attachContentMediaAction({
      kind,
      id: String(row.id),
      column: hedef.column,
      index: hedef.index,
      url: sonuc.publicUrl!,
      mode: hedef.mode,
    })

    setBusy(false); setYuzde(null); setHedef(null)
    if (!r.ok) { setErr(r.error ?? "Kayıt güncellenemedi."); return }
    setOk(r.message ?? "Tamam.")
    router.refresh()
  }

  async function kaldir() {
    if (!sil) return
    setBusy(true); setErr(null)
    const r = await removeContentMediaAction({
      kind, id: String(row.id), column: sil.column, index: sil.index,
    })
    setBusy(false); setSil(null)
    if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }
    setOk("Medya kaldırıldı.")
    router.refresh()
  }

  if (columns.length === 0) {
    return <p className="text-[12.5px] text-faint">Bu içerik tipinde medya alanı yok.</p>
  }

  return (
    <div className="space-y-4">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <input
        ref={input}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void yukle(f)
        }}
      />

      {columns.map((c) => {
        const deger = row[c.kolon]

        /* ── DİZİ KOLON: tüm elemanları göster ── */
        if (c.dizi) {
          const liste = Array.isArray(deger) ? (deger as unknown[]) : []
          return (
            <div key={c.kolon}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[12.5px] font-medium text-text">{alanAdi(c.kolon)}</span>
                <Badge tone="neutral">{liste.length} medya</Badge>
                <Button
                  variant="secondary"
                  size="sm"
                  className="ml-auto"
                  disabled={busy}
                  onClick={() => sec(c.kolon, null, "", "add")}
                >
                  Ekle
                </Button>
              </div>

              {liste.length === 0 ? (
                <p className="rounded-xl border border-dashed border-hairline px-4 py-6 text-center text-[12px] text-faint">
                  Medya yok
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {liste.map((u, i) => (
                    <MedyaKare
                      key={`${c.kolon}-${i}`}
                      url={typeof u === "string" ? u : null}
                      etiket={`${i + 1}`}
                      busy={busy}
                      onDegistir={() => sec(c.kolon, i, String(u ?? ""), "replace")}
                      onSil={() => setSil({ column: c.kolon, index: i })}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        }

        /* ── TEK DEĞER ── */
        const url = typeof deger === "string" && deger ? deger : null
        return (
          <div key={c.kolon}>
            <div className="mb-2 text-[12.5px] font-medium text-text">{alanAdi(c.kolon)}</div>
            <div className="max-w-[380px]">
              <MedyaKare
                url={url}
                busy={busy}
                onDegistir={() => sec(c.kolon, null, url ?? "", "replace")}
                onSil={url ? () => setSil({ column: c.kolon, index: null }) : undefined}
              />
            </div>
          </div>
        )
      })}

      {busy && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-[12.5px] text-muted">
            <Spinner /> Yükleniyor{yuzde !== null ? ` %${yuzde}` : "…"}
          </div>
          {yuzde !== null && (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-accent transition-all duration-200"
                style={{ width: `${yuzde}%` }}
              />
            </div>
          )}
        </div>
      )}

      <Modal
        open={!!sil}
        onClose={() => setSil(null)}
        title="Medyayı kaldır"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSil(null)} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={kaldir} disabled={busy}>
              {busy && <Spinner />} Kaldır
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          Medya içerikten kaldırılacak ve dosya depodan silinecek.
        </p>
      </Modal>
    </div>
  )
}
