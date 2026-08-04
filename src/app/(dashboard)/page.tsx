// src/app/(dashboard)/page.tsx
//
// GENEL BAKIŞ
//
// ┌─ DÜZEN ───────────────────────────────────────────────────────────┐
// │ 1. sıra: CANLI SAYAÇLAR — kullanıcı (5 sn'de yenilenir, animasyonlu) │
// │          gönderi · ilan · indirim · etkinlik                       │
// │ 2. sıra: BEKLEYEN İŞ — işletme onayı · öğrenci onayı · şikâyet ·    │
// │          tutarsız kayıt (hepsi tıklanabilir)                       │
// │ 3. sıra: TÜRKİYE HARİTASI (yoğunluk) + yayındaki popup'lar          │
// └───────────────────────────────────────────────────────────────────┘

import Link from "next/link"
import { fetchPopups } from "@/actions/popup.actions"
import { fetchDashboardCounts, fetchCityStats, fetchDashboardExtra } from "@/actions/admin.actions"
import { testConnection } from "@/lib/supabase-admin"
import { PageHeader } from "@/components/PageHeader"
import { LiveCounters } from "@/components/LiveCounters"
import { TurkeyMap } from "@/components/TurkeyMap"
import { DashboardStats } from "@/components/DashboardStats"
import { Button, Card, CardTitle, EmptyState, ErrorBox, Stat } from "@/components/ui"
import { fmtNum, popupLiveState } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const conn = await testConnection()

  if (!conn.ok) {
    return (
      <>
        <PageHeader title="Genel Bakış" />
        <ErrorBox>
          <strong>Supabase bağlantısı kurulamadı.</strong>
          <br />
          {conn.error}
          <br />
          <br />
          Kontrol et: <code className="font-mono">SUPABASE_URL</code> ve{" "}
          <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> doğru mu?
          V3 SQL dosyaları çalıştırıldı mı?
        </ErrorBox>
      </>
    )
  }

  const [{ popups, error: popupErr }, { counts, error: countErr }, { items: cities }, { extra }] =
    await Promise.all([
      fetchPopups(), fetchDashboardCounts(), fetchCityStats(), fetchDashboardExtra(),
    ])

  const livePopups = popups.filter((p) => popupLiveState(p).tone === "live")
  const scheduled = popups.filter((p) => popupLiveState(p).tone === "scheduled")

  const cityMap: Record<string, number> = {}
  for (const c of cities) cityMap[c.sehir] = c.kullanici
  const cityTotal = cities.reduce((s, c) => s + c.kullanici, 0)
  const kayitliIl = cities.filter((c) => c.kullanici > 0).length

  const bekleyen =
    (counts?.bekleyen_isletme ?? 0) + (counts?.bekleyen_ogrenci ?? 0) +
    (counts?.sikayet ?? 0) + (counts?.tutarsiz ?? 0)

  return (
    <>
      <PageHeader
        title="Genel Bakış"
        description="Canlı sayaçlar, bekleyen işler ve kullanıcı yoğunluğu."
      />

      {(popupErr || countErr) && (
        <div className="mb-5"><ErrorBox>{popupErr ?? countErr}</ErrorBox></div>
      )}

      {/* ══════ 1) CANLI SAYAÇLAR ══════ */}
      <section className="mb-8">
        <LiveCounters
          initial={{
            kullanici: counts?.kullanici ?? 0,
            cihaz: extra?.cihaz_toplam ?? null,
            post: counts?.post ?? null,
            ilan: counts?.ilan ?? null,
            indirim: counts?.indirim ?? null,
            etkinlik: counts?.etkinlik ?? null,
            sikayet: counts?.sikayet ?? 0,
          }}
        />
      </section>

      {/* ══════ 2) BEKLEYEN İŞ ══════ */}
      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-wider text-faint">
            Bekleyen iş
          </h2>
          {bekleyen === 0 && <span className="text-[11.5px] text-accent">Temiz</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label="İşletme onayı"
            value={fmtNum(counts?.bekleyen_isletme ?? 0)}
            tone={(counts?.bekleyen_isletme ?? 0) > 0 ? "accent" : "default"}
            href="/onay/isletme"
          />
          <Stat
            label="Öğrenci onayı"
            value={fmtNum(counts?.bekleyen_ogrenci ?? 0)}
            tone={(counts?.bekleyen_ogrenci ?? 0) > 0 ? "accent" : "default"}
            href="/onay/ogrenci"
          />
          <Stat
            label="Şikâyet"
            value={fmtNum(counts?.sikayet ?? 0)}
            tone={(counts?.sikayet ?? 0) > 0 ? "danger" : "default"}
            href="/reports"
          />
          <Stat
            label="Tutarsız kayıt"
            value={fmtNum(counts?.tutarsiz ?? 0)}
            tone={(counts?.tutarsiz ?? 0) > 0 ? "danger" : "default"}
            href="/kullanicilar?filter=mismatch"
          />
        </div>
      </section>

      {/* ══════ 3) İSTATİSTİKLER ══════ */}
      <section className="mb-8">
        <DashboardStats extra={extra} />
      </section>

      {/* ══════ 4) HARİTA + POPUP ══════ */}
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-2 flex items-start justify-between gap-3">
            <CardTitle>
              Kullanıcı yoğunluğu
            </CardTitle>
            <Link href="/sehirler">
              <Button variant="secondary" size="sm">Tüm şehirler</Button>
            </Link>
          </div>
          <TurkeyMap data={cityMap} total={cityTotal} />
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-start justify-between gap-3">
            <CardTitle>
              Yayındaki popup&apos;lar
            </CardTitle>
            <Link href="/popups">
              <Button variant="secondary" size="sm">Tümü</Button>
            </Link>
          </div>

          {livePopups.length === 0 ? (
            <EmptyState
              title="Yayında popup yok"
              action={<Link href="/popups/new"><Button size="sm">Popup oluştur</Button></Link>}
            />
          ) : (
            <ul className="space-y-2">
              {livePopups.slice(0, 5).map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/popups/${p.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-raised px-3.5 py-3 transition-colors hover:border-accent/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium text-text">{p.title}</div>
                      <div className="mt-0.5 truncate text-[11.5px] text-faint">
                        {p.placement === "app_open" ? "Açılışta"
                          : p.placement === "screen" ? `Ekran: ${p.target_screen}`
                          : p.placement}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[13px] font-semibold tabular-nums text-text">
                        {fmtNum(p.goruntulenme)}
                      </div>
                      <div className="text-[10.5px] text-faint">Gösterim</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ══════ HIZLI İŞLEM ══════ */}
      <section className="mt-8">
        <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-faint">
          Hızlı işlem
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/gonderim", title: "Bildirim gönder", desc: "Uygulama içi, push ya da ikisi birden." },
            { href: "/reports", title: "Şikâyetleri incele", desc: "Cevaplanmamış bildirimleri karara bağla." },
            { href: "/kullanicilar", title: "Kullanıcı ara", desc: "Hesap detayı, içerikler, tutarlılık ve ban." },
            { href: "/banlar", title: "Ban ekle", desc: "Kullanıcı, cihaz ya da IP engelle." },
          ].map((q) => (
            <Link key={q.href} href={q.href} className="group">
              <div className="h-full rounded-2xl border border-hairline bg-surface p-4 shadow-card transition-colors group-hover:border-accent/40">
                <div className="text-[14px] font-semibold text-text">{q.title}</div>
                <div className="mt-1 text-[12px] leading-relaxed text-muted">{q.desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </>
  )
}
