// src/components/ProfileMedia.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// PROFİL MEDYASI — arka plan + avatar
//
// ┌─ DÜZEN ───────────────────────────────────────────────────────────┐
// │ Uygulamadaki gibi: arka plan görseli üstte geniş bant, avatar onun  │
// │ üstüne binen daire. Böylece panelde gördüğün şey kullanıcının       │
// │ telefonda gördüğüyle aynı hizada.                                 │
// └───────────────────────────────────────────────────────────────────┘
//
// ★ Tam ekran önizleme: görsele tıkla → arka plan bulanıklaşır, görsel
//   ortada. Kapatmak için çarpı, ESC ya da boşluğa tıklama.
//
// ★ Silme GERÇEK silme: dosya Storage'dan da kaldırılıyor (sunucu tarafı).
//   Onay istemesi bilinçli — geri alınamaz.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { uploadProfileMediaAction, deleteProfileMediaAction } from "@/actions/media.actions"
import { Button, ErrorBox, Modal, Spinner, SuccessBox } from "@/components/ui"
import { cn } from "@/lib/utils"

/* ═══════════════ TAM EKRAN ÖNİZLEME ═══════════════ */

export function Lightbox({
  url, alt, onClose,
}: {
  url: string
  alt: string
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-xl"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Kapat"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="animate-fade-up max-h-[85vh] max-w-[92vw] rounded-2xl object-contain shadow-pop"
      />

      <p className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[12px] text-white/60">
        Kapatmak için boşluğa tıkla ya da ESC
      </p>
    </div>
  )
}

/* ═══════════════ MEDYA BÖLÜMÜ ═══════════════ */

export function ProfileMedia({
  userId, avatarUrl, backgroundUrl, username, name, hasBackgroundColumn,
}: {
  userId: string
  avatarUrl: string | null
  backgroundUrl: string | null
  username: string | null
  name: string | null
  hasBackgroundColumn: boolean
}) {
  const router = useRouter()
  const avatarInput = useRef<HTMLInputElement>(null)
  const bgInput = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState<null | "avatar" | "background">(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<null | "avatar" | "background">(null)

  async function upload(field: "avatar" | "background", file: File) {
    setBusy(field); setErr(null); setOk(null)
    const fd = new FormData()
    fd.set("userId", userId)
    fd.set("field", field)
    fd.set("file", file)
    const r = await uploadProfileMediaAction(fd)
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Yüklenemedi."); return }
    setOk(r.message ?? "Yüklendi.")
    router.refresh()
  }

  async function remove(field: "avatar" | "background") {
    setBusy(field); setErr(null); setOk(null)
    const r = await deleteProfileMediaAction({ userId, field })
    setBusy(null)
    setConfirmDelete(null)
    if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }
    setOk(r.message ?? "Silindi.")
    router.refresh()
  }

  const initial = (name ?? username ?? "?").trim().charAt(0).toLocaleUpperCase("tr") || "?"

  return (
    <div className="space-y-3">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
        {/* ── ARKA PLAN ── */}
        <div className="relative h-[130px] w-full sm:h-[170px]">
          {backgroundUrl ? (
            <button
              type="button"
              onClick={() => setLightbox({ url: backgroundUrl, alt: "Arka plan görseli" })}
              className="group block h-full w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={backgroundUrl} alt="Arka plan" className="h-full w-full object-cover" />
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white/0 transition-all group-hover:bg-black/25 group-hover:text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
                  <path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
                </svg>
              </span>
            </button>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-raised">
              <span className="text-[12.5px] text-faint">
                {hasBackgroundColumn ? "Arka plan görseli yok" : "Arka plan kolonu bulunamadı"}
              </span>
            </div>
          )}

          {/* Arka plan işlemleri */}
          <div className="absolute right-3 top-3 flex gap-2">
            <input
              ref={bgInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void upload("background", f)
                e.target.value = ""
              }}
            />
            <button
              type="button"
              disabled={!hasBackgroundColumn || busy === "background"}
              onClick={() => bgInput.current?.click()}
              className="rounded-lg bg-black/55 px-2.5 py-1.5 text-[12px] font-medium text-white backdrop-blur transition-colors hover:bg-black/70 disabled:opacity-40"
            >
              {busy === "background" ? "Yükleniyor…" : backgroundUrl ? "Değiştir" : "Yükle"}
            </button>
            {backgroundUrl && (
              <button
                type="button"
                disabled={busy === "background"}
                onClick={() => setConfirmDelete("background")}
                className="rounded-lg bg-black/55 px-2.5 py-1.5 text-[12px] font-medium text-[#ff6b6b] backdrop-blur transition-colors hover:bg-black/70"
              >
                Sil
              </button>
            )}
          </div>
        </div>

        {/* ── AVATAR + İŞLEMLER ── */}
        <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5">
          <div className="-mt-10 flex items-end gap-3">
            <div className="relative">
              {avatarUrl ? (
                <button
                  type="button"
                  onClick={() => setLightbox({ url: avatarUrl, alt: "Profil fotoğrafı" })}
                  className="group block"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarUrl}
                    alt="Profil fotoğrafı"
                    className="h-[84px] w-[84px] rounded-full border-4 border-surface object-cover shadow-card"
                  />
                  <span className="absolute inset-0 flex items-center justify-center rounded-full text-white/0 transition-all group-hover:bg-black/30 group-hover:text-white">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                      <path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
                    </svg>
                  </span>
                </button>
              ) : (
                <div className="flex h-[84px] w-[84px] items-center justify-center rounded-full border-4 border-surface bg-raised text-[28px] font-bold text-muted shadow-card">
                  {initial}
                </div>
              )}
            </div>

            <div className="pb-1">
              <div className="text-[15px] font-semibold text-text">
                {name ?? username ?? "İsimsiz"}
              </div>
              <div className="text-[12.5px] text-muted">
                {username ? `@${username}` : "Kullanıcı adı yok"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={avatarInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void upload("avatar", f)
                e.target.value = ""
              }}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={busy === "avatar"}
              onClick={() => avatarInput.current?.click()}
            >
              {busy === "avatar" && <Spinner />}
              {avatarUrl ? "Fotoğrafı değiştir" : "Fotoğraf yükle"}
            </Button>
            {avatarUrl && (
              <Button
                variant="danger"
                size="sm"
                disabled={busy === "avatar"}
                onClick={() => setConfirmDelete("avatar")}
              >
                Fotoğrafı sil
              </Button>
            )}
          </div>
        </div>
      </div>


      {/* ── Tam ekran önizleme ── */}
      {lightbox && (
        <Lightbox url={lightbox.url} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}

      {/* ── Silme onayı ── */}
      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete === "avatar" ? "Profil fotoğrafını sil" : "Arka plan görselini sil"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)} disabled={busy !== null}>
              Vazgeç
            </Button>
            <Button
              variant="danger"
              onClick={() => confirmDelete && remove(confirmDelete)}
              disabled={busy !== null}
            >
              {busy !== null && <Spinner />} Sil
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {confirmDelete === "avatar" && avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="" className="mx-auto h-24 w-24 rounded-full object-cover" />
          )}
          {confirmDelete === "background" && backgroundUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={backgroundUrl} alt="" className="h-28 w-full rounded-xl object-cover" />
          )}
          <p className="text-[13px] text-muted">
            Görsel profilden kaldırılır ve dosya depodan silinir.
          </p>
        </div>
      </Modal>
    </div>
  )
}
