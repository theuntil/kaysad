// src/components/SendComposer.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// GÖNDERİM FORMU
//
// ┌─ DÜZEN ───────────────────────────────────────────────────────────┐
// │ Masaüstünde iki kolon: SOLDA form, SAĞDA canlı telefon önizlemesi  │
// │ (yapışkan). Tip ve kanal yan yana; içerik ve hedefleme yan yana.   │
// │ Mobilde tek kolon, önizleme içeriğin hemen altında.               │
// └───────────────────────────────────────────────────────────────────┘
//
// ┌─ İKİ HEDEF MODU ──────────────────────────────────────────────────┐
// │ "Kitle"      → şehir / hesap türü / platform filtreleriyle         │
// │ "Kişi seç"   → arayıp seçtiğin kullanıcılara (tek kişi de olur)    │
// │ Kişi modunda sayım ve sapma kontrolü yok — kimin alacağı kesin.    │
// └───────────────────────────────────────────────────────────────────┘
//
// ┌─ DEĞİŞKENLER ─────────────────────────────────────────────────────┐
// │ {ad} {kullanici_adi} {sehir} {eposta}                              │
// │ Doldurma SQL'de, ALICI BAŞINA yapılıyor. Önizlemedeki metin de     │
// │ sunucudan geliyor — "önizlemede güzeldi, gidince bozuldu" olmuyor. │
// └───────────────────────────────────────────────────────────────────┘

import { useEffect, useRef, useState } from "react"
import {
  previewAudienceAction, sendAction, renderMessageAction,
} from "@/actions/send.actions"
import { CityPicker } from "@/components/CityPicker"
import { PhonePreview } from "@/components/PhonePreview"
import { UserPicker } from "@/components/UserPicker"
import {
  Badge, Button, Card, ErrorBox, Field, Input, Modal, Section,
  Segmented, Select, Spinner, SuccessBox, Switch, Textarea, WarnBox,
} from "@/components/ui"
import type { QuickUser } from "@/actions/users.actions"
import type { SendChannel, SendType, SendPreview, SendAudience } from "@/lib/types.v3"

interface PopupOption { id: string; title: string }

const TYPE_META: Record<SendType, { label: string; hint: string }> = {
  promo:      { label: "Duyuru",     hint: "Kampanya, bilgilendirme" },
  earthquake: { label: "Acil uyarı", hint: "Sessiz saati aşar" },
  popup:      { label: "Popup",      hint: "Popup'a yönlendirir" },
}

const VARS: { key: string; label: string; ornek: string }[] = [
  { key: "{ad}",            label: "Ad",           ornek: "Ahmet Yılmaz" },
  { key: "{kullanici_adi}", label: "Kullanıcı adı", ornek: "ahmety" },
  { key: "{sehir}",         label: "Şehir",        ornek: "Ankara" },
  { key: "{eposta}",        label: "E-posta",      ornek: "ahmet@ornek.com" },
]

const VAR_RE = /\{(ad|kullanici_adi|sehir|eposta)\}/

export function SendComposer({
  popups, cityCounts,
}: {
  popups: PopupOption[]
  cityCounts: Record<string, number>
}) {
  /* ── içerik ── */
  const [type, setType] = useState<SendType>("promo")
  const [channel, setChannel] = useState<SendChannel>("both")
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [route, setRoute] = useState("")
  const [popupId, setPopupId] = useState("")

  /* ── hedefleme ── */
  const [mode, setMode] = useState<"kitle" | "kisi">("kitle")
  const [users, setUsers] = useState<QuickUser[]>([])
  const [cities, setCities] = useState<string[]>([])
  const [kitle, setKitle] = useState<"all" | "student" | "business">("all")
  const [platforms, setPlatforms] = useState<string[]>([])
  const [activeDays, setActiveDays] = useState<string>("")
  const [onlyActive, setOnlyActive] = useState(true)

  /* ── durum ── */
  const [preview, setPreview] = useState<SendPreview | null>(null)
  const [counting, setCounting] = useState(false)
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [confirmText, setConfirmText] = useState("")
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  /* ── önizleme metni (sunucuda doldurulmuş) ── */
  const [rendered, setRendered] = useState("")
  const renderTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const messageRef = useRef<HTMLTextAreaElement | null>(null)
  const kisiModu = mode === "kisi"
  const personalized = VAR_RE.test(message)

  const audience: SendAudience = {
    cities: cities.length ? cities : null,
    studentsOnly: kitle === "student",
    businessOnly: kitle === "business",
    onlyActive,
    platforms: platforms.length ? platforms : null,
    activeDays: activeDays ? Number(activeDays) : null,
  }

  /* Hedefleme değişince sayım geçersiz olur */
  useEffect(() => {
    setPreview(null)
  }, [cities, kitle, platforms, activeDays, onlyActive, channel, mode, users.length])

  /* Popup tipinde sadece-push mantıksız */
  useEffect(() => {
    if (type === "popup" && channel === "push") setChannel("both")
  }, [type, channel])

  /* Değişkenli metni sunucuda doldur (350 ms gecikmeli) */
  useEffect(() => {
    if (renderTimer.current) clearTimeout(renderTimer.current)
    if (!personalized || !message.trim()) { setRendered(""); return }

    renderTimer.current = setTimeout(async () => {
      const r = await renderMessageAction(message, kisiModu && users[0] ? users[0].user_id : null)
      if (r.ok && r.text) setRendered(r.text)
    }, 350)

    return () => { if (renderTimer.current) clearTimeout(renderTimer.current) }
  }, [message, personalized, kisiModu, users])

  function insertVar(v: string) {
    const el = messageRef.current
    if (!el) { setMessage((m) => m + v); return }
    const start = el.selectionStart ?? message.length
    const end = el.selectionEnd ?? message.length
    const next = message.slice(0, start) + v + message.slice(end)
    setMessage(next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(start + v.length, start + v.length)
    })
  }

  async function runPreview() {
    setCounting(true); setErr(null); setOk(null)
    const r = await previewAudienceAction(audience)
    setCounting(false)
    if (!r.ok || !r.preview) { setErr(r.error ?? "Sayım yapılamadı."); return }
    setPreview(r.preview)
  }

  async function doSend() {
    setSending(true); setErr(null); setOk(null)

    const r = await sendAction({
      type,
      channel,
      title: title || null,
      message,
      popupId: type === "popup" ? popupId || null : null,
      route: route || null,
      audience,
      userIds: kisiModu ? users.map((u) => u.user_id) : null,
      expected: {
        kullanici: kisiModu ? users.length : preview?.kullanici ?? 0,
        cihaz: kisiModu
          ? users.reduce((s, u) => s + u.push_device_count, 0)
          : preview?.push_cihaz ?? 0,
      },
    })

    setSending(false)
    setConfirm(false)

    if (!r.ok) { setErr(r.error ?? "Gönderim başarısız."); return }

    setOk(r.message ?? "Gönderildi.")
    setPreview(null)
    setMessage(""); setTitle(""); setRoute("")
    setUsers([])
  }

  const acilUyari = type === "earthquake"
  const onayKelimesi = acilUyari ? "GONDER" : null
  const onayHazir = !onayKelimesi || confirmText.trim().toUpperCase() === onayKelimesi

  const hedefSayi = kisiModu
    ? (channel === "push" ? users.reduce((s, u) => s + u.push_device_count, 0) : users.length)
    : (channel === "push" ? preview?.push_cihaz ?? 0 : preview?.kullanici ?? 0)

  const gonderilebilir =
    (kisiModu ? users.length > 0 : !!preview) &&
    hedefSayi > 0 &&
    !sending &&
    (type !== "popup" ? message.trim().length > 0 : !!popupId)

  const previewBody = personalized && rendered ? rendered : message

  return (
    <div className="space-y-4">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* ══════════════ SOL: FORM ══════════════ */}
        <div className="min-w-0 space-y-4">
          {/* 1 + 2 yan yana */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Section step={1} wide title="Gönderim tipi">
              <div className="space-y-1.5">
                {(Object.keys(TYPE_META) as SendType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={
                      "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors " +
                      (type === t
                        ? "border-accent/40 bg-accent/10"
                        : "border-hairline bg-raised hover:border-white/20")
                    }
                  >
                    <span>
                      <span className="block text-[13.5px] font-semibold text-text">
                        {TYPE_META[t].label}
                      </span>
                      <span className="block text-[11.5px] text-faint">{TYPE_META[t].hint}</span>
                    </span>
                    {type === t && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className="h-4 w-4 text-accent">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>

              {type === "popup" && (
                <div className="mt-3">
                  <Field label="Hangi popup" required>
                    <Select value={popupId} onChange={(e) => setPopupId(e.target.value)}>
                      <option value="">— Popup seç —</option>
                      {popups.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                    </Select>
                  </Field>
                </div>
              )}
            </Section>

            <Section step={2} wide title="Nereye gitsin">
              <div className="space-y-1.5">
                {([
                  { v: "both",  l: "İkisi de",       h: "Uygulama içi + telefon" },
                  { v: "inapp", l: "Uygulama içi",   h: "Telefon çalmaz" },
                  { v: "push",  l: "Sadece push",    h: "Uygulamada iz kalmaz" },
                ] as const).map((o) => {
                  const kapali = type === "popup" && o.v === "push"
                  return (
                    <button
                      key={o.v}
                      type="button"
                      disabled={kapali}
                      onClick={() => setChannel(o.v)}
                      className={
                        "flex w-full items-center justify-between rounded-xl border px-3.5 py-2.5 text-left transition-colors " +
                        (channel === o.v
                          ? "border-accent/40 bg-accent/10"
                          : "border-hairline bg-raised hover:border-white/20") +
                        (kapali ? " cursor-not-allowed opacity-40" : "")
                      }
                    >
                      <span>
                        <span className="block text-[13.5px] font-semibold text-text">{o.l}</span>
                        <span className="block text-[11.5px] text-faint">{o.h}</span>
                      </span>
                      {channel === o.v && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className="h-4 w-4 text-accent">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>

              {acilUyari && (
                <div className="mt-3">
                  <WarnBox>
                    Acil uyarı sessiz saatleri aşar — gece 03.00&apos;te bile telefon çalar.
                  </WarnBox>
                </div>
              )}
            </Section>
          </div>

          {/* 3) İÇERİK */}
          <Section step={3} wide title="İçerik">
            <div className="space-y-3.5">
              {channel !== "inapp" && (
                <Field
                  label="Push başlığı"
                >
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={80}
                    placeholder={acilUyari ? "ACİL UYARI" : "Kays"}
                  />
                </Field>
              )}

              <div>
                <Field
                  label="Mesaj"
                  required={type !== "popup"}
                >
                  <Textarea
                    ref={messageRef}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={300}
                    placeholder={acilUyari
                      ? "Ankara'da 5.2 büyüklüğünde deprem. Güvenli alanda kalın."
                      : "Sayın {ad}, {sehir} şehrinde bu hafta 10 yeni etkinlik var!"}
                  />
                </Field>

                {/* Değişkenler */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11.5px] text-faint">Değişken ekle:</span>
                  {VARS.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insertVar(v.key)}
                      title={`${v.label} — örnek: ${v.ornek}`}
                      className="rounded-lg border border-hairline bg-raised px-2 py-1 font-mono text-[11px] text-muted transition-colors hover:border-accent/40 hover:text-text"
                    >
                      {v.key}
                    </button>
                  ))}
                </div>
              </div>

              {channel !== "inapp" && type !== "popup" && (
                <Field label="Tıklayınca nereye gitsin">
                  <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="/food" />
                </Field>
              )}
            </div>
          </Section>

          {/* 4) HEDEFLEME */}
          <Section step={4} wide title="Kime gitsin">
            <div className="space-y-4">
              <Segmented
                value={mode}
                onChange={(v) => setMode(v)}
                options={[
                  { value: "kitle", label: "Kitle",    hint: "Filtrelerle" },
                  { value: "kisi",  label: "Kişi seç", hint: "Arayıp seç" },
                ]}
              />

              {kisiModu ? (
                <div className="space-y-2">
                  <UserPicker selected={users} onChange={setUsers} multiple />
                  {users.length > 0 && channel !== "inapp" &&
                    users.every((u) => u.push_device_count === 0) && (
                    <WarnBox>
                      Seçtiğin kullanıcı(lar)ın push alabilen cihazı yok. Bu kanalda
                      telefona hiçbir şey gitmez — &quot;Uygulama içi&quot; seçmen gerekir.
                    </WarnBox>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <div className="mb-2 text-[13px] font-medium text-text">Hesap türü</div>
                    <Segmented
                      value={kitle}
                      onChange={(v) => setKitle(v)}
                      options={[
                        { value: "all",      label: "Herkes" },
                        { value: "student",  label: "Öğrenci" },
                        { value: "business", label: "İşletme" },
                      ]}
                    />
                  </div>

                  <div>
                    <div className="mb-2 text-[13px] font-medium text-text">Şehir</div>
                    <CityPicker value={cities} onChange={setCities} counts={cityCounts} />
                  </div>

                  {channel !== "inapp" && (
                    <div className="grid gap-3.5 sm:grid-cols-2">
                      <Field label="Platform">
                        <div className="flex gap-2">
                          {["ios", "android"].map((p) => {
                            const on = platforms.includes(p)
                            return (
                              <button
                                key={p}
                                type="button"
                                onClick={() => setPlatforms(on ? platforms.filter((x) => x !== p) : [...platforms, p])}
                                className={
                                  "h-11 flex-1 rounded-xl border text-[13px] font-medium transition-colors " +
                                  (on
                                    ? "border-accent/40 bg-accent/10 text-text"
                                    : "border-hairline bg-raised text-muted hover:text-text")
                                }
                              >
                                {p === "ios" ? "iOS" : "Android"}
                              </button>
                            )
                          })}
                        </div>
                      </Field>

                      <Field label="Son giriş">
                        <Select value={activeDays} onChange={(e) => setActiveDays(e.target.value)}>
                          <option value="">Sınır yok</option>
                          <option value="7">Son 7 gün</option>
                          <option value="30">Son 30 gün</option>
                          <option value="90">Son 90 gün</option>
                        </Select>
                      </Field>
                    </div>
                  )}

                  <Switch
                    checked={onlyActive}
                    onChange={setOnlyActive}
                    label="Banlıları hariç tut"
                  />
                </>
              )}
            </div>
          </Section>
        </div>

        {/* ══════════════ SAĞ: ÖNİZLEME (yapışkan) ══════════════ */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-text">Canlı önizleme</span>
              <Badge tone={channel === "inapp" ? "neutral" : channel === "push" ? "scheduled" : "live"}>
                {channel === "both" ? "İkisi de" : channel === "inapp" ? "Uygulama içi" : "Sadece push"}
              </Badge>
            </div>

            <PhonePreview
              title={title || (acilUyari ? "ACİL UYARI" : "Kays")}
              body={previewBody}
              channel={channel}
              urgent={acilUyari}
            />
          </Card>
        </div>
      </div>

      {/* ══════════════ SAYIM + GÖNDER ══════════════ */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            {kisiModu ? (
              users.length === 0 ? (
                <p className="text-[13px] text-muted">Yukarıdan en az bir kullanıcı seç.</p>
              ) : (
                <div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-2xl font-bold tabular-nums text-text">{users.length}</span>
                    <span className="text-[13px] text-muted">kişiye gidecek</span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-faint">
                    {users.reduce((s, u) => s + u.push_device_count, 0)} push alabilen cihaz
                  </p>
                </div>
              )
            ) : !preview ? (
              <p className="text-[13px] leading-relaxed text-muted">
                Göndermeden önce kaç kişiye gideceğini gör. Sayım yapılmadan gönderim açılmaz.
              </p>
            ) : (
              <div>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-bold tabular-nums text-text">
                    {hedefSayi.toLocaleString("tr")}
                  </span>
                  <span className="text-[13px] text-muted">
                    {channel === "push" ? "cihaza push" : "kullanıcıya bildirim"}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-4 text-[12px] text-faint">
                  <span>Uygulama içi: {preview.kullanici.toLocaleString("tr")}</span>
                  <span>Push: {preview.push_kullanici.toLocaleString("tr")} kişi · {preview.push_cihaz.toLocaleString("tr")} cihaz</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {channel !== "inapp" && !preview.push_acik && <Badge tone="danger">Push sistemi kapalı</Badge>}
                  {channel !== "inapp" && preview.sessiz_saat && !acilUyari && (
                    <Badge tone="expired">Sessiz saat — push beklemede</Badge>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            {!kisiModu && (
              <Button variant="secondary" onClick={runPreview} disabled={counting}>
                {counting && <Spinner />}
                {preview ? "Sayımı yenile" : "Kaç kişiye gidecek?"}
              </Button>
            )}
            <Button
              onClick={() => { setConfirmText(""); setConfirm(true) }}
              disabled={!gonderilebilir}
            >
              Gönder
            </Button>
          </div>
        </div>
      </Card>

      {/* ══════════════ ONAY ══════════════ */}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Gönderimi onayla"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={sending}>Vazgeç</Button>
            <Button
              variant={acilUyari ? "danger" : "primary"}
              onClick={doSend}
              disabled={sending || !onayHazir}
            >
              {sending && <Spinner />}
              {acilUyari ? "Acil uyarıyı gönder" : "Onayla ve gönder"}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-[13px] leading-relaxed">
          <div className="rounded-xl border border-hairline bg-raised p-3.5">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <Badge tone={acilUyari ? "danger" : "promo"}>{TYPE_META[type].label}</Badge>
              <Badge tone="neutral">
                {channel === "both" ? "Uygulama içi + push"
                  : channel === "inapp" ? "Sadece uygulama içi" : "Sadece push"}
              </Badge>
              {personalized && <Badge tone="live">Kişiselleştirilmiş</Badge>}
            </div>
            {channel !== "inapp" && (
              <p className="text-[13px] font-semibold text-text">
                {title || (acilUyari ? "ACİL UYARI" : "Kays")}
              </p>
            )}
            <p className="mt-0.5 text-[13px] text-muted">
              {previewBody || "(popup başlığı kullanılacak)"}
            </p>
            {personalized && (
              <p className="mt-2 border-t border-hairline pt-2 text-[11.5px] text-faint">
                Yukarıdaki metin {kisiModu && users[0] ? `${users[0].username ?? "seçili kullanıcı"} için` : "örnek değerlerle"} doldurulmuş hâli. Her alıcı kendi bilgisiyle görecek.
              </p>
            )}
          </div>

          <p className="text-muted">
            Hedef: <strong className="text-text">{hedefSayi.toLocaleString("tr")}</strong>{" "}
            {channel === "push" ? "cihaz" : "kullanıcı"}
            {kisiModu
              ? ` · seçili ${users.length} kişi`
              : ` · ${cities.length ? `${cities.length} il` : "tüm Türkiye"}${
                  kitle === "student" ? " · sadece öğrenci" : kitle === "business" ? " · sadece işletme" : ""}`}
          </p>

          {kisiModu && users.length <= 5 && (
            <ul className="space-y-1">
              {users.map((u) => (
                <li key={u.user_id} className="text-[12.5px] text-faint">
                  · {u.username ?? u.user_id.slice(0, 8)}
                  {u.push_device_count === 0 && channel !== "inapp" && " (push alamıyor)"}
                </li>
              ))}
            </ul>
          )}

          {onayKelimesi && (
            <Field
              label={`Onaylamak için "${onayKelimesi}" yaz`}
            >
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={onayKelimesi}
                autoFocus
              />
            </Field>
          )}
        </div>
      </Modal>
    </div>
  )
}
