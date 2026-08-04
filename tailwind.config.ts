import type { Config } from "tailwindcss"

// ═══════════════════════════════════════════════════════════════════════
// V3.1 — Renkler CSS değişkeni, tipografi Apple sistem yazı tipi
//
// `rgb(var(--x) / <alpha-value>)` biçimi sayesinde `bg-accent/15`,
// `border-white/10` gibi şeffaflık kısayolları çalışmaya devam ediyor.
//
// ★ `primary` = buton rengi (karanlıkta beyaz, açıkta siyah)
//   `accent`  = #A0E970 vurgu (seçim, sayaç, grafik) — buton değil
// ═══════════════════════════════════════════════════════════════════════

const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg:        v("--c-bg"),
        surface:   v("--c-surface"),
        raised:    v("--c-raised"),
        border:    v("--c-border"),
        hairline:  v("--c-hairline"),
        text:      v("--c-text"),
        muted:     v("--c-muted"),
        faint:     v("--c-faint"),
        accent:    v("--c-accent"),
        accentD:   v("--c-accentD"),
        primary:   v("--c-primary"),
        onPrimary: v("--c-on-primary"),
        info:      v("--c-info"),
        warn:      v("--c-warn"),
        danger:    v("--c-danger"),
        promo:     v("--c-promo"),
        white:     v("--c-white"),
        onAccent:  v("--c-on-accent"),
      },
      fontFamily: {
        // Apple cihazlarda SF Pro, diğerlerinde en yakın karşılığı
        sans: [
          "-apple-system", "BlinkMacSystemFont", "SF Pro Text", "SF Pro Display",
          "Inter", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif",
        ],
        mono: ["ui-monospace", "SF Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.375rem",
      },
      boxShadow: {
        card: "0 0.5px 0 0 rgb(255 255 255 / 0.04) inset, 0 1px 3px rgb(0 0 0 / var(--shadow-strength))",
        pop:  "0 24px 64px -16px rgb(0 0 0 / calc(var(--shadow-strength) * 1.4))",
        btn:  "0 1px 2px rgb(0 0 0 / calc(var(--shadow-strength) * 0.5))",
      },
      maxWidth: {
        // ★ Ayar/form bölümleri tüm genişliği kaplamasın
        form: "44rem",
        prose: "38rem",
      },
    },
  },
  plugins: [],
}
export default config
