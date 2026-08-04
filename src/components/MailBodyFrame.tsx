"use client"

// src/components/MailBodyFrame.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// GELEN MAİL GÖVDESİ — YALITILMIŞ GÖRÜNTÜLEYİCİ
//
// ┌─ SORUN ───────────────────────────────────────────────────────────┐
// │ `dangerouslySetInnerHTML` ile basılan mail HTML'i panele SIZIYOR:  │
// │                                                                    │
// │   · Mailin `<style>` bloğu tüm sayfayı etkiliyor                   │
// │     (`body { background: transparent }` gibi kurallar panelin      │
// │      arka planını şeffaflaştırıyordu)                              │
// │   · `* { }` seçicileri panelin kendi öğelerini eziyor              │
// │   · Yüksek özgüllüklü kurallar tema renklerini bozuyor             │
// │                                                                    │
// │ Pazarlama mailleri genelde tam bir HTML belgesi gönderiyor;        │
// │ sayfanın içine gömülünce iki belge çakışıyor.                      │
// └───────────────────────────────────────────────────────────────────┘
//
// ┌─ ÇÖZÜM: sandbox iframe ────────────────────────────────────────────┐
// │ Mail kendi belgesinde çiziliyor. Tarayıcı CSS'i orada hapsediyor;  │
// │ dışarı hiçbir kural sızamıyor.                                     │
// │                                                                    │
// │ `sandbox` özniteliği script çalıştırmayı, form göndermeyi ve       │
// │ üst pencereye erişimi engelliyor — mail içeriği güvenilmez.        │
// │                                                                    │
// │ `srcDoc` kullanılıyor: içerik ayrı bir isteğe çıkmıyor, uzak       │
// │ sunucuya "bu mail okundu" sinyali gitmiyor.                        │
// └───────────────────────────────────────────────────────────────────┘
//
// ★ Yükseklik otomatik: iframe yüklenince içerik yüksekliği ölçülüp
//   çerçeveye uygulanıyor. Kaydırma çubuğu çıkmıyor.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react"

/** Boş iframe'in başlangıç yüksekliği */
const BASLANGIC_YUKSEKLIK = 180
const MAX_YUKSEKLIK = 4000

export function MailBodyFrame({
  html,
  text,
  isDark,
  minYukseklik,
}: {
  html?: string | null
  text?: string | null
  /** Panel teması — mailin kendi rengi yoksa okunabilir olsun diye */
  isDark?: boolean
  /**
   * ★ Piksel cinsinden taban yükseklik.
   *
   *   Bunu sarmalayıcıya `min-height` vermek ÇÖZMÜYOR: iframe kendi
   *   ölçtüğü içerik yüksekliğini `style.height` ile dayatıyor ve
   *   sarmalayıcının içinde küçük kalıyordu. Taban buraya, iframe'in
   *   kendi yüksekliğine uygulanmalı.
   */
  minYukseklik?: number
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [yukseklik, setYukseklik] = useState(
    Math.max(minYukseklik ?? 0, BASLANGIC_YUKSEKLIK)
  )

  /* ── Belge gövdesi ──
     Mailin kendi HTML'i olduğu gibi korunuyor; sadece dışına minimal
     bir kabuk sarılıyor. Kabuk yazı tipini ve taşmayı düzeltiyor,
     mailin kendi stillerine karışmıyor. */
  const belge = html
    ? `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  /* Kabuk — mailin kendi stilleri bunu ezebilir, kasıtlı */
  html, body {
    margin: 0; padding: 0;
    background: transparent;
    color: ${isDark ? "#e8e8ea" : "#1a1a1c"};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13.5px; line-height: 1.6;
    -webkit-text-size-adjust: 100%;
  }
  /* Geniş tablolar ve görseller çerçeveyi taşırmasın */
  img, video, table { max-width: 100% !important; height: auto; }
  table { border-collapse: collapse; }
  pre, code { white-space: pre-wrap; word-break: break-word; }
  a { color: ${isDark ? "#7eb0f0" : "#3b72c4"}; }
  * { max-width: 100%; box-sizing: border-box; }
</style>
</head><body>${html}</body></html>`
    : `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<style>
  html, body {
    margin: 0; padding: 0; background: transparent;
    color: ${isDark ? "#e8e8ea" : "#1a1a1c"};
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13.5px; line-height: 1.6;
    white-space: pre-wrap; word-break: break-word;
  }
</style>
</head><body>${escapeHtml(text ?? "")}</body></html>`

  /* ── Yüksekliği içeriğe göre ayarla ── */
  const olc = useCallback(() => {
    const f = ref.current
    if (!f) return
    try {
      const b = f.contentDocument?.body
      const d = f.contentDocument?.documentElement
      if (!b || !d) return

      const h = Math.max(
        b.scrollHeight, b.offsetHeight,
        d.scrollHeight, d.offsetHeight
      )
      // ★ Taban uygulanıyor: içerik kısa olsa da çerçeve büzülmüyor
      if (h > 0) {
        setYukseklik(Math.min(Math.max(h + 8, minYukseklik ?? 0), MAX_YUKSEKLIK))
      }
    } catch {
      // Farklı köken hatası — srcDoc kullandığımız için normalde olmaz
    }
  }, [minYukseklik])

  useEffect(() => {
    // ★ Görseller geç yüklenince yükseklik değişiyor; birkaç kez ölçüyoruz
    const zamanlar = [80, 300, 900, 2000].map((ms) => setTimeout(olc, ms))
    return () => { zamanlar.forEach(clearTimeout) }
  }, [olc, belge])

  return (
    <iframe
      ref={ref}
      title="Mail içeriği"
      srcDoc={belge}
      onLoad={olc}
      /* ★ Script YOK, form YOK, üst pencereye erişim YOK.
         `allow-popups` sadece bağlantıların yeni sekmede açılması için. */
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      style={{ height: yukseklik }}
      className="w-full border-0 bg-transparent"
    />
  )
}

/** Düz metni HTML'e gömmeden önce kaçır */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
