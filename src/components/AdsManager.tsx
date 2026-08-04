// src/components/AdsManager.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// REKLAM YÖNETİMİ
//
// ★ KAPASİTE KURALI: alan doluyken "Onayla" dediğinde kampanya yayına
//   ALINMIYOR, 'approved' olarak bekliyor. Panel bunu uyarı olarak
//   gösteriyor: önce mevcut reklamı pasife almalısın. Kural SQL'de,
//   panel sadece sonucu aktarıyor — iki yerde kural tutmuyoruz.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  approveAdAction, rejectAdAction, pauseAdAction, resumeAdAction,
  type AdRow, type AdCounts,
} from "@/actions/ad.actions"
import {
  Avatar, Badge, Button, EmptyState, ErrorBox, Field, Modal, Spinner,
  SuccessBox, Textarea, WarnBox,
} from "@/components/ui"
import { fmtNum, timeAgo } from "@/lib/utils"
import { panelGorsel } from "@/lib/storage-url"

const DURUM: Record<string, { ad: string; tone: "live" | "expired" | "off" | "danger" | "neutral" | "promo" }> = {
  pending:      { ad: "Bekliyor",         tone: "expired" },
  approved:     { ad: "Onaylı (sırada)",  tone: "promo" },
  active:       { ad: "Yayında",          tone: "live" },
  rejected:     { ad: "Reddedildi",       tone: "off" },
  paused:       { ad: "Pasif",            tone: "neutral" },
  expired:      { ad: "Süresi doldu",     tone: "neutral" },
  cancelled:    { ad: "İptal",            tone: "off" },
  edit_pending: { ad: "Düzenleme onayı",  tone: "danger" },
}

export function AdsManager({ items, counts }: { items: AdRow[]; counts: AdCounts | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [reject, setReject] = useState<AdRow | null>(null)
  const [reason, setReason] = useState("")

  async function calistir(id: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(id); setErr(null); setOk(null)
    const r = await fn()
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "İşlem başarısız."); return }
    if (r.message) setOk(r.message)
    router.refresh()
  }

  async function reddet() {
    if (!reject) return
    setBusy(reject.id); setErr(null); setOk(null)
    const r = await rejectAdAction(reject.id, reason)
    setBusy(null); setReject(null); setReason("")
    if (!r.ok) { setErr(r.error ?? "Reddedilemedi."); return }
    setOk("Reklam reddedildi.")
    router.refresh()
  }

  if (items.length === 0) {
    return <EmptyState title="Reklam bulunamadı" />
  }

  return (
    <div className="space-y-3">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <ul className="space-y-3">
        {items.map((a) => {
          const d = DURUM[a.status] ?? { ad: a.status, tone: "neutral" as const }
          const alan = counts?.alanlar?.find((s) => s.key === a.slot_key)
          const alanDolu = alan ? alan.aktif >= alan.capacity : false

          return (
            /*
              ★ KART TAMAMEN TIKLANABİLİR.
                Ayrı "Detay" düğmesi kaldırıldı — kart zaten tek bir
                kaydı temsil ediyor, üstüne tıklamak beklenen davranış.

                Uygulama yöntemi: `<Link>` kartın üstüne yayılmış
                görünmez bir katman (`absolute inset-0`). İçerideki
                onay/red düğmeleri `relative z-10` ile üstte kalıyor,
                yani onlara tıklamak detaya GÖTÜRMÜYOR.

                Alternatifi (tüm kartı Link'e sarmak) geçersiz HTML
                üretirdi: <a> içinde <button> iç içe geçemez.
            */
            <li
              key={a.id}
              className="group relative overflow-hidden rounded-2xl border border-hairline bg-surface transition-colors hover:border-accent/35"
            >
              <Link
                href={`/reklamlar/${a.id}`}
                aria-label={`${a.title} detayı`}
                className="absolute inset-0 z-0"
              />
              {/*
                ★ SADELEŞTİRİLDİ. Eski hâlde üç sütun, altı rozet ve iç
                  içe kutular vardı; göz nereye bakacağını bilemiyordu.

                  Yeni düzen tek bir okuma çizgisi kuruyor:
                    görsel → başlık → kim, nerede, ne kadar → işlemler

                  Rozet sayısı ikiye indi (durum + alan). Teklif sayısı ve
                  düzenleme uyarısı alt satıra metin olarak indi — bilgi
                  kaybolmadı, gürültü azaldı.
              */}
              <div className="flex gap-3.5 p-4">
                {/* Görsel */}
                <div className="shrink-0">
                  {a.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={panelGorsel(a.image_url) ?? a.image_url}
                      alt=""
                      className="h-[76px] w-[76px] rounded-xl border border-hairline object-cover"
                    />
                  ) : (
                    <div className="flex h-[76px] w-[76px] items-center justify-center rounded-xl border border-hairline bg-raised text-[10.5px] text-faint">
                      görsel yok
                    </div>
                  )}
                </div>

                {/* Ana bilgi */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Durum + alan — sadece iki rozet */}
                      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                        <Badge tone={d.tone}>{d.ad}</Badge>
                        <span className="text-[12px] text-muted">{a.slot_ad}</span>
                        <span className="text-[11.5px] text-faint">·</span>
                        <span className="text-[11.5px] text-faint">{timeAgo(a.created_at)}</span>
                      </div>

                      {/* ★ Ayrı bağlantı değil — kart zaten tıklanabilir.
                          İç içe <a> hem gereksiz hem kafa karıştırıcı. */}
                      <div className="truncate text-[15px] font-semibold text-text transition-colors group-hover:text-accent">
                        {a.title}
                      </div>

                      {/* Tek satır meta — kim, nereye, ne kadar kaldı */}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                        {/* ★ z-10: kart bağlantısının ÜSTÜNDE — kullanıcıya
                            tıklayınca reklam detayına değil profile gidiyor */}
                        <Link
                          href={`/kullanicilar/${a.advertiser_id}`}
                          className="relative z-10 flex items-center gap-1.5 hover:text-accent"
                        >
                          <Avatar url={a.advertiser_avatar} name={a.advertiser_username} size={16} />
                          {a.advertiser_username ?? "bilinmiyor"}
                        </Link>

                        {a.status === "active" && a.kalan_gun !== null && (
                          <span className={a.kalan_gun <= 7 ? "text-warn" : undefined}>
                            {a.kalan_gun} gün kaldı
                          </span>
                        )}

                        {a.status === "active" && (
                          <span>
                            {fmtNum(a.gosterim)} gösterim · {fmtNum(a.tiklama)} tıklama
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Fiyat — kutusuz, sağa yaslı */}
                    <div className="shrink-0 text-right">
                      <div className="text-[17px] font-bold tabular-nums leading-none text-text">
                        {fmtNum(a.monthly_price)} ₺
                      </div>
                      <div className="mt-1 text-[11px] text-faint">
                        aylık · {a.months} ay
                      </div>
                    </div>
                  </div>

                  {/* Dikkat çekmesi gerekenler — sadece varsa */}
                  {(a.bekleyen_duzenleme > 0 || a.offer_count > 1 || a.reject_reason) && (
                    <div className="mt-2 space-y-1">
                      {a.bekleyen_duzenleme > 0 && (
                        <p className="text-[12px] text-warn">Düzenleme onayı bekliyor</p>
                      )}
                      {a.offer_count > 1 && (
                        <p className="text-[12px] text-faint">{a.offer_count}. teklif</p>
                      )}
                      {a.reject_reason && (
                        <p className="text-[12px] text-danger">Red: {a.reject_reason}</p>
                      )}
                    </div>
                  )}

                  {/* İşlemler
                      ★ z-10: kartın üstündeki görünmez bağlantı
                        katmanının ÜSTÜNDE kalıyorlar. Yoksa "Onayla"ya
                        basınca detay sayfası açılırdı. */}
                  <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">

                    {(a.status === "pending" || a.status === "approved") && (
                      <>
                        <Button
                          size="sm"
                          disabled={busy === a.id}
                          onClick={() => calistir(a.id, () => approveAdAction(a.id))}
                        >
                          {busy === a.id && <Spinner />}
                          {a.status === "approved" ? "Yayına al" : "Onayla"}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busy === a.id}
                          onClick={() => { setReason(""); setReject(a) }}
                        >
                          Reddet
                        </Button>
                      </>
                    )}

                    {(a.status === "active" || a.status === "edit_pending") && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy === a.id}
                        onClick={() => calistir(a.id, () => pauseAdAction(a.id))}
                      >
                        Pasife al
                      </Button>
                    )}

                    {a.status === "paused" && (
                      <Button
                        size="sm"
                        disabled={busy === a.id}
                        onClick={() => calistir(a.id, () => resumeAdAction(a.id))}
                      >
                        Yayına al
                      </Button>
                    )}

                  </div>

                  {a.status === "approved" && alanDolu && (
                    <p className="text-[11px] leading-relaxed text-danger">
                      {a.slot_ad} dolu — önce mevcut reklamı pasife al.
                    </p>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      <Modal
        open={!!reject}
        onClose={() => setReject(null)}
        title="Reklamı reddet"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReject(null)} disabled={!!busy}>Vazgeç</Button>
            <Button variant="danger" onClick={reddet} disabled={!!busy || !reason.trim()}>
              {busy && <Spinner />} Reddet
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Red sebebi" required>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus maxLength={400} />
          </Field>
          <WarnBox>
            Sebep reklam verene gösterilir ve yeni teklif gönderebilir.
          </WarnBox>
        </div>
      </Modal>
    </div>
  )
}
