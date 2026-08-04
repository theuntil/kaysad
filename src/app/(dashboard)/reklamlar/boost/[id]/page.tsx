// src/app/(dashboard)/reklamlar/boost/[id]/page.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// ÖNE ÇIKARMA DETAYI
//
// ★ Reklam detayıyla TUTARLI: aynı düzen, aynı kart yapısı, aynı
//   teklif geçmişi tablosu. İki ekran arasında geçerken göz aynı
//   yerlere bakıyor.
//
// ★ Öne çıkarılan içeriğin kendisi de gösteriliyor (görsel + başlık),
//   çünkü boost'un konusu o içerik.
// ═══════════════════════════════════════════════════════════════════════

import Link from "next/link"
import { notFound } from "next/navigation"
import { fetchBoostDetail } from "@/actions/ad.actions"
import { PageHeader } from "@/components/PageHeader"
import { BoostEditPanel } from "@/components/BoostEditPanel"
import {
  Avatar, Badge, Card, CardTitle, EmptyState, ErrorBox, KeyValue, Stat,
} from "@/components/ui"
import { fmtDate, fmtNum, timeAgo } from "@/lib/utils"
import { panelGorsel } from "@/lib/storage-url"

export const dynamic = "force-dynamic"

interface Detail {
  talep: Record<string, unknown> | null
  sahip: Record<string, unknown> | null
  icerik: Record<string, unknown> | null
  analitik: {
    goruntulenme: number | null
    favori: number | null
    etkilesim: number | null
  }
  gunluk: { gun: string; gosterim: number; tiklama: number }[]
  gecmis: Record<string, unknown>[]
  slot: { kapasite: number; aktif: number; min_price: number }
  istatistik: {
    gosterim: number
    tiklama: number
    gunluk: { gun: string; gosterim: number; tiklama: number }[]
  }
}

/**
 * ★ Badge ve Stat FARKLI tone kümeleri kullanıyor — ikisi ayrı tutuluyor.
 *   Badge: live/off/scheduled/expired/danger/promo/neutral
 *   Stat:  default/accent/warn/danger/info/promo
 */
const DURUM: Record<string, {
  ad: string
  badge: "live" | "off" | "scheduled" | "expired" | "danger" | "promo" | "neutral"
  stat: "default" | "accent" | "warn" | "danger" | "info" | "promo"
}> = {
  pending:   { ad: "Bekliyor",     badge: "expired",   stat: "warn" },
  approved:  { ad: "Sırada",       badge: "scheduled", stat: "info" },
  active:    { ad: "Aktif",        badge: "live",      stat: "accent" },
  rejected:  { ad: "Reddedildi",   badge: "danger",    stat: "danger" },
  expired:   { ad: "Süresi doldu", badge: "off",       stat: "default" },
  cancelled: { ad: "İptal",        badge: "neutral",   stat: "default" },
}

const ICERIK_ADI: Record<string, string> = {
  listing: "İlan", discount: "İndirim", event: "Etkinlik",
}

const BOOST_ADI: Record<string, string> = {
  boost: "Öne Çıkar (kendi şehri)",
  super_boost: "Süper Öne Çıkar (tüm şehirler)",
}

/** İçerik kaydından başlık ve görsel çıkar — kolon adları projeye göre değişebiliyor */
function icerikOzeti(i: Record<string, unknown> | null): {
  baslik: string
  gorsel: string | null
} {
  if (!i) return { baslik: "İçerik bulunamadı", gorsel: null }

  const baslik =
    (i.title as string) ?? (i.baslik as string) ??
    (i.name as string) ?? (i.ad as string) ?? "Başlıksız"

  let gorsel: string | null = null
  for (const k of ["images", "image_url", "cover_url", "thumbnail_url", "kapak_url", "gorseller"]) {
    const v = i[k]
    if (typeof v === "string" && v.startsWith("http")) { gorsel = v; break }
    if (Array.isArray(v)) {
      const f = v.find((x) => typeof x === "string" && (x as string).startsWith("http"))
      if (f) { gorsel = f as string; break }
    }
  }

  return { baslik: String(baslik), gorsel }
}

/**
 * GÜNLÜK GRAFİK
 *
 * ★ Kütüphane yok — sadece yükseklik oranlı div'ler. Panelde tek bir
 *   grafik için 40 KB'lık bir paket yüklemeye değmez.
 */
function GunlukGrafik({
  veri,
}: {
  veri: { gun: string; gosterim: number; tiklama: number }[]
}) {
  const son = veri.slice(-30)
  const max = Math.max(1, ...son.map((g) => g.gosterim))

  return (
    <div>
      <div className="flex h-[120px] items-end gap-[3px]">
        {son.map((g) => (
          <div
            key={g.gun}
            className="group relative flex-1"
            title={`${fmtDate(g.gun)} — ${g.gosterim} gösterim, ${g.tiklama} tıklama`}
          >
            <div
              className="w-full rounded-sm bg-accent/45 transition group-hover:bg-accent/70"
              style={{ height: Math.max(3, (g.gosterim / max) * 112) }}
            />
            {/* Tıklama — gösterimin içinde koyu şerit */}
            {g.tiklama > 0 && (
              <div
                className="absolute bottom-0 w-full rounded-sm bg-accent"
                style={{ height: Math.max(2, (g.tiklama / max) * 112) }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[11.5px] text-faint">
        <span>{fmtDate(son[0].gun)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-accent/45" /> gösterim
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-accent" /> tıklama
          </span>
        </span>
        <span>{fmtDate(son[son.length - 1].gun)}</span>
      </div>
    </div>
  )
}

export default async function BoostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { detail, error } = await fetchBoostDetail(id)

  if (error) {
    return (
      <>
        <PageHeader
          back={{ href: "/reklamlar?durum=boost", label: "Öne çıkanlar" }}
          title="Öne çıkarma detayı"
        />
        <ErrorBox>{error}</ErrorBox>
      </>
    )
  }

  const d = detail as Detail | null
  if (!d?.talep) notFound()

  const b = d.talep
  const sahip = d.sahip
  const { baslik, gorsel } = icerikOzeti(d.icerik)

  const ist = d.istatistik ?? { gosterim: 0, tiklama: 0, gunluk: [] }
  const ctr = ist.gosterim > 0
    ? ((ist.tiklama / ist.gosterim) * 100).toFixed(1)
    : "0.0"

  const durum = DURUM[String(b.status)] ?? DURUM.pending
  const bos = Math.max(0, d.slot.kapasite - d.slot.aktif)

  const kalanGun = b.ends_at
    ? Math.max(0, Math.ceil(
        (new Date(String(b.ends_at)).getTime() - Date.now()) / 86400000
      ))
    : null

  return (
    <>
      <PageHeader
        back={{ href: "/reklamlar?durum=boost", label: "Öne çıkanlar" }}
        title={baslik}
      />

      {/* ── METRİKLER ── */}
      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Durum" value={durum.ad} tone={durum.stat} />
        <Stat label="Aylık" value={`${fmtNum(Number(b.monthly_price ?? 0))} ₺`} />
        <Stat
          label="Alan doluluğu"
          value={`${d.slot.aktif}/${d.slot.kapasite}`}
          tone={bos <= 0 ? "danger" : "default"}
        />
        <Stat
          label="Kalan gün"
          value={kalanGun !== null ? String(kalanGun) : "—"}
          tone={kalanGun !== null && kalanGun <= 7 ? "danger" : "default"}
        />
      </div>

      {/* ── PERFORMANS ── */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Gösterim" value={fmtNum(ist.gosterim)} />
        <Stat label="Tıklama" value={fmtNum(ist.tiklama)} />
        <Stat label="Tıklanma oranı" value={`%${ctr}`} />
      </div>

      {/* ── DÜZENLEME ── */}
      <div className="mb-5">
        <BoostEditPanel
          talep={{
            id: String(b.id),
            user_id: String(b.user_id),
            content_type: (
              b.content_type === "discount" ? "discount"
              : b.content_type === "event" ? "event"
              : "listing"
            ),
            content_id: String(b.content_id),
            boost_type: b.boost_type === "super_boost" ? "super_boost" : "boost",
            months: Number(b.months ?? 1),
            monthly_price: Number(b.monthly_price ?? 0),
            note: (b.note as string | null) ?? null,
            status: String(b.status ?? ""),
            reject_reason: (b.reject_reason as string | null) ?? null,
            min_price: d.slot.min_price,
          }}
        />
      </div>

      {/* ── ANALİTİK ── */}
      <div className="mb-5">
        <Card>
          <CardTitle>Analitik</CardTitle>
          <p className="mb-4 text-[12.5px] text-muted">
            Öne çıkarılan içeriğin toplam sayıları. Boost'un kendi sayacı
            yok — ölçülen şey içeriğin aldığı ilgi.
          </p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Görüntülenme"
              value={d.analitik.goruntulenme !== null ? fmtNum(d.analitik.goruntulenme) : "—"}
            />
            <Stat
              label="Favori"
              value={d.analitik.favori !== null ? fmtNum(d.analitik.favori) : "—"}
            />
            <Stat
              label="Etkileşim"
              value={d.analitik.etkilesim !== null ? fmtNum(d.analitik.etkilesim) : "—"}
            />
            <Stat
              label="Teklif sayısı"
              value={String(d.gecmis.length)}
            />
          </div>

          {/* Günlük grafik — veri varsa */}
          {d.gunluk.length > 0 ? (
            <div className="mt-5 border-t border-hairline pt-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-faint">
                Son {d.gunluk.length} gün · günlük gösterim
              </div>

              <div className="flex h-[90px] items-end gap-1">
                {(() => {
                  const max = Math.max(1, ...d.gunluk.map((g) => g.gosterim))
                  return d.gunluk.map((g) => (
                    <div key={g.gun} className="flex-1" title={`${g.gun}: ${g.gosterim}`}>
                      <div
                        className="rounded-sm bg-accent/35"
                        style={{ height: Math.max(3, (g.gosterim / max) * 84) }}
                      />
                    </div>
                  ))
                })()}
              </div>

              <div className="mt-2 flex justify-between text-[11px] text-faint">
                <span>{fmtDate(d.gunluk[0].gun)}</span>
                <span>{fmtDate(d.gunluk[d.gunluk.length - 1].gun)}</span>
              </div>
            </div>
          ) : (
            <p className="mt-4 border-t border-hairline pt-4 text-[12.5px] text-faint">
              Günlük gösterim verisi toplanmıyor. İçerik sayaçları
              yukarıda.
            </p>
          )}
        </Card>
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        {/* Öne çıkarılan içerik */}
        <Card className="lg:col-span-2">
          <CardTitle>Öne çıkarılan içerik</CardTitle>

          <div className="mb-4 flex items-start gap-4">
            <div className="flex h-[84px] w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-hairline bg-raised">
              {gorsel ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={panelGorsel(gorsel) ?? gorsel}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-[11px] text-faint">Görsel yok</span>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <Badge tone="neutral">{ICERIK_ADI[String(b.content_type)] ?? String(b.content_type)}</Badge>
              <div className="mt-2 text-[15px] font-semibold text-text">{baslik}</div>
              <div className="mt-1 break-all font-mono text-[11.5px] text-faint">
                {String(b.content_id)}
              </div>
            </div>
          </div>

          <div className="border-t border-hairline pt-3">
            <KeyValue label="Seviye" value={BOOST_ADI[String(b.boost_type)] ?? String(b.boost_type)} />
            <KeyValue label="Süre" value="1 ay" />
            <KeyValue label="Aylık tutar" value={`${fmtNum(Number(b.monthly_price ?? 0))} ₺`} />
            <KeyValue
              label="Taban fiyat"
              value={d.slot.min_price > 0 ? `${fmtNum(d.slot.min_price)} ₺` : "—"}
            />
            <KeyValue label="Başlangıç" value={b.starts_at ? fmtDate(String(b.starts_at)) : "—"} />
            <KeyValue label="Bitiş" value={b.ends_at ? fmtDate(String(b.ends_at)) : "—"} />
            <KeyValue label="Oluşturulma" value={fmtDate(String(b.created_at))} />
          </div>

          {b.note ? (
            <div className="mt-4 rounded-xl border border-hairline bg-raised p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">
                Talep notu
              </div>
              <p className="text-[13px] leading-relaxed text-muted">{String(b.note)}</p>
            </div>
          ) : null}

          {b.reject_reason ? (
            <div className="mt-4 rounded-xl border border-danger/30 bg-danger/[0.06] p-3">
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-danger">
                Red sebebi
              </div>
              <p className="text-[13px] leading-relaxed text-text">{String(b.reject_reason)}</p>
            </div>
          ) : null}
        </Card>

        {/* Talep sahibi */}
        <Card>
          <CardTitle>Talep sahibi</CardTitle>
          {sahip ? (
            <>
              <div className="mb-3 flex items-center gap-3">
                <Avatar
                  url={sahip.avatar_url as string | null}
                  name={sahip.username as string | null}
                  size={44}
                />
                <div className="min-w-0">
                  <Link
                    href={`/kullanicilar/${sahip.id}`}
                    className="block truncate text-[14px] font-semibold text-text hover:text-accent"
                  >
                    {String(sahip.username ?? "—")}
                  </Link>
                  <span className="block truncate text-[12px] text-muted">
                    {String(sahip.business_name ?? sahip.name ?? "")}
                  </span>
                </div>
              </div>
              <KeyValue label="E-posta" value={String(sahip.email ?? "—")} mono />
              <KeyValue label="Telefon" value={String(sahip.phone ?? "—")} mono />
              <KeyValue label="Şehir" value={String(sahip.sehir ?? "—")} />
              <div className="mt-3">
                <Link
                  href={`/kullanicilar/${sahip.id}`}
                  className="text-[13px] font-medium text-accent hover:underline"
                >
                  Kullanıcı sayfasına git
                </Link>
              </div>
            </>
          ) : (
            <EmptyState title="Kullanıcı bulunamadı" />
          )}
        </Card>
      </div>

      {/* ── GÜNLÜK GRAFİK ── */}
      <div className="mb-5">
        <Card>
          <CardTitle>Son 30 gün</CardTitle>
          {ist.gunluk.length === 0 ? (
            <EmptyState title="Henüz veri toplanmadı" />
          ) : (
            <GunlukGrafik veri={ist.gunluk} />
          )}
        </Card>
      </div>

      {/* ── TEKLİF GEÇMİŞİ ── */}
      <Card>
        <CardTitle>Teklif geçmişi ({d.gecmis.length})</CardTitle>

        {d.gecmis.length === 0 ? (
          <EmptyState title="Teklif kaydı yok" />
        ) : (
          <div className="space-y-2.5">
            {d.gecmis.map((g) => {
              const gd = DURUM[String(g.status)] ?? DURUM.pending
              const buMu = String(g.id) === String(b.id)

              return (
                <div
                  key={String(g.id)}
                  className={
                    "rounded-xl border p-3.5 " +
                    (buMu
                      ? "border-accent/40 bg-accent/[0.05]"
                      : "border-hairline bg-raised")
                  }
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={gd.badge}>{gd.ad}</Badge>
                    <span className="text-[12px] text-muted">
                      {String(g.offer_no)}. teklif
                    </span>
                    {buMu && (
                      <span className="text-[11.5px] font-semibold text-accent">
                        görüntülenen
                      </span>
                    )}
                    <span className="ml-auto text-[11.5px] text-faint">
                      {timeAgo(String(g.created_at))}
                    </span>
                  </div>

                  <div className="text-[15px] font-bold text-text">
                    {fmtNum(Number(g.monthly_price ?? 0))} ₺
                    <span className="ml-1.5 text-[12px] font-normal text-muted">/ ay</span>
                  </div>

                  {g.note ? (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
                      {String(g.note)}
                    </p>
                  ) : null}

                  {g.reject_reason ? (
                    <p className="mt-2 text-[12.5px] leading-relaxed text-danger">
                      {String(g.reject_reason)}
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </>
  )
}
