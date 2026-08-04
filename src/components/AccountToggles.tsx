"use client"

// ═══════════════════════════════════════════════════════════════════════
// HESAP AYARLARI — ikonlu kutular
//
// ★ Düz anahtar satırları yerine kare kutular: her ayar kendi ikonuyla,
//   açık/kapalı durumu renkten okunuyor. Kutuya tıklamak durumu
//   değiştiriyor.
//
// Ayarlar diğer kimlik alanlarıyla birlikte kaydediliyor — burada anlık
// yazma yok, "Kaydet" düğmesine kadar bekliyor.
// ═══════════════════════════════════════════════════════════════════════

import { cn } from "@/lib/utils"

export interface ToggleDef {
  key: string
  ad: string
  /** Açıkken gösterilecek durum metni */
  acikMetin: string
  /** Kapalıyken gösterilecek durum metni */
  kapaliMetin: string
  acikIkon: React.ReactNode
  kapaliIkon: React.ReactNode
  /** Açık durum olumlu mu (yeşil/vurgu) yoksa nötr mü */
  tone?: "accent" | "info" | "neutral"
}

export function AccountToggles({
  defs, values, onChange,
}: {
  defs: ToggleDef[]
  values: Record<string, boolean>
  onChange: (key: string, value: boolean) => void
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {defs.map((d) => {
        const acik = values[d.key] === true
        const tone = d.tone ?? "accent"

        const renk = acik
          ? tone === "info"
            ? "border-info/35 bg-info/[0.07]"
            : tone === "neutral"
              ? "border-white/20 bg-white/[0.05]"
              : "border-accent/35 bg-accent/[0.07]"
          : "border-hairline bg-raised hover:border-white/20"

        const ikonRenk = acik
          ? tone === "info"
            ? "bg-info/15 text-info"
            : tone === "neutral"
              ? "bg-white/[0.08] text-text"
              : "bg-accent/15 text-accent"
          : "bg-white/[0.06] text-faint"

        return (
          <button
            key={d.key}
            type="button"
            onClick={() => onChange(d.key, !acik)}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors",
              renk
            )}
          >
            <span
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                ikonRenk
              )}
            >
              {acik ? d.acikIkon : d.kapaliIkon}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium uppercase tracking-wider text-faint">
                {d.ad}
              </span>
              <span
                className={cn(
                  "mt-0.5 block truncate text-[13.5px] font-semibold",
                  acik ? "text-text" : "text-muted"
                )}
              >
                {acik ? d.acikMetin : d.kapaliMetin}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ═══════════════ İKONLAR ═══════════════ */

const sv = (d: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" className="h-[21px] w-[21px]">
    {d}
  </svg>
)

export const HESAP_AYARLARI: ToggleDef[] = [
  {
    key: "gizli",
    ad: "Görünürlük",
    acikMetin: "Gizli hesap",
    kapaliMetin: "Herkese açık",
    tone: "info",
    // Kapalı kilit
    acikIkon: sv(<><rect x="3" y="11" width="18" height="11" rx="2.5" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
    // Açık kilit
    kapaliIkon: sv(<><rect x="3" y="11" width="18" height="11" rx="2.5" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>),
  },
  {
    key: "verify",
    ad: "Rozet",
    acikMetin: "Doğrulanmış",
    kapaliMetin: "Rozet yok",
    tone: "accent",
    acikIkon: sv(<><path d="M12 2.5 14.4 8l6 .5-4.6 3.9 1.4 5.9L12 15.2 6.8 18.3l1.4-5.9L3.6 8.5l6-.5z" /><path d="m9.5 12 1.8 1.8 3.4-3.6" /></>),
    kapaliIkon: sv(<><path d="M12 2.5 14.4 8l6 .5-4.6 3.9 1.4 5.9L12 15.2 6.8 18.3l1.4-5.9L3.6 8.5l6-.5z" /></>),
  },
  {
    key: "isBusiness",
    ad: "Hesap türü",
    acikMetin: "İşletme",
    kapaliMetin: "Kullanıcı",
    tone: "info",
    // Mağaza
    acikIkon: sv(<><path d="M3 9.5 4.5 4h15L21 9.5" /><path d="M4 9.5V20h16V9.5" /><path d="M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0" /><path d="M9 20v-5h6v5" /></>),
    // Tek kişi
    kapaliIkon: sv(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  },
  {
    key: "isBoosted",
    ad: "Ayrıcalık",
    acikMetin: "Boostlu hesap",
    kapaliMetin: "Standart",
    tone: "accent",
    acikIkon: sv(<path d="m13 2-9 12h7l-1 8 9-12h-7z" />),
    kapaliIkon: sv(<><path d="m13 2-9 12h7l-1 8 9-12h-7z" /></>),
  },
  {
    key: "isStudent",
    ad: "Öğrenci",
    acikMetin: "Öğrenci",
    kapaliMetin: "Öğrenci değil",
    tone: "info",
    acikIkon: sv(<><path d="m22 10-10-5L2 10l10 5 10-5z" /><path d="M6 12v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5" /></>),
    kapaliIkon: sv(<path d="m22 10-10-5L2 10l10 5 10-5z" />),
  },
]
