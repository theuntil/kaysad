"use client"

// ═══════════════════════════════════════════════════════════════════════
// UYGULAMA AYARLARI
//
// ★ Bakım modu parola istiyor — yanlışlıkla tıklamayla tüm uygulamayı
//   kapatmak mümkün olmamalı.
//
// ★ Sınırlar matris: 4 içerik tipi × 4 rol. is_boosted olan kullanıcı
//   "boostlu" sütunundaki değeri alıyor.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  saveConfigAction, setMaintenanceAction, saveLimitsAction,
  type AppConfig, type ContentLimit, type ConfigBundle,
} from "@/actions/config.actions"
import {
  Badge, Button, Card, CardTitle, ErrorBox, Field, Input, Modal,
  Spinner, SuccessBox, Switch, Textarea, WarnBox,
} from "@/components/ui"
import { fmtDate } from "@/lib/utils"
import { cn } from "@/lib/utils"

const ICERIK: { key: ContentLimit["content_type"]; ad: string; tip: string; not: string }[] = [
  { key: "post",     ad: "Gönderi",   tip: "Günlük",       not: "Bugün kaç gönderi paylaşabilir" },
  { key: "listing",  ad: "İlan",      tip: "Aktif",        not: "Aynı anda kaç açık ilanı olabilir" },
  { key: "discount", ad: "İndirim",   tip: "Aktif",        not: "Aynı anda kaç açık indirimi olabilir" },
  { key: "event",    ad: "Etkinlik",  tip: "Aktif",        not: "Aynı anda kaç açık etkinliği olabilir" },
]

const ROLLER: { key: ContentLimit["role"]; ad: string; kisa: string }[] = [
  { key: "user",             ad: "Kullanıcı",         kisa: "User" },
  { key: "business",         ad: "İşletme",           kisa: "Business" },
  { key: "boosted_user",     ad: "Boostlu kullanıcı", kisa: "User+" },
  { key: "boosted_business", ad: "Boostlu işletme",   kisa: "Business+" },
]

/** İkonlu servis anahtarı */
function ServisKutu({
  ad, aciklama, acik, onChange, icon, disabled,
}: {
  ad: string
  aciklama: string
  acik: boolean
  onChange: (v: boolean) => void
  icon: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!acik)}
      disabled={disabled}
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
        acik
          ? "border-accent/35 bg-accent/[0.07]"
          : "border-hairline bg-raised hover:border-white/20",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
          acik ? "bg-accent/15 text-accent" : "bg-white/[0.06] text-faint"
        )}
      >
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold text-text">{ad}</span>
          <Badge tone={acik ? "live" : "off"}>{acik ? "Açık" : "Kapalı"}</Badge>
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted">{aciklama}</span>
      </span>
    </button>
  )
}

const ICON = {
  mail: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="2" y="4" width="20" height="16" rx="2.5" /><path d="m2 7 10 6 10-6" />
    </svg>
  ),
  phone: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" />
    </svg>
  ),
  push: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8" /><path d="M10.3 21a2 2 0 0 0 3.4 0" />
    </svg>
  ),
  ads: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
    </svg>
  ),
  user: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M19 8v6M22 11h-6" />
    </svg>
  ),
}

export function SettingsPanel({
  bundle, adsImpact,
}: {
  bundle: ConfigBundle
  adsImpact?: {
    aktif_reklam: number; aktif_boost: number
    bugun_gosterim: number; aylik_gelir: number
  } | null
}) {
  const router = useRouter()
  const [c, setC] = useState<AppConfig>(bundle.config)
  const [limits, setLimits] = useState<ContentLimit[]>(bundle.limits)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  /* bakım penceresi */
  const [bakimModal, setBakimModal] = useState(false)
  const [parola, setParola] = useState("")
  const [bakimMesaj, setBakimMesaj] = useState(bundle.config.maintenance_message ?? "")

  function limitAl(ct: string, role: string): ContentLimit | undefined {
    return limits.find((l) => l.content_type === ct && l.role === role)
  }

  function limitDegistir(ct: string, role: string, patch: Partial<ContentLimit>) {
    setLimits((prev) =>
      prev.map((l) =>
        l.content_type === ct && l.role === role ? { ...l, ...patch } : l
      )
    )
  }

  async function kaydet(alanlar: Partial<AppConfig>) {
    setBusy("config"); setErr(null); setOk(null)
    const r = await saveConfigAction(alanlar as Record<string, unknown>)
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Kaydedilemedi."); return }
    setOk(r.message ?? "Kaydedildi.")
    router.refresh()
  }

  async function limitKaydet() {
    setBusy("limits"); setErr(null); setOk(null)
    const r = await saveLimitsAction(limits)
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Kaydedilemedi."); return }
    setOk(r.message ?? "Sınırlar kaydedildi.")
    router.refresh()
  }

  async function bakimUygula() {
    setBusy("bakim"); setErr(null); setOk(null)
    const r = await setMaintenanceAction({
      enabled: !c.maintenance,
      password: parola,
      message: bakimMesaj || null,
    })
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "İşlem başarısız."); return }
    setBakimModal(false); setParola("")
    setC({ ...c, maintenance: !c.maintenance })
    setOk(r.message ?? "Tamam.")
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      {/* ══════ BAKIM MODU ══════ */}
      <Card>
        <CardTitle>Bakım modu</CardTitle>

        <div
          className={cn(
            "flex flex-wrap items-center gap-4 rounded-2xl border p-4",
            c.maintenance
              ? "border-danger/35 bg-danger/[0.07]"
              : "border-hairline bg-raised"
          )}
        >
          <span
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl",
              c.maintenance ? "bg-danger/15 text-danger" : "bg-accent/12 text-accent"
            )}
          >
            {c.maintenance ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <rect x="3" y="11" width="18" height="11" rx="2.5" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
                <rect x="3" y="11" width="18" height="11" rx="2.5" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-semibold text-text">
                {c.maintenance ? "Uygulama bakımda" : "Uygulama açık"}
              </span>
              <Badge tone={c.maintenance ? "danger" : "live"}>
                {c.maintenance ? "Kapalı" : "Yayında"}
              </Badge>
            </span>
            <span className="mt-0.5 block text-[12px] text-muted">
              {c.maintenance
                ? "Kullanıcılar uygulamayı kullanamıyor, içerik oluşturulamıyor."
                : "Her şey normal çalışıyor."}
            </span>
            {c.maintenance && c.maintenance_at && (
              <span className="mt-1 block text-[11.5px] text-faint">
                {fmtDate(c.maintenance_at)} · {c.maintenance_by ?? "—"}
              </span>
            )}
          </span>

          <Button
            variant={c.maintenance ? "primary" : "danger"}
            onClick={() => { setParola(""); setBakimModal(true) }}
            disabled={busy !== null}
          >
            {c.maintenance ? "Bakımı kapat" : "Bakıma al"}
          </Button>
        </div>

        <div className="mt-4 max-w-form">
          <Field label="Bakım ekranında gösterilecek mesaj">
            <Textarea
              value={c.maintenance_message ?? ""}
              onChange={(e) => setC({ ...c, maintenance_message: e.target.value })}
            />
          </Field>
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => kaydet({ maintenance_message: c.maintenance_message })}
              disabled={busy !== null}
            >
              {busy === "config" && <Spinner />} Mesajı kaydet
            </Button>
          </div>
        </div>
      </Card>

      {/* ══════ SERVİSLER ══════ */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Alt sistemler</CardTitle>
          <Button
            size="sm"
            onClick={() => kaydet({
              mail_service: c.mail_service,
              phone_service: c.phone_service,
              push_service: c.push_service,
              ads_service: c.ads_service,
              registration_open: c.registration_open,
            })}
            disabled={busy !== null}
          >
            {busy === "config" && <Spinner />} Kaydet
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ServisKutu
            ad="Mail servisi"
            aciklama="E-posta doğrulama ve değiştirme servisi"
            acik={c.mail_service}
            onChange={(v) => setC({ ...c, mail_service: v })}
            icon={ICON.mail}
            disabled={c.maintenance}
          />
          <ServisKutu
            ad="Telefon servisi"
            aciklama="SMS ile telefon doğrulama servisi"
            acik={c.phone_service}
            onChange={(v) => setC({ ...c, phone_service: v })}
            icon={ICON.phone}
            disabled={c.maintenance}
          />
          <ServisKutu
            ad="Push bildirimi"
            aciklama="Telefona bildirim gönderimi"
            acik={c.push_service}
            onChange={(v) => setC({ ...c, push_service: v })}
            icon={ICON.push}
            disabled={c.maintenance}
          />
          <ServisKutu
            ad="Reklamlar"
            aciklama="Uygulamada reklam gösterimi"
            acik={c.ads_service}
            onChange={(v) => setC({ ...c, ads_service: v })}
            icon={ICON.ads}
            disabled={c.maintenance}
          />
          <ServisKutu
            ad="Yeni kayıt"
            aciklama="Yeni kullanıcı kaydı alınsın mı"
            acik={c.registration_open}
            onChange={(v) => setC({ ...c, registration_open: v })}
            icon={ICON.user}
            disabled={c.maintenance}
          />
        </div>

        {c.maintenance && (
          <div className="mt-3">
            <WarnBox>
              Bakım modu açıkken tüm servisler zaten kapalı sayılıyor.
            </WarnBox>
          </div>
        )}

        {/* ★ Reklam anahtarı kapatılınca ne olacağı — somut sayılarla */}
        {adsImpact && !c.ads_service && (
          <div className="mt-3">
            <WarnBox>
              <strong>Reklamlar kapalı.</strong> Uygulamada{" "}
              {adsImpact.aktif_reklam} aktif reklam ve {adsImpact.aktif_boost} öne
              çıkarma gizleniyor. Gösterim sayaçları da işlemiyor — reklam
              verene yanlış rapor gitmesin diye. Süreleri işlemeye devam ediyor;
              anahtarı açtığında hepsi geri gelir.
            </WarnBox>
          </div>
        )}

        {adsImpact && c.ads_service && adsImpact.aktif_reklam > 0 && (
          <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
            Reklamlar kapatılırsa {adsImpact.aktif_reklam} aktif reklam ve{" "}
            {adsImpact.aktif_boost} öne çıkarma uygulamada görünmez olur.
          </p>
        )}
      </Card>

      {/* ══════ SÜRÜM ══════ */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Uygulama sürümü</CardTitle>
          <Button
            size="sm"
            onClick={() => kaydet({
              app_version: c.app_version,
              min_version: c.min_version,
              force_update: c.force_update,
              update_message: c.update_message,
              ios_store_url: c.ios_store_url,
              android_store_url: c.android_store_url,
            })}
            disabled={busy !== null}
          >
            {busy === "config" && <Spinner />} Kaydet
          </Button>
        </div>

        <div className="max-w-form space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Güncel sürüm">
              <Input
                value={c.app_version ?? ""}
                onChange={(e) => setC({ ...c, app_version: e.target.value })}
                placeholder="1.2.0"
                spellCheck={false}
              />
            </Field>
            <Field label="En düşük çalışabilir sürüm">
              <Input
                value={c.min_version ?? ""}
                onChange={(e) => setC({ ...c, min_version: e.target.value })}
                placeholder="1.0.0"
                spellCheck={false}
              />
            </Field>
          </div>

          <Switch
            checked={c.force_update}
            onChange={(v) => setC({ ...c, force_update: v })}
            label="Zorunlu güncelleme"
          />

          <Field label="Güncelleme mesajı">
            <Textarea
              value={c.update_message ?? ""}
              onChange={(e) => setC({ ...c, update_message: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="App Store adresi">
              <Input
                value={c.ios_store_url ?? ""}
                onChange={(e) => setC({ ...c, ios_store_url: e.target.value })}
                spellCheck={false}
              />
            </Field>
            <Field label="Play Store adresi">
              <Input
                value={c.android_store_url ?? ""}
                onChange={(e) => setC({ ...c, android_store_url: e.target.value })}
                spellCheck={false}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* ══════ SINIRLAR ══════ */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>İçerik sınırları</CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-[11.5px] text-faint">
              {bundle.boosted_user_count} boostlu kullanıcı
            </span>
            <Button size="sm" onClick={limitKaydet} disabled={busy !== null}>
              {busy === "limits" && <Spinner />} Sınırları kaydet
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {ICERIK.map((ic) => (
            <div key={ic.key} className="rounded-2xl border border-hairline bg-raised p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-text">{ic.ad}</span>
                <Badge tone={ic.tip === "Günlük" ? "promo" : "neutral"}>{ic.tip}</Badge>
                <span className="text-[11.5px] text-faint">{ic.not}</span>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                {ROLLER.map((rl) => {
                  const l = limitAl(ic.key, rl.key)
                  if (!l) return null
                  const boostlu = rl.key.startsWith("boosted")

                  return (
                    <div
                      key={rl.key}
                      className={cn(
                        "rounded-xl border px-3 py-2.5",
                        boostlu ? "border-accent/25 bg-accent/[0.05]" : "border-hairline bg-surface"
                      )}
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-[11.5px] font-medium text-muted">{rl.ad}</span>
                        {boostlu && (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3 text-accent">
                            <path d="m13 2-9 12h7l-1 8 9-12h-7z" />
                          </svg>
                        )}
                      </div>

                      {l.is_allowed ? (
                        <Input
                          type="number"
                          min="0"
                          value={String(l.limit_value)}
                          onChange={(e) =>
                            limitDegistir(ic.key, rl.key, {
                              limit_value: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                          className="h-9 text-[14px] font-semibold"
                        />
                      ) : (
                        <div className="flex h-9 items-center rounded-xl border border-hairline bg-raised px-3 text-[12.5px] text-faint">
                          İzin yok
                        </div>
                      )}

                      <label className="mt-1.5 flex cursor-pointer items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={l.is_allowed}
                          onChange={(e) =>
                            limitDegistir(ic.key, rl.key, { is_allowed: e.target.checked })
                          }
                          className="h-3.5 w-3.5 cursor-pointer accent-accent"
                        />
                        <span className="text-[11px] text-faint">İzinli</span>
                      </label>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* ══════ BAKIM ONAYI ══════ */}
      <Modal
        open={bakimModal}
        onClose={() => setBakimModal(false)}
        title={c.maintenance ? "Bakım modunu kapat" : "Bakım moduna al"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBakimModal(false)} disabled={busy !== null}>
              Vazgeç
            </Button>
            <Button
              variant={c.maintenance ? "primary" : "danger"}
              onClick={bakimUygula}
              disabled={busy !== null || !parola}
            >
              {busy === "bakim" && <Spinner />}
              {c.maintenance ? "Bakımı kapat" : "Bakıma al"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {!c.maintenance && (
            <WarnBox>
              Bakım modunda kullanıcılar uygulamayı kullanamaz; gönderi, ilan,
              indirim ve etkinlik oluşturulamaz. Mail, telefon ve push servisleri
              de kapanır.
            </WarnBox>
          )}

          {!c.maintenance && (
            <Field label="Bakım ekranı mesajı">
              <Textarea value={bakimMesaj} onChange={(e) => setBakimMesaj(e.target.value)} />
            </Field>
          )}

          <Field label="Panel parolan" required>
            <Input
              type="password"
              value={parola}
              onChange={(e) => setParola(e.target.value)}
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && parola) void bakimUygula() }}
            />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
