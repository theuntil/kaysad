// src/app/(dashboard)/mail/page.tsx
//
// MAİL — gelen kutusu, gönderim, ayarlar

import Link from "next/link"
import {
  fetchMailStats, fetchMails, fetchMailSettings, fetchMailTemplates,
} from "@/actions/mail.actions"
import { PageHeader } from "@/components/PageHeader"
import { MailInbox } from "@/components/MailInbox"
import { MailComposer } from "@/components/MailComposer"
import { MailSettingsPanel } from "@/components/MailSettingsPanel"
import { MailSync } from "@/components/MailSync"
import { Button, ErrorBox, Input, Stat, WarnBox } from "@/components/ui"
import { fmtNum } from "@/lib/utils"
import { cn } from "@/lib/utils"
import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

// ★ "Yeni mail" ve "Ayarlar" sekmeden çıkıp sağ üstteki butonlara taşındı
const TABS = [
  { value: "inbox",    label: "Gelen kutusu" },
  { value: "unread",   label: "Okunmamış" },
  { value: "starred",  label: "Yıldızlı" },
  { value: "archived", label: "Arşiv" },
] as const

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ sekme?: string; q?: string; yaz?: string; to?: string; user?: string }>
}) {
  const sp = await searchParams
  /* ★ Eski `/mail?yaz=1` bağlantıları için yönlendirme —
     kayıtlı sekmeler ve dış bağlantılar bozulmasın */
  if (sp.yaz === "1") {
    const q = new URLSearchParams()
    if (sp.to) q.set("to", sp.to)
    if (sp.user) q.set("user", sp.user)
    redirect(`/mail/yaz${q.toString() ? `?${q}` : ""}`)
  }

  const sekme: string = sp.yaz === "1" ? "yaz"
    : sp.sekme === "ayar" ? "ayar"
    : (TABS.find((t) => t.value === sp.sekme)?.value ?? "inbox")
  const q = sp.q ?? ""

  const stats = await fetchMailStats()

  const [{ items, error }, { settings }, { items: templates }] = await Promise.all([
    sekme === "yaz" || sekme === "ayar"
      ? Promise.resolve({ items: [], error: undefined })
      : fetchMails({ filter: sekme, query: q, limit: 50 }),
    sekme === "ayar" ? fetchMailSettings() : Promise.resolve({ settings: null }),
    sekme === "ayar" ? fetchMailTemplates() : Promise.resolve({ items: [] }),
  ])



  return (
    <>
      <PageHeader
        title="Mail"
        action={
          <div className="flex items-center gap-2">
            {/* ★ Ayarlar: sadece ikon */}
            <Link href="/mail?sekme=ayar" aria-label="Mail ayarları" title="Mail ayarları">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-hairline bg-raised text-muted transition-colors hover:border-accent/40 hover:text-text"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </Link>

            {/* ★ Toplu mail — filtreli, ayrı ekran */}
            <Link href="/mail/toplu">
              <Button size="sm" variant="secondary">Toplu mail</Button>
            </Link>

            {/* ★ Yeni mail: artı butonu */}
            <Link href="/mail/yaz">
              <Button size="sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-4 w-4">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Yeni mail
              </Button>
            </Link>
          </div>
        }
      />

      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}

      {stats?.ayarli === false && (
        <div className="mb-5">
          <WarnBox>
            Mail sistemi kapalı — gönderim yapılamaz.{" "}
            <Link href="/mail?sekme=ayar" className="underline">Ayarlardan aç</Link>
          </WarnBox>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Okunmamış"
          value={fmtNum(stats?.gelen_okunmamis ?? 0)}
          tone={(stats?.gelen_okunmamis ?? 0) > 0 ? "danger" : "default"}
        />
        <Stat label="Gelen toplam" value={fmtNum(stats?.gelen_toplam ?? 0)} />
        <Stat label="Bugün gönderilen" value={fmtNum(stats?.bugun_gonderilen ?? 0)} tone="accent" />
        <Stat
          label="Kuyrukta"
          value={fmtNum(stats?.giden_bekleyen ?? 0)}
          tone={(stats?.giden_hata ?? 0) > 0 ? "danger" : "default"}
        />
      </div>

      <div className="scroll-hint -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <Link
            key={t.value}
            href={t.value === "inbox" ? "/mail" : `/mail?sekme=${t.value}`}
            className={cn(
              "shrink-0 rounded-xl border px-3.5 py-2 text-[13px] font-medium transition-colors",
              t.value === sekme
                ? "border-accent/40 bg-accent/10 text-text"
                : "border-hairline bg-surface text-muted hover:text-text"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {/* ★ "yaz" artık burada değil — kendi route'unda: /mail/yaz
             İstatistik kutuları ve sekme çubuğu altında yazmak
             dikkat dağıtıyordu. */}
      {sekme === "ayar" ? (
        <MailSettingsPanel settings={settings} templates={templates} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <form action="/mail" method="get" className="flex flex-1 gap-2">
              <Input name="q" defaultValue={q} placeholder="Konu, gönderen ya da içerikte ara" />
              {sekme !== "inbox" && <input type="hidden" name="sekme" value={sekme} />}
              <Button type="submit" variant="secondary">Ara</Button>
            </form>
            <MailSync />
          </div>

          <MailInbox items={items} />
        </>
      )}
    </>
  )
}
