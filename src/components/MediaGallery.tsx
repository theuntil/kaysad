// src/components/MediaGallery.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// MEDYA GALERİSİ
//
// Yükle · gör · URL kopyala · sil. Dosya adları otomatik benzersizleşiyor
// (<ad>-<tarih>-<6 karakter>), aynı adı iki kez yüklesen çakışma olmuyor.
// ═══════════════════════════════════════════════════════════════════════

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { deleteMediaAction, type MediaItem } from "@/actions/library.actions"
import { createSignedUploadAction, registerMediaAction } from "@/actions/upload.actions"
import { akilliYukle } from "@/lib/upload"
import {
  Badge, Button, EmptyState, ErrorBox, Field, Input, Modal, Spinner,
  SuccessBox, Textarea,
} from "@/components/ui"
import { fmtBytes } from "@/lib/format"
import { fmtDate, timeAgo } from "@/lib/utils"

function isImage(m: string | null) { return !!m && m.startsWith("image/") }
function isVideo(m: string | null) { return !!m && m.startsWith("video/") }

export function MediaGallery({ items }: { items: MediaItem[] }) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [acik, setAcik] = useState<MediaItem | null>(null)
  const [sil, setSil] = useState<MediaItem | null>(null)
  const [yukle, setYukle] = useState(false)
  const [dosya, setDosya] = useState<File | null>(null)
  const [kopyalandi, setKopyalandi] = useState(false)
  const [yuzde, setYuzde] = useState<number | null>(null)

  /**
   * ★ Dosya SUNUCUDAN GEÇMİYOR: önce imzalı URL alınıyor, tarayıcı
   *   doğrudan Supabase'e yüklüyor, sonra sadece üst veri kaydediliyor.
   *   Server Action gövde sınırı (1 MB) böylece devre dışı kalıyor.
   */
  async function gonder() {
    if (!dosya) return
    setBusy(true); setErr(null); setOk(null); setYuzde(0)

    const d = new Date()
    const klasor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

    // İmzalı URL al (başarısız olursa akilliYukle sunucu yoluna düşer)
    const imza = await createSignedUploadAction({
      bucket: "galeri",
      klasor,
      fileName: dosya.name,
      mimeType: dosya.type || "application/octet-stream",
      sizeBytes: dosya.size,
    })

    if (!imza.ok && imza.error && !imza.error.includes("adres")) {
      // Boyut/yetki hatası — sunucu yolu da çözmez
      setBusy(false); setYuzde(null)
      setErr(imza.error)
      return
    }

    const sonuc = await akilliYukle(
      { bucket: "galeri", klasor, file: dosya, imza: imza.ok ? imza : null },
      (p) => setYuzde(p.yuzde)
    )

    if (!sonuc.ok) {
      setBusy(false); setYuzde(null)
      setErr(sonuc.error ?? "Yüklenemedi.")
      return
    }

    const kayit = await registerMediaAction({
      bucket: sonuc.bucket ?? "galeri",
      path: sonuc.path!,
      url: sonuc.publicUrl!,
      fileName: dosya.name,
      mimeType: dosya.type || "application/octet-stream",
      sizeBytes: dosya.size,
    })

    setBusy(false); setYuzde(null)
    if (!kayit.ok) { setErr(kayit.error ?? "Kayıt oluşturulamadı."); return }

    setYukle(false); setDosya(null)
    setOk("Dosya yüklendi.")
    router.refresh()
  }

  async function kaldir() {
    if (!sil) return
    setBusy(true); setErr(null)
    const r = await deleteMediaAction(sil.id)
    setBusy(false); setSil(null); setAcik(null)
    if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }
    setOk("Dosya silindi.")
    router.refresh()
  }

  async function kopyala(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setKopyalandi(true)
      setTimeout(() => setKopyalandi(false), 1800)
    } catch {
      setErr("Panoya kopyalanamadı.")
    }
  }

  return (
    <div className="space-y-4">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <div className="flex justify-end">
        <Button onClick={() => setYukle(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-4 w-4">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Dosya yükle
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState title="Medya yok" />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setAcik(m)}
              className="group overflow-hidden rounded-xl border border-hairline bg-surface text-left shadow-card transition-colors hover:border-accent/40"
            >
              <div className="relative aspect-square bg-raised">
                {isImage(m.mime_type) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : isVideo(m.mime_type) ? (
                  <>
                    <video src={m.url} className="h-full w-full object-cover" preload="metadata" muted />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55">
                        <svg viewBox="0 0 24 24" fill="#fff" className="ml-0.5 h-4 w-4">
                          <path d="M6 4l14 8-14 8z" />
                        </svg>
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] text-faint">
                    {m.mime_type ?? "dosya"}
                  </span>
                )}
              </div>
              <div className="p-2.5">
                <div className="truncate text-[12px] font-medium text-text">{m.file_name}</div>
                <div className="truncate text-[10.5px] text-faint">
                  {fmtBytes(m.size_bytes ?? 0)} · {timeAgo(m.created_at)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── ÖNİZLEME ── */}
      <Modal
        open={!!acik}
        onClose={() => setAcik(null)}
        width="lg"
        title={acik?.file_name ?? ""}
        footer={
          acik ? (
            <>
              <Button variant="danger" onClick={() => setSil(acik)} disabled={busy}>Sil</Button>
              <Button variant="secondary" onClick={() => kopyala(acik.url)}>
                {kopyalandi ? "Kopyalandı" : "URL kopyala"}
              </Button>
            </>
          ) : null
        }
      >
        {acik && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-xl border border-hairline bg-raised">
              {isImage(acik.mime_type) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={acik.url} alt="" className="max-h-[380px] w-full object-contain" />
              ) : isVideo(acik.mime_type) ? (
                <video src={acik.url} controls className="max-h-[380px] w-full" />
              ) : (
                <div className="py-12 text-center text-[13px] text-faint">Önizleme yok</div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["Dosya adı", acik.file_name],
                ["Klasör", acik.klasor ?? "genel"],
                ["Tür", acik.mime_type ?? "—"],
                ["Boyut", fmtBytes(acik.size_bytes ?? 0)],
                ["Bucket", acik.bucket],
                ["Yükleyen", acik.uploaded_by ?? "—"],
                ["Tarih", fmtDate(acik.created_at)],
              ].map(([l, v]) => (
                <div key={l} className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
                  <div className="text-[10.5px] uppercase tracking-wider text-faint">{l}</div>
                  <div className="truncate text-[12.5px] text-text">{v}</div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
              <div className="mb-1 text-[10.5px] uppercase tracking-wider text-faint">Dosya yolu</div>
              <code className="block break-all font-mono text-[11.5px] text-text">{acik.path}</code>
            </div>

            <div className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
              <div className="mb-1 text-[10.5px] uppercase tracking-wider text-faint">URL</div>
              <code className="block break-all font-mono text-[11.5px] text-info">{acik.url}</code>
            </div>

            {acik.aciklama && (
              <p className="text-[13px] text-muted">{acik.aciklama}</p>
            )}
            {acik.etiketler?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {acik.etiketler.map((e) => <Badge key={e} tone="neutral">{e}</Badge>)}
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      {/* ── YÜKLEME ── */}
      <Modal
        open={yukle}
        onClose={() => setYukle(false)}
        title="Dosya yükle"
        footer={
          <>
            <Button variant="ghost" onClick={() => setYukle(false)} disabled={busy}>Vazgeç</Button>
            <Button onClick={gonder} disabled={busy || !dosya}>
              {busy && <Spinner />} Yükle
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <input
            ref={input}
            type="file"
            className="hidden"
            onChange={(e) => setDosya(e.target.files?.[0] ?? null)}
          />

          <button
            type="button"
            onClick={() => input.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-hairline bg-raised px-4 py-8 transition-colors hover:border-accent/40"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-faint">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5-5 5 5" /><path d="M12 5v12" />
            </svg>
            <span className="text-[13px] text-muted">
              {dosya ? dosya.name : "Dosya seç"}
            </span>
            {dosya && (
              <span className="text-[11.5px] text-faint">{fmtBytes(dosya.size)}</span>
            )}
          </button>

          {yuzde !== null && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[12px]">
                <span className="text-muted">Yükleniyor</span>
                <span className="font-semibold tabular-nums text-accent">%{yuzde}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-200"
                  style={{ width: `${yuzde}%` }}
                />
              </div>
            </div>
          )}

        </div>
      </Modal>

      {/* ── SİLME ── */}
      <Modal
        open={!!sil}
        onClose={() => setSil(null)}
        title="Dosyayı sil"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSil(null)} disabled={busy}>Vazgeç</Button>
            <Button variant="danger" onClick={kaldir} disabled={busy}>
              {busy && <Spinner />} Sil
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          <code className="font-mono text-[12px]">{sil?.path}</code> hem kütüphaneden hem
          depodan silinecek. Bu dosyayı kullanan yerlerde görsel kırılır.
        </p>
      </Modal>
    </div>
  )
}
