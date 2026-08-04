// src/app/(dashboard)/cihazlar/page.tsx
//
// CİHAZLAR — sadece cihaz banı için ayrı yönetim alanı
//
// Kullanıcı sayfasından da cihaz banlanabiliyor; burası cihazdan yola
// çıktığın durum için: elinde bir device_id var, kimin olduğunu ve kaç
// hesabın kullandığını görüp banlıyorsun.

import Link from "next/link"
import { fetchDevices } from "@/actions/ban.actions"
import { fetchDashboardExtra } from "@/actions/admin.actions"
import { PageHeader } from "@/components/PageHeader"
import { DevicesList } from "@/components/DevicesList"
import { Button, ErrorBox, Input, Stat } from "@/components/ui"
import { cn, fmtNum } from "@/lib/utils"
import { label } from "@/lib/format"

export const dynamic = "force-dynamic"

const FILTERS = [
  { value: "all",      label: "Tümü" },
  { value: "banned",   label: "Banlı" },
  { value: "unbanned", label: "Banlı değil" },
  { value: "orphan",   label: "Sahipsiz" },
] as const

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string }>
}) {
  const sp = await searchParams
  const q = sp.q ?? ""
  const filter = (FILTERS.find((f) => f.value === sp.filter)?.value ?? "all") as
    "all" | "banned" | "unbanned" | "orphan"

  const [{ items, error }, { extra }] = await Promise.all([
    fetchDevices({ query: q, filter, limit: 150 }),
    fetchDashboardExtra(),
  ])

  return (
    <>
      <PageHeader
        title="Cihazlar"
        description="Hesabı banlamadan tek bir cihazı engelle."
        action={
          <Link href="/banlar?scope=device">
            <Button variant="secondary" size="sm">Cihaz banları</Button>
          </Link>
        }
      />

      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}

      {/* ★ Toplam cihaz ve platform kırılımı */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Toplam cihaz" value={fmtNum(extra?.cihaz_toplam ?? 0)} />
        <Stat label="Push alabilen" value={fmtNum(extra?.cihaz_push ?? 0)} />
        {(extra?.platformlar ?? []).slice(0, 2).map((pl) => (
          <Stat key={pl.platform} label={label.platform(pl.platform)} value={fmtNum(pl.adet)} />
        ))}
      </div>

      <form action="/cihazlar" method="get" className="mb-3 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="device_id, model ya da kullanıcı adı" />
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <Button type="submit" variant="secondary">Ara</Button>
      </form>

      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => {
          const p = new URLSearchParams()
          if (q) p.set("q", q)
          if (f.value !== "all") p.set("filter", f.value)
          const s = p.toString()
          return (
            <Link
              key={f.value}
              href={s ? `/cihazlar?${s}` : "/cihazlar"}
              className={cn(
                "shrink-0 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors",
                f.value === filter
                  ? "border-accent/35 bg-accent/10 text-accent"
                  : "border-border bg-surface text-muted hover:text-text"
              )}
            >
              {f.label}
            </Link>
          )
        })}
      </div>

      <DevicesList items={items} />
    </>
  )
}
