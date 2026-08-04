// src/app/(dashboard)/sehirler/[ad]/page.tsx
//
// ŞEHİR DETAYI
//
// Bir ilin tüm tablosu: kullanıcı kırılımı, içerik sayıları, cihaz ve
// platform dağılımı, 12 haftalık büyüme ve en aktif kullanıcılar.
//
// ★ İçerik sayıları SAHİBİNİN şehri üzerinden hesaplanıyor — içerik
//   tabloları şehir kolonu tutmuyor olabilir.

import Link from "next/link"
import { notFound } from "next/navigation"
import { fetchCityDetail } from "@/actions/admin.actions"
import { CITIES } from "@/lib/cities"
import { PageHeader } from "@/components/PageHeader"
import {
  Avatar, Badge, Bar, Button, Card, CardTitle, EmptyState, ErrorBox, Stat,
} from "@/components/ui"
import { label } from "@/lib/format"
import { fmtDate, fmtNum } from "@/lib/utils"

export const dynamic = "force-dynamic"

const ICERIK_AD: Record<string, string> = {
  post: "Gönderi", listing: "İlan", discount: "İndirim", event: "Etkinlik",
}

export default async function CityDetailPage({
  params,
}: {
  params: Promise<{ ad: string }>
}) {
  const { ad } = await params
  const sehir = decodeURIComponent(ad)

  const il = CITIES.find((c) => c.ad === sehir)
  if (!il) notFound()

  const { detail: d, error } = await fetchCityDetail(sehir)

  if (error) {
    return (
      <>
        <PageHeader back={{ href: "/sehirler", label: "Şehirler" }}
        title={sehir} />
        <ErrorBox>{error}</ErrorBox>
      </>
    )
  }
  if (!d) notFound()

  const buyumeMax = Math.max(1, ...(d.buyume ?? []).map((b) => b.adet))
  const pay = d.toplam_kullanici > 0 ? (d.kullanici / d.toplam_kullanici) * 100 : 0

  return (
    <>
      <PageHeader
        title={sehir}
        action={
          <div className="flex gap-2">
            <Link href={`/kullanicilar?q=${encodeURIComponent(sehir)}`}>
              <Button variant="secondary" size="sm">Kullanıcılar</Button>
            </Link>
          </div>
        }
      />

      {/* ── ÜST ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Kullanıcı" value={fmtNum(d.kullanici)} />
        <Stat
          label="Türkiye sırası"
          value={d.sira ? `${d.sira}.` : "—"}
          tone="accent"
        />
        <Stat label="Toplam içindeki pay" value={`%${pay.toFixed(1)}`} tone="info" />
        <Stat
          label="Plaka / Bölge"
          value={String(il.plaka).padStart(2, "0")}
        />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        {/* ── KULLANICI KIRILIMI ── */}
        <Card>
          <CardTitle>Kullanıcı dökümü</CardTitle>
          <div className="space-y-2">
            {[
              { l: "Aktif", v: d.aktif, c: "text-accent" },
              { l: "Banlı", v: d.banli, c: d.banli > 0 ? "text-danger" : "text-faint" },
              { l: "İşletme", v: d.isletme, c: "text-info" },
              { l: "Öğrenci", v: d.ogrenci, c: "text-text" },
              { l: "Doğrulanmış", v: d.dogrulanmis, c: "text-text" },
              { l: "Son 7 gün", v: d.yeni_7g, c: "text-accent" },
              { l: "Son 30 gün", v: d.yeni_30g, c: "text-text" },
            ].map((x) => (
              <div
                key={x.l}
                className="flex items-center justify-between border-b border-hairline pb-2 last:border-0"
              >
                <span className="text-[12.5px] text-muted">{x.l}</span>
                <span className={`text-[13.5px] font-semibold tabular-nums ${x.c}`}>
                  {fmtNum(x.v)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        {/* ── İÇERİK ── */}
        <Card>
          <CardTitle>İçerik</CardTitle>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(d.icerik ?? {}).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
                <div className="text-[10.5px] uppercase tracking-wider text-faint">
                  {ICERIK_AD[k] ?? k}
                </div>
                <div className="text-[18px] font-bold tabular-nums text-text">
                  {v.toplam === null ? "—" : fmtNum(v.toplam)}
                </div>
                {v.son_30_gun !== null && v.son_30_gun > 0 && (
                  <div className="text-[11px] text-accent">+{v.son_30_gun} / 30 gün</div>
                )}
              </div>
            ))}
          </div>

          <div className="mt-3 border-t border-hairline pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] text-muted">İşletme onayı bekleyen</span>
              <span className={`text-[13.5px] font-semibold tabular-nums ${d.bekleyen_isletme > 0 ? "text-danger" : "text-faint"}`}>
                {d.bekleyen_isletme}
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[12.5px] text-muted">Öğrenci onayı bekleyen</span>
              <span className={`text-[13.5px] font-semibold tabular-nums ${d.bekleyen_ogrenci > 0 ? "text-danger" : "text-faint"}`}>
                {d.bekleyen_ogrenci}
              </span>
            </div>
          </div>
        </Card>

        {/* ── CİHAZ ── */}
        <Card>
          <CardTitle>Cihaz</CardTitle>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
              <div className="text-[10.5px] uppercase tracking-wider text-faint">Toplam</div>
              <div className="text-[18px] font-bold tabular-nums text-text">{fmtNum(d.cihaz)}</div>
            </div>
            <div className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
              <div className="text-[10.5px] uppercase tracking-wider text-faint">Push</div>
              <div className="text-[18px] font-bold tabular-nums text-accent">
                {fmtNum(d.push_cihaz)}
              </div>
            </div>
          </div>

          {(d.platformlar ?? []).length > 0 ? (
            <div className="space-y-2">
              {d.platformlar.map((p) => (
                <div key={p.platform}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[12.5px] text-text">{label.platform(p.platform)}</span>
                    <span className="text-[12.5px] tabular-nums text-muted">{fmtNum(p.adet)}</span>
                  </div>
                  <Bar pct={d.cihaz > 0 ? (p.adet / d.cihaz) * 100 : 0} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-faint">Cihaz kaydı yok</p>
          )}

          <div className="mt-3 border-t border-hairline pt-3 text-[11.5px] text-faint">
            İlk kayıt: {d.ilk_kayit ? fmtDate(d.ilk_kayit) : "—"}
            <br />
            Son kayıt: {d.son_kayit ? fmtDate(d.son_kayit) : "—"}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── BÜYÜME ── */}
        <Card>
          <CardTitle>Son 12 hafta</CardTitle>
          {(d.buyume ?? []).length === 0 ? (
            <EmptyState title="Bu dönemde yeni kayıt yok" />
          ) : (
            <div className="flex items-end gap-1.5" style={{ height: 140 }}>
              {d.buyume.map((b) => (
                <div key={b.hafta} className="flex flex-1 flex-col items-center gap-1.5">
                  <span className="text-[10px] tabular-nums text-muted">{b.adet}</span>
                  <div
                    className="w-full rounded-t-md bg-accent/55"
                    style={{ height: `${Math.max(4, (b.adet / buyumeMax) * 96)}px` }}
                  />
                  <span className="text-[9px] tabular-nums text-faint">
                    {new Date(b.hafta).toLocaleDateString("tr", { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── EN AKTİF ── */}
        <Card>
          <CardTitle>En çok gönderi paylaşanlar</CardTitle>
          {(d.top_kullanici ?? []).length === 0 ? (
            <EmptyState title="Kullanıcı yok" />
          ) : (
            <ul className="space-y-2">
              {d.top_kullanici.map((u, i) => (
                <li key={u.id}>
                  <Link
                    href={`/kullanicilar/${u.id}`}
                    className="flex items-center gap-3 rounded-xl border border-hairline bg-raised px-3.5 py-2.5 transition-colors hover:border-accent/40"
                  >
                    <span className="w-4 shrink-0 text-[11px] tabular-nums text-faint">{i + 1}</span>
                    <Avatar url={u.avatar_url} name={u.username} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-[13px] font-medium text-text">
                          {u.username ?? "—"}
                        </span>
                        {u.role === "business" && <Badge tone="scheduled">İşletme</Badge>}
                      </span>
                      <span className="block truncate text-[11.5px] text-faint">
                        {u.name ?? ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[13px] font-semibold tabular-nums text-text">
                        {fmtNum(u.post_count)}
                      </span>
                      <span className="block text-[10px] text-faint">gönderi</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
