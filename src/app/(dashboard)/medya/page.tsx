// src/app/(dashboard)/medya/page.tsx
//
// MEDYA KÜTÜPHANESİ — "medya" bucket'ı

import Link from "next/link"
import { fetchMedia, fetchMediaStats } from "@/actions/library.actions"
import { PageHeader } from "@/components/PageHeader"
import { MediaGallery } from "@/components/MediaGallery"
import { Button, ErrorBox, Input, Stat } from "@/components/ui"
import { fmtBytes } from "@/lib/format"
import { fmtNum } from "@/lib/utils"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ klasor?: string; q?: string; sayfa?: string }>
}) {
  const sp = await searchParams
  const klasor = sp.klasor ?? ""
  const q = sp.q ?? ""
  const sayfa = Math.max(1, Number(sp.sayfa ?? "1") || 1)
  const limit = 60

  const [{ items, error }, stats] = await Promise.all([
    fetchMedia({ klasor, query: q, limit, offset: (sayfa - 1) * limit }),
    fetchMediaStats(),
  ])

  function href(next: Partial<{ klasor: string; q: string; sayfa: number }>) {
    const p = new URLSearchParams()
    const k = next.klasor ?? klasor
    const qq = next.q ?? q
    const s = next.sayfa ?? 1
    if (k) p.set("klasor", k)
    if (qq) p.set("q", qq)
    if (s > 1) p.set("sayfa", String(s))
    const str = p.toString()
    return str ? `/medya?${str}` : "/medya"
  }

  return (
    <>
      <PageHeader title="Medya" />

      {error && <div className="mb-5"><ErrorBox>{error}</ErrorBox></div>}

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Toplam dosya" value={fmtNum(stats?.toplam ?? 0)} />
        <Stat label="Görsel" value={fmtNum(stats?.gorsel ?? 0)} />
        <Stat label="Video" value={fmtNum(stats?.video ?? 0)} />
        <Stat label="Kapladığı alan" value={fmtBytes(stats?.boyut ?? 0)} />
      </div>


      <form action="/medya" method="get" className="mb-4 flex gap-2">
        <Input name="q" defaultValue={q} placeholder="Dosya adı, açıklama ya da etiket" />
        <Button type="submit" variant="secondary">Ara</Button>
      </form>

      <MediaGallery items={items} />

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[12.5px] text-faint">Sayfa {sayfa} · {items.length} dosya</span>
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
