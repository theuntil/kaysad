// src/app/(dashboard)/istatistik/page.tsx
//
// İSTATİSTİK — panelin tüm verileri tek sayfada
//
// Tek RPC (admin_full_stats) 10 bölüm birden dönüyor; her bölüm için
// ayrı sorgu atmak yerine tek turda alıyoruz.

import Link from "next/link"
import { fetchFullStats } from "@/actions/admin.actions"
import { PageHeader } from "@/components/PageHeader"
import { Bar, Button, Card, CardTitle, EmptyState, ErrorBox, Stat } from "@/components/ui"
import { label, fmtBytes, pct } from "@/lib/format"
import { fmtNum } from "@/lib/utils"

export const dynamic = "force-dynamic"

type Any = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0)

function Bolum({
  baslik, children, aksiyon,
}: {
  baslik: string
  children: React.ReactNode
  aksiyon?: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold uppercase tracking-wider text-faint">{baslik}</h2>
        {aksiyon}
      </div>
      {children}
    </section>
  )
}

/** Etiket–değer satırı listesi */
function Liste({ satirlar }: { satirlar: [string, string | number, string?][] }) {
  return (
    <div className="space-y-2">
      {satirlar.map(([l, v, c]) => (
        <div key={l} className="flex items-center justify-between border-b border-hairline pb-2 last:border-0">
          <span className="text-[12.5px] text-muted">{l}</span>
          <span className={`text-[13.5px] font-semibold tabular-nums ${c ?? "text-text"}`}>
            {typeof v === "number" ? fmtNum(v) : v}
          </span>
        </div>
      ))}
    </div>
  )
}

export default async function StatsPage() {
  const { stats, error } = await fetchFullStats()

  if (error || !stats) {
    return (
      <>
        <PageHeader title="İstatistik" />
        <ErrorBox>{error ?? "Veri alınamadı."}</ErrorBox>
      </>
    )
  }

  const k = stats.kullanici as Any
  const i = stats.icerik as Record<string, Any>
  const c = stats.cihaz as Any
  const b = stats.bildirim as Any
  const r = stats.reklam as Any
  const s = stats.sikayet as Any
  const o = stats.onay as Any
  const m = stats.mail as Any
  const md = stats.medya as Any
  const pp = stats.popup as Any
  const ban = stats.ban as Any
  const sehirler = (stats.sehirler ?? []) as Any[]
  const buyume = (stats.buyume ?? []) as { gun: string; adet: number }[]

  const buyumeMax = Math.max(1, ...buyume.map((g) => g.adet))
  const sehirMax = sehirler[0] ? n(sehirler[0].kullanici) : 1
  const icerikToplam = Object.values(i).reduce((t, v) => t + n(v.toplam), 0)

  const ICERIK_AD: Record<string, string> = {
    post: "Gönderi", listing: "İlan", discount: "İndirim", event: "Etkinlik",
  }

  return (
    <>
      <PageHeader title="İstatistik" />

      {/* ══════ ÖZET ══════ */}
      <Bolum baslik="Özet">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Kullanıcı" value={fmtNum(n(k.toplam))} />
          <Stat label="İçerik" value={fmtNum(icerikToplam)} />
          <Stat label="Cihaz" value={fmtNum(n(c.toplam))} />
          <Stat
            label="Aylık reklam geliri"
            value={`${fmtNum(n(r.aylik_gelir))} ₺`}
            tone="accent"
          />
        </div>
      </Bolum>

      {/* ══════ KULLANICI ══════ */}
      <Bolum
        baslik="Kullanıcılar"
        aksiyon={<Link href="/kullanicilar" className="text-[12px] text-muted hover:text-accent">Tümü →</Link>}
      >
        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardTitle>Durum</CardTitle>
            <Liste satirlar={[
              ["Toplam hesap", n(k.toplam)],
              ["Profilli", n(k.profilli)],
              ["Aktif", n(k.aktif), "text-accent"],
              ["Banlı", n(k.banli), n(k.banli) > 0 ? "text-danger" : "text-faint"],
              ["Doğrulanmış", n(k.dogrulanmis)],
              ["Gizli hesap", n(k.gizli)],
            ]} />
          </Card>

          <Card>
            <CardTitle>Tür ve etkinlik</CardTitle>
            <Liste satirlar={[
              ["İşletme", n(k.isletme), "text-info"],
              ["Öğrenci", n(k.ogrenci)],
              ["Bugün katılan", n(k.bugun), "text-accent"],
              ["Son 7 gün", n(k.son_7g)],
              ["Son 30 gün", n(k.son_30g)],
              ["Hiç girmemiş", n(k.hic_girmemis), "text-faint"],
            ]} />
          </Card>

          <Card>
            <CardTitle>Aktiflik</CardTitle>
            <div className="space-y-3">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12.5px] text-muted">Son 7 günde giren</span>
                  <span className="text-[13px] font-semibold tabular-nums text-accent">
                    {pct(n(k.aktif_7g), n(k.toplam))}
                  </span>
                </div>
                <Bar pct={n(k.toplam) > 0 ? (n(k.aktif_7g) / n(k.toplam)) * 100 : 0} />
                <div className="mt-1 text-[11px] text-faint">{fmtNum(n(k.aktif_7g))} kullanıcı</div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12.5px] text-muted">Son 30 günde giren</span>
                  <span className="text-[13px] font-semibold tabular-nums text-info">
                    {pct(n(k.aktif_30g), n(k.toplam))}
                  </span>
                </div>
                <Bar pct={n(k.toplam) > 0 ? (n(k.aktif_30g) / n(k.toplam)) * 100 : 0} tone="info" />
                <div className="mt-1 text-[11px] text-faint">{fmtNum(n(k.aktif_30g))} kullanıcı</div>
              </div>
            </div>
          </Card>
        </div>
      </Bolum>

      {/* ══════ BÜYÜME ══════ */}
      <Bolum baslik="Son 30 gün — yeni kayıt">
        <Card>
          {buyume.length === 0 ? (
            <EmptyState title="Bu dönemde yeni kayıt yok" />
          ) : (
            <div className="scroll-hint overflow-x-auto">
              <div className="flex min-w-full items-end gap-1" style={{ height: 150 }}>
                {buyume.map((g) => (
                  <div key={g.gun} className="flex min-w-[22px] flex-1 flex-col items-center gap-1.5">
                    <span className="text-[9.5px] tabular-nums text-muted">{g.adet}</span>
                    <div
                      className="w-full rounded-t-md bg-accent/55"
                      style={{ height: `${Math.max(4, (g.adet / buyumeMax) * 105)}px` }}
                    />
                    <span className="whitespace-nowrap text-[9px] tabular-nums text-faint">
                      {new Date(g.gun).getDate()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </Bolum>

      {/* ══════ İÇERİK ══════ */}
      <Bolum
        baslik="İçerik"
        aksiyon={<Link href="/icerikler" className="text-[12px] text-muted hover:text-accent">Tümü →</Link>}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Object.entries(i).map(([key, v]) => (
            <Card key={key}>
              <div className="text-[11px] font-medium uppercase tracking-wider text-faint">
                {ICERIK_AD[key] ?? key}
              </div>
              <div className="mt-1.5 text-[24px] font-bold tabular-nums text-text">
                {v.toplam === null ? "—" : fmtNum(n(v.toplam))}
              </div>
              <div className="mt-2 space-y-1 border-t border-hairline pt-2 text-[11.5px]">
                <div className="flex justify-between">
                  <span className="text-faint">7 gün</span>
                  <span className="tabular-nums text-accent">+{fmtNum(n(v.son_7g))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-faint">30 gün</span>
                  <span className="tabular-nums text-muted">+{fmtNum(n(v.son_30g))}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Bolum>

      {/* ══════ CİHAZ + BİLDİRİM ══════ */}
      <Bolum baslik="Cihaz ve bildirim">
        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardTitle>Cihaz</CardTitle>
            <Liste satirlar={[
              ["Toplam", n(c.toplam)],
              ["Push token'ı olan", n(c.push), "text-info"],
              ["Push açık", n(c.push_acik), "text-accent"],
              ["Banlı", n(c.banli), n(c.banli) > 0 ? "text-danger" : "text-faint"],
            ]} />
            <div className="mt-3 space-y-2 border-t border-hairline pt-3">
              {((c.platformlar ?? []) as Any[]).map((p) => (
                <div key={String(p.platform)}>
                  <div className="mb-1 flex justify-between">
                    <span className="text-[12.5px] text-text">{label.platform(String(p.platform))}</span>
                    <span className="text-[12.5px] tabular-nums text-muted">{fmtNum(n(p.adet))}</span>
                  </div>
                  <Bar pct={n(c.toplam) > 0 ? (n(p.adet) / n(c.toplam)) * 100 : 0} />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle>Bildirim</CardTitle>
            <Liste satirlar={[
              ["Toplam", n(b.toplam)],
              ["Okunmamış", n(b.okunmamis), "text-info"],
              ["Bugün", n(b.bugun), "text-accent"],
              ["Kuyrukta", n(b.kuyruk), n(b.kuyruk) > 0 ? "text-danger" : "text-faint"],
              ["Push gitti", n(b.push_sent)],
              ["Push başarısız", n(b.push_failed), n(b.push_failed) > 0 ? "text-danger" : "text-faint"],
            ]} />
          </Card>

          <Card>
            <CardTitle>En çok gönderilen tipler</CardTitle>
            {((b.tipler ?? []) as Any[]).length === 0 ? (
              <EmptyState title="Bildirim yok" />
            ) : (
              <div className="space-y-2">
                {((b.tipler ?? []) as Any[]).slice(0, 8).map((t) => (
                  <div key={String(t.tip)}>
                    <div className="mb-1 flex justify-between">
                      <span className="truncate text-[12.5px] text-text">{String(t.tip)}</span>
                      <span className="text-[12.5px] tabular-nums text-muted">{fmtNum(n(t.adet))}</span>
                    </div>
                    <Bar pct={n(b.toplam) > 0 ? (n(t.adet) / n(b.toplam)) * 100 : 0} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </Bolum>

      {/* ══════ REKLAM ══════ */}
      <Bolum
        baslik="Reklam"
        aksiyon={<Link href="/reklamlar" className="text-[12px] text-muted hover:text-accent">Tümü →</Link>}
      >
        <div className="grid gap-5 lg:grid-cols-3">
          <Card>
            <CardTitle>Kampanya</CardTitle>
            <Liste satirlar={[
              ["Toplam", n(r.toplam)],
              ["Yayında", n(r.aktif), "text-accent"],
              ["Bekleyen", n(r.bekleyen), n(r.bekleyen) > 0 ? "text-danger" : "text-faint"],
              ["Aktif boost", n(r.boost_aktif), "text-info"],
            ]} />
          </Card>

          <Card>
            <CardTitle>Gelir ve performans</CardTitle>
            <Liste satirlar={[
              ["Aylık gelir", `${fmtNum(n(r.aylik_gelir))} ₺`, "text-accent"],
              ["Toplam gelir", `${fmtNum(n(r.toplam_gelir))} ₺`],
              ["Gösterim", n(r.gosterim)],
              ["Tıklama", n(r.tiklama), "text-info"],
              ["Tıklanma oranı", pct(n(r.tiklama), n(r.gosterim))],
            ]} />
          </Card>

          <Card>
            <CardTitle>Alan doluluğu</CardTitle>
            <div className="space-y-2">
              {((r.alanlar ?? []) as Any[]).map((a) => {
                const dolu = n(a.aktif) >= n(a.capacity)
                return (
                  <div key={String(a.key)}>
                    <div className="mb-1 flex justify-between">
                      <span className="text-[12.5px] text-text">{String(a.ad)}</span>
                      <span className={`text-[12.5px] tabular-nums ${dolu ? "text-danger" : "text-muted"}`}>
                        {n(a.aktif)}/{n(a.capacity)}
                      </span>
                    </div>
                    <Bar
                      pct={n(a.capacity) > 0 ? (n(a.aktif) / n(a.capacity)) * 100 : 0}
                      tone={dolu ? "warn" : "accent"}
                    />
                  </div>
                )
              })}
            </div>
          </Card>
        </div>
      </Bolum>

      {/* ══════ ŞEHİR ══════ */}
      <Bolum
        baslik="Şehir dağılımı"
        aksiyon={<Link href="/sehirler" className="text-[12px] text-muted hover:text-accent">Tümü →</Link>}
      >
        <Card>
          {sehirler.length === 0 ? (
            <EmptyState title="Şehir verisi yok" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sehirler.map((x, idx) => (
                <Link
                  key={String(x.sehir)}
                  href={`/sehirler/${encodeURIComponent(String(x.sehir))}`}
                  className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5 transition-colors hover:border-accent/40"
                >
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 shrink-0 text-[11px] tabular-nums text-faint">{idx + 1}</span>
                      <span className="truncate text-[13px] font-medium text-text">{String(x.sehir)}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-text">
                      {fmtNum(n(x.kullanici))}
                    </span>
                  </div>
                  <Bar pct={(n(x.kullanici) / sehirMax) * 100} />
                  <div className="mt-1.5 flex gap-3 text-[11px] text-faint">
                    <span>{fmtNum(n(x.isletme))} işletme</span>
                    <span>{fmtNum(n(x.ogrenci))} öğrenci</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </Bolum>

      {/* ══════ DİĞER ══════ */}
      <Bolum baslik="Moderasyon, mail ve medya">
        <div className="grid gap-5 lg:grid-cols-4">
          <Card>
            <CardTitle>Şikâyet</CardTitle>
            <Liste satirlar={[
              ["Toplam", n(s.toplam)],
              ["Cevaplanmamış", n(s.cevaplanmamis), n(s.cevaplanmamis) > 0 ? "text-danger" : "text-faint"],
              ["Kabul edilen", n(s.cozuldu), "text-accent"],
              ["Reddedilen", n(s.reddedildi)],
            ]} />
          </Card>

          <Card>
            <CardTitle>Onay</CardTitle>
            <Liste satirlar={[
              ["İşletme bekleyen", n(o.isletme_bekleyen), n(o.isletme_bekleyen) > 0 ? "text-danger" : "text-faint"],
              ["İşletme onaylı", n(o.isletme_onayli), "text-accent"],
              ["Öğrenci bekleyen", n(o.ogrenci_bekleyen), n(o.ogrenci_bekleyen) > 0 ? "text-danger" : "text-faint"],
              ["Öğrenci onaylı", n(o.ogrenci_onayli), "text-accent"],
            ]} />
          </Card>

          <Card>
            <CardTitle>Mail</CardTitle>
            <Liste satirlar={[
              ["Gelen", n(m.gelen)],
              ["Okunmamış", n(m.okunmamis), n(m.okunmamis) > 0 ? "text-info" : "text-faint"],
              ["Gönderilen", n(m.gonderilen), "text-accent"],
              ["Kuyrukta", n(m.kuyruk)],
              ["Hata", n(m.hata), n(m.hata) > 0 ? "text-danger" : "text-faint"],
            ]} />
          </Card>

          <Card>
            <CardTitle>Medya ve popup</CardTitle>
            <Liste satirlar={[
              ["Dosya", n(md.dosya)],
              ["Kapladığı alan", fmtBytes(n(md.boyut))],
              ["Popup (aktif)", `${n(pp.aktif)} / ${n(pp.toplam)}`],
              ["Popup gösterim", n(pp.gosterim)],
              ["Popup tıklama", n(pp.tiklama), "text-info"],
            ]} />
          </Card>
        </div>
      </Bolum>

      {/* ══════ BAN ══════ */}
      <Bolum
        baslik="Engellemeler"
        aksiyon={<Link href="/banlar" className="text-[12px] text-muted hover:text-accent">Tümü →</Link>}
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Yürürlükte" value={fmtNum(n(ban.aktif))} tone={n(ban.aktif) > 0 ? "danger" : "default"} />
          <Stat label="Hesap banı" value={fmtNum(n(ban.hesap))} />
          <Stat label="Cihaz banı" value={fmtNum(n(ban.cihaz))} />
          <Stat label="IP banı" value={fmtNum(n(ban.ip))} />
          <Stat label="Süresi geçmiş" value={fmtNum(n(ban.suresi_gecmis))} />
        </div>
      </Bolum>
    </>
  )
}
