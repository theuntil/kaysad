"use client"

// src/components/MediaPicker.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// MEDYA SEÇİCİ
//
// ★ `window.prompt("Görsel adresi:")` yerine geçiyor. Tarayıcının kendi
//   kutusu hem tema dışı görünüyordu hem de kullanıcıdan URL yazmasını
//   istiyordu — panelde zaten bir medya kütüphanesi varken.
//
// ★ İki yol: kütüphaneden seç ya da buradan yükle. Yüklenen dosya
//   kütüphaneye de giriyor, bir daha aranmıyor.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchMedia, type MediaItem } from "@/actions/library.actions"
import { createSignedUploadAction } from "@/actions/upload.actions"
import { akilliYukle } from "@/lib/upload"
import { panelGorsel } from "@/lib/storage-url"
import {
  Button, EmptyState, ErrorBox, Input, Modal, Spinner,
} from "@/components/ui"

export function MediaPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  /** Seçilen görselin genel adresi */
  onSelect: (url: string) => void
}) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(false)
  const [yukleniyor, setYukleniyor] = useState(false)
  const [q, setQ] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const dosyaRef = useRef<HTMLInputElement>(null)

  const yukle = useCallback(async (arama: string) => {
    setLoading(true)
    setErr(null)
    const r = await fetchMedia({ query: arama || null, limit: 60 })
    setLoading(false)
    if (r.error) { setErr(r.error); return }
    // ★ Sadece görseller — mail gövdesine PDF gömülmez
    setItems(r.items.filter((i) => (i.mime_type ?? "").startsWith("image/")))
  }, [])

  useEffect(() => {
    if (open) void yukle("")
  }, [open, yukle])

  /* ── Buradan yükle ── */
  const dosyaSec = useCallback(async (f: File) => {
    setYukleniyor(true)
    setErr(null)

    try {
      const imza = await createSignedUploadAction({
        bucket: "media",
        klasor: "mail",
        fileName: f.name,
        mimeType: f.type || "application/octet-stream",
        sizeBytes: f.size,
      })

      if (!imza.ok && imza.error && !imza.error.includes("adres")) {
        setErr(imza.error)
        return
      }

      const r = await akilliYukle({
        bucket: "media",
        klasor: "mail",
        file: f,
        imza: imza.ok ? imza : null,
      })

      if (!r.ok || !r.publicUrl) {
        setErr(r.error ?? "Yüklenemedi.")
        return
      }

      // ★ Yükledikten sonra doğrudan seçiliyor — ikinci tıklama
      //   gereksiz, kullanıcı zaten bu dosyayı istiyor
      onSelect(r.publicUrl)
      onClose()
    } finally {
      setYukleniyor(false)
    }
  }, [onSelect, onClose])

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Görsel seç"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button
            onClick={() => dosyaRef.current?.click()}
            disabled={yukleniyor}
          >
            {yukleniyor && <Spinner />} Yeni yükle
          </Button>
        </>
      }
    >
      <input
        ref={dosyaRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ""
          if (f) void dosyaSec(f)
        }}
      />

      {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}

      <div className="mb-4 flex gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void yukle(q) }}
          placeholder="Dosya adı ya da etikette ara"
        />
        <Button variant="secondary" onClick={() => void yukle(q)}>Ara</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-muted">
          <Spinner /> Yükleniyor…
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Görsel bulunamadı" />
      ) : (
        <div className="grid max-h-[420px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-4">
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onSelect(m.url); onClose() }}
              title={m.file_name}
              className="group overflow-hidden rounded-xl border border-hairline bg-raised transition hover:border-accent/50"
            >
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={panelGorsel(m.url) ?? m.url}
                  alt=""
                  className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                />
              </div>
              <div className="truncate px-2 py-1.5 text-left text-[11px] text-muted">
                {m.file_name}
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

/* ═════════════════════════════════════════════════════════════════════
   BAĞLANTI GİRİŞİ
   ★ `window.prompt` yerine — tema uyumlu, doğrulamalı, iki alanlı.
   ═══════════════════════════════════════════════════════════════════ */

export function LinkPicker({
  open,
  onClose,
  onSubmit,
  baslik = "Bağlantı ekle",
  metinIster = true,
  varsayilanMetin = "",
}: {
  open: boolean
  onClose: () => void
  onSubmit: (url: string, metin: string) => void
  baslik?: string
  /** false ise sadece adres soruluyor (görsel bağlantısı gibi) */
  metinIster?: boolean
  varsayilanMetin?: string
}) {
  const [url, setUrl] = useState("")
  const [metin, setMetin] = useState(varsayilanMetin)

  useEffect(() => {
    if (open) { setUrl(""); setMetin(varsayilanMetin) }
  }, [open, varsayilanMetin])

  const gecerli = /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i.test(url.trim())
  const hata = url.trim().length > 0 && !gecerli

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={baslik}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Vazgeç</Button>
          <Button
            disabled={!gecerli || (metinIster && !metin.trim())}
            onClick={() => { onSubmit(url.trim(), metin.trim()); onClose() }}
          >
            Ekle
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {metinIster && (
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-text">Görünen yazı</div>
            <Input
              value={metin}
              onChange={(e) => setMetin(e.target.value)}
              placeholder="Örnek: Kampanyayı gör"
              autoFocus
            />
          </div>
        )}

        <div>
          <div className="mb-1.5 text-[13px] font-medium text-text">Adres</div>
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://kays.business/…"
            spellCheck={false}
            autoComplete="off"
            autoFocus={!metinIster}
          />
          {hata && (
            <span className="mt-1.5 block text-[12px] text-danger">
              Adres https:// ile başlamalı
            </span>
          )}
        </div>
      </div>
    </Modal>
  )
}
