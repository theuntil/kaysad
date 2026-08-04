// src/components/PageHeader.tsx
//
// ★ "Geri" bağlantısı başlığın SOL ÜSTÜNDE — sağdaki işlem düğmeleriyle
//   karışmasın. Geri gitmek bir "işlem" değil, gezinme; ayrı yerde durmalı.

import Link from "next/link"

export function PageHeader({
  title, description, action, back,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  /** Sol üstteki geri bağlantısı */
  back?: { href: string; label: string }
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-2.5 inline-flex items-center gap-1.5 text-[13px] text-muted transition-colors hover:text-text"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="m15 18-6-6 6-6" />
          </svg>
          {back.label}
        </Link>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[21px] font-bold tracking-tight text-text sm:text-[24px]">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
