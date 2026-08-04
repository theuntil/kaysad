// src/app/(dashboard)/kullanicilar/page.tsx
//
// KULLANICI LİSTESİ
//
// ★ Kaynak auth.users — profiles SAĞ join. Yani profili olmayan auth
//   kayıtları da listede görünüyor. Bunlar "hayalet hesap"lar: giriş
//   yapabiliyor ama uygulamada hiçbir şey yapamıyor. Eskiden hiç
//   görünmüyorlardı.
//
// Filtreler link (server-side) — böylece adres çubuğu paylaşılabilir,
// geri tuşu çalışır, JS gerekmez.

import Link from "next/link"
import { fetchUsers } from "@/actions/users.actions"
import { fetchUserCounts, fetchCityStats } from "@/actions/admin.actions"
import { PageHeader } from "@/components/PageHeader"
import {
  Avatar, Badge, Bar, Button, Card, CardTitle, EmptyState, ErrorBox,
  Input, Table, Td, Th,
} from "@/components/ui"
import { fmtNum, timeAgo } from "@/lib/utils"
import type { UserFilter } from "@/lib/types.v3"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const FILTERS: { value: UserFilter; label: string; countKey?: string; tone?: "danger" }[] = [
  { value: "all",              label: "Tümü",            countKey: "toplam" },
  { value: "active",           label: "Aktif",           countKey: "aktif" },
  { value: "banned",           label: "Banlı",           countKey: "banli", tone: "danger" },
  { value: "business",         label: "İşletme",         countKey: "isletme" },
  { value: "student",          label: "Öğrenci",         countKey: "ogrenci" },
  { value: "pending_business", label: "İşletme bekleyen", countKey: "bekleyen_isletme" },
  { value: "pending_student",  label: "Öğrenci bekleyen", countKey: "bekleyen_ogrenci" },
  { value: "no_profile",       label: "Profilsiz",       countKey: "profilsiz", tone: "danger" },
  { value: "mismatch",         label: "Tutarsız",        countKey: "tutarsiz", tone: "danger" },
]

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; sayfa?: string }>
}) {
  const sp = await searchParams
  const q = sp.q ?? ""
  const filter = (FILTERS.find((f) => f.value === sp.filter)?.value ?? "all") as UserFilter
  const sayfa = Math.max(1, Number(sp.sayfa ?? "1") || 1)
  const limit = 50

  const [{ items, error }, { counts }, { items: cities }] = await Promise.all([
    fetchUsers({ query: q, filter, limit, offset: (sayfa - 1) * limit }),
    fetchUserCounts(),
    fetchCityStats(),
  ])

  const cityTop = cities.filter((c) => c.kullanici > 0).slice(0, 8)
  const cityMax = cityTop[0]?.kullanici || 1
  const kayitliIl = cities.filter((c) => c.kullanici > 0).length

  const c = (counts ?? {}) as Record<string, number>

  function href(next: Partial<{ q: string; filter: string; sayfa: number }>) {
    const p = new URLSearchParams()
    const qq = next.q ?? q
    const ff = next.filter ?? filter
    const ss = next.sayfa ?? 1
    if (qq) p.set("q", qq)
    if (ff !== "all") p.set("filter", ff)
    if (ss > 1) p.set("sayfa", String(ss))
    const s = p.toString()
    return s ? `/kullanicilar?${s}` : "/kullanicilar"
  }

  return (
    <>
      <PageHeader
        title="Kullanıcılar"
        description="auth kayıtları ve profiller birlikte. Tutarsız olanlar sarı bayrakla işaretli."
      />

      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}

      {/* ══════ ŞEHİR WIDGET'I ══════ */}
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <CardTitle>
              Şehir bazlı kullanıcı dağılımı
            </CardTitle>
            <Link href="/sehirler">
              <Button variant="secondary" size="sm">Tüm şehirler</Button>
            </Link>
          </div>
          {cityTop.length === 0 ? (
            <EmptyState title="Şehir verisi yok" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {cityTop.map((ct) => (
                <div key={ct.sehir} className="rounded-xl border border-border bg-raised px-3.5 py-2.5">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-medium text-text">{ct.sehir}</span>
                    <span className="shrink-0 text-[12.5px] tabular-nums text-muted">{fmtNum(ct.kullanici)}</span>
                  </div>
                  <Bar pct={(ct.kullanici / cityMax) * 100} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Özet</CardTitle>
          <div className="space-y-2 text-[13px]">
            {[
              ["Toplam", c.toplam ?? 0, "text-text"],
              ["Aktif", c.aktif ?? 0, "text-accent"],
              ["Banlı", c.banli ?? 0, "text-danger"],
              ["İşletme", c.isletme ?? 0, "text-info"],
              ["Öğrenci", c.ogrenci ?? 0, "text-text"],
              ["Tutarsız", c.tutarsiz ?? 0, "text-warn"],
            ].map(([label, val, cls]) => (
              <div key={String(label)} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0">
                <span className="text-muted">{label}</span>
                <span className={cn("font-semibold tabular-nums", cls as string)}>{fmtNum(val as number)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* ══════ ARAMA + FİLTRE ══════ */}
      <form action="/kullanicilar" method="get" className="mb-3 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Kullanıcı adı, isim, e-posta, telefon ya da UUID" />
        {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
        <Button type="submit" variant="secondary">Ara</Button>
      </form>

      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => {
          const active = f.value === filter
          const n = f.countKey ? c[f.countKey] ?? 0 : null
          return (
            <Link
              key={f.value}
              href={href({ filter: f.value, sayfa: 1 })}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-medium transition-colors",
                active
                  ? "border-accent/35 bg-accent/10 text-accent"
                  : "border-border bg-surface text-muted hover:text-text"
              )}
            >
              {f.label}
              {n !== null && (
                <span className={cn(
                  "rounded-full px-1.5 py-[1px] text-[11px] font-bold tabular-nums",
                  active ? "bg-accent/20 text-accent"
                    : f.tone === "danger" ? "bg-danger/15 text-danger"
                    : "bg-white/[0.08] text-muted"
                )}>
                  {fmtNum(n)}
                </span>
              )}
            </Link>
          )
        })}
      </div>

      {/* ══════ LİSTE ══════ */}
      {items.length === 0 ? (
        <EmptyState
          title="Kullanıcı bulunamadı"
        />
      ) : (
        <Table minWidth={860}>
          <thead>
            <tr>
              <Th>Kullanıcı</Th>
              <Th>Durum</Th>
              <Th>Şehir</Th>
              <Th className="text-right">Cihaz</Th>
              <Th>Son giriş</Th>
              <Th>Kayıt</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((u) => (
              <tr key={u.auth_id} className="transition-colors hover:bg-white/[0.03]">
                <Td>
                  <Link href={`/kullanicilar/${u.auth_id}`} className="flex items-center gap-3">
                    <Avatar url={u.avatar_url} name={u.username ?? u.name ?? u.email} size={34} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-text">
                          {u.username ?? <span className="text-warn">Profil yok</span>}
                        </span>
                        {u.verify && <Badge tone="live">✓</Badge>}
                        {u.has_mismatch && <Badge tone="danger">Tutarsız</Badge>}
                      </span>
                      <span className="block truncate text-[11.5px] text-faint">
                        {u.email ?? u.phone ?? u.auth_id.slice(0, 8)}
                      </span>
                    </span>
                  </Link>
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {/* ★ profiles.is_active kullanılmıyor — tek ölçüt ban */}
                    {u.is_banned || u.active_ban_count > 0
                      ? <Badge tone="danger">Banlı</Badge>
                      : <Badge tone="live">Aktif</Badge>}
                    {u.role === "business" && <Badge tone="scheduled">İşletme</Badge>}
                    {u.ogrenci && <Badge tone="neutral">Öğrenci</Badge>}
                    {u.business_durum === "pending" && <Badge tone="promo">İşletme bekliyor</Badge>}
                    {u.ogrenci_durum === "pending" && <Badge tone="promo">Öğrenci bekliyor</Badge>}
                  </div>
                </Td>
                <Td className="text-muted">{u.sehir ?? "—"}</Td>
                <Td className="text-right tabular-nums">
                  {u.device_count}
                  <span className="ml-1 text-[11px] text-faint">({u.push_device_count} push)</span>
                </Td>
                <Td className="text-[12.5px] text-muted">{u.last_sign_in ? timeAgo(u.last_sign_in) : "Hiç"}</Td>
                <Td className="text-[12.5px] text-faint">{u.auth_created ? timeAgo(u.auth_created) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      {/* ══════ SAYFALAMA ══════ */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-faint">
          Sayfa {sayfa} · {items.length} kayıt gösteriliyor
        </span>
        <div className="flex gap-2">
          {sayfa > 1 && (
            <Link href={href({ sayfa: sayfa - 1 })}>
              <Button variant="secondary" size="sm">← Önceki</Button>
            </Link>
          )}
          {items.length === limit && (
            <Link href={href({ sayfa: sayfa + 1 })}>
              <Button variant="secondary" size="sm">Sonraki →</Button>
            </Link>
          )}
        </div>
      </div>
    </>
  )
}
