// src/components/MailSync.tsx
"use client"

// IMAP'ten yeni mailleri çeker. Son okunan UID veritabanında tutulduğu
// için aynı mail iki kez alınmıyor.

import { useState } from "react"
import { useRouter } from "next/navigation"
import { syncImapAction } from "@/actions/mail.actions"
import { Button, Spinner } from "@/components/ui"

export function MailSync() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [mesaj, setMesaj] = useState<string | null>(null)

  async function yenile() {
    setBusy(true); setMesaj(null)
    const r = await syncImapAction()
    setBusy(false)
    setMesaj(r.ok ? (r.message ?? "Tamam.") : (r.error ?? "Hata"))
    if (r.ok) router.refresh()
    setTimeout(() => setMesaj(null), 4000)
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={yenile} disabled={busy}>
        {busy ? <Spinner /> : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
            <path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" />
          </svg>
        )}
        Yenile
      </Button>
      {mesaj && <span className="text-[12px] text-muted">{mesaj}</span>}
    </div>
  )
}
