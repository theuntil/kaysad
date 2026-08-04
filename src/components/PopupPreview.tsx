// src/components/PopupPreview.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// CANLI ÖNİZLEME
//
// Mobil uygulamadaki `PopupModal.tsx`'in görsel taklidi. Renkler, boyutlar
// ve düzen oradaki değerlerle EŞLEŞTİRİLDİ — böylece panelde gördüğün ile
// telefonda çıkan aynı oluyor.
//
// ★ Push önizlemesiyle AYNI telefon çerçevesi kullanılıyor (PhoneFrame).
//   Popup uygulamanın içinde açılıyor: arkada uygulama ekranı, üstünde
//   karartma, ortada popup.
//
// ★ Görsel popup'ın TAMAMINI kaplıyor; başlık, açıklama ve butonlar
//   görselin ÜZERİNDE duruyor. Görsel yoksa koyu zemine düşüyor.
// ═══════════════════════════════════════════════════════════════════════

import { PhoneFrame } from "@/components/PhoneFrame"
import type { PopupActionType, PopupVariant } from "@/lib/types"

/** Mobil PopupModal'daki `variantConfig` ile aynı değerler (dark mode) */
function variantConfig(variant: PopupVariant) {
  switch (variant) {
    case "critical":
      return { accent: "#ff453a", soft: "rgba(255,69,58,0.16)", icon: "warning" }
    case "warning":
      return { accent: "#ff9f0a", soft: "rgba(255,159,10,0.16)", icon: "alert" }
    case "promo":
      return { accent: "#a855f7", soft: "rgba(168,85,247,0.16)", icon: "gift" }
    default:
      return { accent: "#0a84ff", soft: "rgba(10,132,255,0.16)", icon: "megaphone" }
  }
}

function VariantIcon({ kind, color }: { kind: string; color: string }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: "h-7 w-7",
  }
  if (kind === "warning") {
    return (
      <svg {...common}>
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        <path d="M12 9v4M12 17h.01" />
      </svg>
    )
  }
  if (kind === "alert") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v4M12 16h.01" />
      </svg>
    )
  }
  if (kind === "gift") {
    return (
      <svg {...common}>
        <rect x="3" y="8" width="18" height="13" rx="2" />
        <path d="M12 8v13M3 12h18" />
        <path d="M12 8S10 3 7.5 3a2.5 2.5 0 0 0 0 5M12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="m3 11 18-5v12L3 14v-3z" />
      <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  )
}

export function PopupPreview({
  title, description, imageUrl, logoUrl, popupKind, variant,
  actionType, actionLabel, dismissLabel, dismissible, showOptOut,
}: {
  title: string
  description: string
  imageUrl: string
  logoUrl?: string
  popupKind?: "system" | "ad"
  variant: PopupVariant
  actionType: PopupActionType
  actionLabel: string
  dismissLabel: string
  dismissible: boolean
  showOptOut: boolean
}) {
  const cfg = variantConfig(variant)

  const primaryLabel =
    actionType === "none"
      ? dismissLabel || "Anladım"
      : actionLabel || (actionType === "external" ? "Devam Et" : "Görüntüle")

  return (
    <PhoneFrame>
      <div className="relative h-full" style={{ background: "#0b0b0f" }}>
        {/* ── Arkadaki uygulama ekranı ── */}
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-2.5 border-b border-[rgba(255,255,255,0.1)] px-4 pb-2.5 pt-1">
            <div className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-[7px] bg-[#ffffff]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kays1.png" alt="" className="h-[76%] w-[76%] object-contain" />
            </div>
            <span className="text-[15px] font-semibold text-[rgba(255,255,255,0.9)]">Keşfet</span>
          </div>

          <div className="space-y-2.5 p-3 opacity-40">
            <div className="h-3 w-2/3 rounded bg-[rgba(255,255,255,0.25)]" />
            <div className="h-24 rounded-xl bg-[rgba(255,255,255,0.15)]" />
            <div className="h-3 w-1/2 rounded bg-[rgba(255,255,255,0.25)]" />
            <div className="h-20 rounded-xl bg-[rgba(255,255,255,0.15)]" />
          </div>

          <div className="mt-auto flex items-center justify-around border-t border-[rgba(255,255,255,0.1)] px-4 pb-7 pt-2.5 opacity-45">
            {["Ana", "Keşfet", "Ekle", "Bildirim", "Profil"].map((t) => (
              <span key={t} className="text-[9.5px] text-[rgba(255,255,255,0.5)]">{t}</span>
            ))}
          </div>
        </div>

        {/* ── Karartma ── */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-[2px]" />

        {/* ── POPUP ── */}
        <div className="absolute inset-0 flex items-center justify-center px-4">
          <div
            className="animate-fade-up relative w-full overflow-hidden rounded-[22px] border border-[rgba(255,255,255,0.1)] shadow-2xl"
            style={{ background: "#141418", minHeight: 300 }}
          >
            {/* ★ Görsel popup'ın TAMAMINI kaplar */}
            {imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                {/* Yazıların okunması için alttan yukarı koyulaşan katman */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(0,0,0,0.92) 22%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.25) 100%)",
                  }}
                />
              </>
            ) : (
              <div
                className="absolute inset-0"
                style={{ background: `linear-gradient(160deg, ${cfg.soft}, #141418 70%)` }}
              />
            )}

            {/* Kapatma */}
            {dismissible && (
              <button
                type="button"
                className="absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 backdrop-blur"
                aria-label="Kapat"
              >
                <span className="text-[14px] leading-none text-[#ffffff]">×</span>
              </button>
            )}

            {/* İçerik — görselin ÜZERİNDE */}
            <div className="relative z-[1] flex min-h-[300px] flex-col justify-end p-4">
              {!imageUrl && (
                <div
                  className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl"
                  style={{ background: cfg.soft }}
                >
                  <VariantIcon kind={cfg.icon} color={cfg.accent} />
                </div>
              )}

              {/* ★ Logo başlığın ÜSTÜNDE */}
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="mb-2 h-10 w-10 rounded-[10px] bg-[rgba(255,255,255,0.9)] object-contain p-1"
                />
              )}

              {popupKind === "ad" && (
                <span className="mb-1.5 inline-flex w-fit items-center rounded-md bg-[rgba(255,255,255,0.2)] px-1.5 py-[2px] text-[9px] font-bold uppercase tracking-wide text-[#ffffff]">
                  Reklam
                </span>
              )}

              <span
                className="mb-2 inline-flex w-fit items-center rounded-full px-2 py-[3px] text-[10px] font-bold uppercase tracking-wide"
                style={{ background: cfg.soft, color: cfg.accent }}
              >
                {variant === "critical" ? "Önemli"
                  : variant === "warning" ? "Uyarı"
                  : variant === "promo" ? "Kampanya" : "Duyuru"}
              </span>

              <p className="text-[17px] font-extrabold leading-tight tracking-tight text-[#ffffff]">
                {title || "Popup başlığı"}
              </p>

              {description && (
                <p className="mt-1.5 line-clamp-4 text-[12.5px] leading-relaxed text-[rgba(255,255,255,0.85)]">
                  {description}
                </p>
              )}

              <div className="mt-4 space-y-2">
                <div
                  className="flex h-[42px] items-center justify-center rounded-[14px] text-[13.5px] font-bold text-[#ffffff]"
                  style={{ background: cfg.accent }}
                >
                  {primaryLabel}
                </div>

                {actionType !== "none" && dismissible && (
                  <div className="flex h-[38px] items-center justify-center rounded-[14px] bg-[rgba(255,255,255,0.12)] text-[13px] font-semibold text-[rgba(255,255,255,0.9)]">
                    {dismissLabel || "Daha Sonra"}
                  </div>
                )}

                {showOptOut && (
                  <p className="pt-0.5 text-center text-[10.5px] text-[rgba(255,255,255,0.55)]">
                    Bir daha gösterme
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  )
}
