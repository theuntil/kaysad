// src/components/ui/index.tsx
//
// V3 — Panelin temel UI parçaları.
//
// Harici bir bileşen kütüphanesi yerine bunları elle yazmak bilinçli bir
// tercih: bağımlılık yüzeyi küçük kalıyor, Docker imajı şişmiyor, her
// şeyin davranışı öngörülebilir.
//
// V3'te değişenler:
//   • Renkler CSS değişkeni → açık/karanlık tema otomatik çalışıyor
//   • `text-black` yerine `text-onAccent` (açık temada beyaz olur)
//   • Yeni parçalar: Segmented, Switch, Tabs, Modal, Section, Bar,
//     KeyValue, Avatar, IconButton, Chip, Skeleton, Toolbar
//   • Ayar/seçim ekranlarının okunabilirliği için `Field` ve `FieldRow`

"use client"

import { forwardRef, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

/* ═══════════════ CARD ═══════════════ */

export function Card({
  children, className, padded = true,
}: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={cn(
      "rounded-2xl border border-hairline bg-surface shadow-card",
      padded && "p-5",
      className
    )}>
      {children}
    </div>
  )
}

export function CardTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-[15px] font-semibold tracking-tight text-text">{children}</h2>
      {hint && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{hint}</p>}
    </div>
  )
}

/**
 * Sayfa içi bölüm başlığı. V3'te panelin "karışık" görünmesinin ana
 * sebebi buydu: her şey aynı görsel ağırlıktaydı. Bölümler artık
 * numaralanıp gruplanıyor — özellik sayısı aynı, kalabalık hissi yok.
 */
export function Section({
  step, title, hint, children, className, aside, wide = false,
}: {
  step?: number | string
  title: string
  hint?: string
  children: React.ReactNode
  className?: string
  aside?: React.ReactNode
  /** true = içerik tüm genişliği kullanır (tablo/liste için) */
  wide?: boolean
}) {
  return (
    <section className={cn("rounded-2xl border border-hairline bg-surface shadow-card", className)}>
      <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {step !== undefined && (
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg
                             bg-accent/15 text-[12px] font-bold text-accent">
              {step}
            </span>
          )}
          <div className="min-w-0">
            <h3 className="text-[14.5px] font-semibold tracking-tight text-text">{title}</h3>
            {hint && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{hint}</p>}
          </div>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {/* ★ Ayar ve form içerikleri tüm genişliği kaplamıyor: uzun satırlar
          okunmayı zorlaştırıyor ve arayüz dağınık görünüyor. */}
      <div className={cn("p-4 sm:p-5", !wide && "max-w-form")}>{children}</div>
    </section>
  )
}

/* ═══════════════ STAT ═══════════════ */

export function Stat({
  label, value, sub, tone = "default", href,
}: {
  label: string
  value: string | number
  sub?: string
  tone?: "default" | "accent" | "warn" | "danger" | "info" | "promo"
  href?: string
}) {
  const toneClass = {
    default: "text-text",
    accent:  "text-accent",
    warn:    "text-warn",
    danger:  "text-danger",
    info:    "text-info",
    promo:   "text-promo",
  }[tone]

  const body = (
    <div className={cn(
      "h-full rounded-2xl border border-hairline bg-surface p-4 shadow-card transition-colors",
      href && "hover:border-accent/40"
    )}>
      <div className="text-[11.5px] font-medium uppercase tracking-wider text-faint">{label}</div>
      <div className={cn("mt-2 text-2xl font-bold tabular-nums tracking-tight", toneClass)}>{value}</div>
      {sub && <div className="mt-1 text-[12px] text-muted">{sub}</div>}
    </div>
  )

  if (href) return <a href={href} className="block h-full">{body}</a>
  return body
}

/* ═══════════════ BADGE ═══════════════ */

const badgeTones = {
  live:      "bg-accent/15 text-accent border-accent/25",
  off:       "bg-white/[0.06] text-faint border-white/10",
  scheduled: "bg-info/15 text-info border-info/25",
  expired:   "bg-warn/15 text-warn border-warn/25",
  danger:    "bg-danger/15 text-danger border-danger/25",
  promo:     "bg-promo/15 text-promo border-promo/25",
  neutral:   "bg-white/[0.06] text-muted border-white/10",
} as const

export function Badge({
  children, tone = "neutral", className,
}: { children: React.ReactNode; tone?: keyof typeof badgeTones; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[11px] font-semibold whitespace-nowrap",
      badgeTones[tone],
      className
    )}>
      {children}
    </span>
  )
}

/* ═══════════════ BUTTON ═══════════════ */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "warn"

// ★ Birincil buton BEYAZ (karanlık temada) / SİYAH (açık temada).
//   #A0E970 yeşili butonlarda değil; seçim, sayaç ve veri
//   göstergelerinde kullanılıyor — arayüz "yeşil tema" gibi durmuyor.
const buttonVariants: Record<ButtonVariant, string> = {
  primary:   "bg-primary text-onPrimary font-semibold shadow-btn hover:opacity-90 active:scale-[0.98]",
  secondary: "bg-raised text-text border border-border hover:bg-white/[0.06] active:scale-[0.98]",
  ghost:     "text-muted hover:text-text hover:bg-white/[0.05] active:scale-[0.98]",
  danger:    "bg-danger/12 text-danger border border-danger/25 hover:bg-danger/18 active:scale-[0.98]",
  warn:      "bg-warn/12 text-warn border border-warn/25 hover:bg-warn/18 active:scale-[0.98]",
}

export function Button({
  children, variant = "primary", size = "md", className, type = "button", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  size?: "sm" | "md"
}) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl transition-all",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
        size === "sm" ? "h-9 px-3.5 text-[13px]" : "h-11 px-4 text-[14.5px]",
        buttonVariants[variant],
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({
  children, label, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg text-faint transition-colors",
        "hover:bg-white/[0.06] hover:text-text disabled:opacity-40",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ═══════════════ FORM ELEMENTS ═══════════════ */

export function Label({
  children, hint, required,
}: { children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div className="mb-1.5">
      <label className="text-[13px] font-medium text-text">
        {children}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {hint && <p className="mt-0.5 text-[11.5px] leading-relaxed text-faint">{hint}</p>}
    </div>
  )
}

/** Etiket + alan + yardım metnini tek yerde toplayan sarmalayıcı. */
export function Field({
  label, hint, required, children, className,
}: {
  label: string
  hint?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <Label hint={hint} required={required}>{label}</Label>
      {children}
    </div>
  )
}

const fieldBase =
  "w-full rounded-xl border border-border bg-raised px-3.5 text-[14px] text-text " +
  "placeholder:text-faint transition-colors " +
  "hover:border-white/20 focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/15 " +
  "disabled:opacity-50 disabled:cursor-not-allowed"

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(fieldBase, "h-11", className)} {...rest} />
  }
)

// ★ forwardRef: gönderim formu imleç konumuna değişken ({ad} gibi)
//   eklemek için textarea'ya erişmek zorunda.
export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(fieldBase, "min-h-[92px] resize-y py-3 leading-relaxed", className)}
        {...rest}
      />
    )
  }
)

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldBase, "h-11 cursor-pointer", className)} {...rest}>
      {children}
    </select>
  )
}

/* ═══════════════ TOGGLE / SWITCH ═══════════════ */

export function Toggle({
  name, defaultChecked, checked, onChange, label, hint, disabled,
}: {
  name?: string
  defaultChecked?: boolean
  checked?: boolean
  onChange?: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <label className={cn(
      "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-raised p-3.5 transition-colors",
      "hover:border-white/20 has-[:checked]:border-accent/40 has-[:checked]:bg-accent/[0.06]",
      disabled && "cursor-not-allowed opacity-50"
    )}>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        checked={checked}
        onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
        disabled={disabled}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
      />
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-text">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">{hint}</span>}
      </span>
    </label>
  )
}

/** Sağa yatık anahtar — ayar satırlarında (kutu görünümü olmadan). */
export function Switch({
  checked, onChange, label, hint, disabled, tone = "accent",
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
  tone?: "accent" | "danger" | "warn"
}) {
  const onBg = { accent: "bg-accent", danger: "bg-danger", warn: "bg-warn" }[tone]
  return (
    <div className={cn(
      "flex items-center justify-between gap-4 rounded-xl border border-border bg-raised px-4 py-3.5",
      disabled && "opacity-50"
    )}>
      <div className="min-w-0">
        <div className="text-[13.5px] font-medium text-text">{label}</div>
        {hint && <div className="mt-0.5 text-[11.5px] leading-relaxed text-faint">{hint}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? onBg : "bg-white/[0.14]",
          disabled && "cursor-not-allowed"
        )}
      >
        <span className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow-card transition-all",
          checked ? "left-[22px]" : "left-0.5"
        )} />
      </button>
    </div>
  )
}

/* ═══════════════ SEGMENTED (kanal / mod seçimi) ═══════════════ */

export function Segmented<T extends string>({
  value, onChange, options, className, size = "md",
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; hint?: string; icon?: React.ReactNode }[]
  className?: string
  size?: "sm" | "md"
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "grid gap-1 rounded-xl border border-border bg-raised p-1",
        options.length === 2 ? "grid-cols-2" : options.length === 3 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4",
        className
      )}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-lg text-center transition-colors",
              size === "sm" ? "px-2 py-1.5" : "px-3 py-2.5",
              active
                ? "bg-accent/15 text-accent ring-1 ring-inset ring-accent/30"
                : "text-muted hover:bg-white/[0.05] hover:text-text"
            )}
          >
            <span className="flex items-center justify-center gap-1.5 text-[13px] font-semibold">
              {o.icon}
              {o.label}
            </span>
            {o.hint && (
              <span className={cn("mt-0.5 block text-[11px] leading-tight", active ? "text-accent/80" : "text-faint")}>
                {o.hint}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ═══════════════ TABS (sayfa içi filtre sekmeleri) ═══════════════ */

export function Tabs<T extends string>({
  value, onChange, items, className,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: string; count?: number | null; tone?: "default" | "danger" | "warn" }[]
  className?: string
}) {
  return (
    <div className={cn("-mx-1 flex gap-1 overflow-x-auto px-1 pb-1", className)}>
      {items.map((it) => {
        const active = it.value === value
        const countTone =
          it.tone === "danger" ? "bg-danger/15 text-danger"
          : it.tone === "warn" ? "bg-warn/15 text-warn"
          : active ? "bg-accent/20 text-accent" : "bg-white/[0.08] text-muted"
        return (
          <button
            key={it.value}
            type="button"
            onClick={() => onChange(it.value)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors",
              active
                ? "border-accent/35 bg-accent/10 text-accent"
                : "border-border bg-surface text-muted hover:text-text"
            )}
          >
            {it.label}
            {it.count !== undefined && it.count !== null && (
              <span className={cn("rounded-full px-1.5 py-[1px] text-[11px] font-bold tabular-nums", countTone)}>
                {it.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ═══════════════ MODAL ═══════════════ */

export function Modal({
  open, onClose, title, hint, children, footer, width = "md",
}: {
  open: boolean
  onClose: () => void
  title: string
  hint?: string
  children: React.ReactNode
  footer?: React.ReactNode
  width?: "sm" | "md" | "lg"
}) {
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  const w = { sm: "max-w-[420px]", md: "max-w-[560px]", lg: "max-w-[760px]" }[width]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "animate-fade-up w-full overflow-hidden rounded-t-3xl border border-hairline bg-surface shadow-pop sm:rounded-3xl",
          w
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-tight text-text">{title}</h3>
            {hint && <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{hint}</p>}
          </div>
          <IconButton label="Kapat" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-[18px] w-[18px]">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </IconButton>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-raised/50 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══════════════ EMPTY / ERROR STATES ═══════════════ */

export function EmptyState({
  title, hint, action,
}: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface/50 px-6 py-14 text-center">
      <p className="text-[14.5px] font-medium text-muted">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-faint">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-danger/30 bg-danger/[0.08] px-4 py-3 text-[13px] leading-relaxed text-danger">
      {children}
    </div>
  )
}

export function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-3 text-[13px] leading-relaxed text-accent">
      {children}
    </div>
  )
}

export function WarnBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-warn/30 bg-warn/[0.08] px-4 py-3 text-[13px] leading-relaxed text-warn">
      {children}
    </div>
  )
}

export function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-info/30 bg-info/[0.08] px-4 py-3 text-[13px] leading-relaxed text-info">
      {children}
    </div>
  )
}

/* ═══════════════ TABLE ═══════════════ */

export function Table({ children, className, minWidth = 680 }: {
  children: React.ReactNode; className?: string; minWidth?: number
}) {
  return (
    <div className={cn("scroll-hint overflow-x-auto rounded-2xl border border-hairline bg-surface shadow-card", className)}>
      <table className="w-full border-collapse text-left" style={{ minWidth }}>{children}</table>
    </div>
  )
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn(
      "border-b border-border px-4 py-3 text-[11.5px] font-semibold uppercase tracking-wider text-faint",
      className
    )}>
      {children}
    </th>
  )
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={cn("border-b border-border/60 px-4 py-3 text-[13.5px] text-text", className)}>
      {children}
    </td>
  )
}

/* ═══════════════ KÜÇÜK YARDIMCILAR ═══════════════ */

/** Etiket–değer satırı. Kullanıcı detay sayfasında yoğun kullanılıyor. */
export function KeyValue({
  label, value, mono, tone,
}: {
  label: string
  value: React.ReactNode
  mono?: boolean
  tone?: "default" | "danger" | "warn" | "accent" | "faint"
}) {
  const toneClass = {
    default: "text-text", danger: "text-danger", warn: "text-warn",
    accent: "text-accent", faint: "text-faint",
  }[tone ?? "default"]

  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 py-2.5 last:border-0">
      <span className="shrink-0 text-[12.5px] text-muted">{label}</span>
      <span className={cn("min-w-0 break-words text-right text-[13px] font-medium", mono && "font-mono text-[12.5px]", toneClass)}>
        {value ?? "—"}
      </span>
    </div>
  )
}

/** Yatay oran çubuğu — şehir dağılımı ve tip dağılımında kullanılıyor. */
export function Bar({ pct, tone = "accent" }: { pct: number; tone?: "accent" | "info" | "promo" | "warn" }) {
  const c = { accent: "bg-accent/60", info: "bg-info/60", promo: "bg-promo/70", warn: "bg-warn/60" }[tone]
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
      <div className={cn("h-full rounded-full", c)} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} />
    </div>
  )
}

export function Avatar({ url, name, size = 36 }: { url?: string | null; name?: string | null; size?: number }) {
  const initial = (name ?? "?").trim().charAt(0).toLocaleUpperCase("tr") || "?"
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={name ?? "avatar"}
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-border object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full border border-border bg-raised font-bold text-muted"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initial}
    </div>
  )
}

export function Chip({
  children, onRemove, tone = "neutral",
}: { children: React.ReactNode; onRemove?: () => void; tone?: "neutral" | "accent" }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] font-medium",
      tone === "accent" ? "border-accent/30 bg-accent/10 text-accent" : "border-border bg-raised text-muted"
    )}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Kaldır" className="opacity-60 hover:opacity-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-3 w-3">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse-soft rounded-xl bg-white/[0.06]", className)} />
}

export function Toolbar({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>{children}</div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-4 w-4 animate-spin", className)} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
