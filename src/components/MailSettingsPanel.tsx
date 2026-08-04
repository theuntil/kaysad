// src/components/MailSettingsPanel.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// MAİL AYARLARI
//
// ★ Şifreler panele maskeli geliyor (••••••••). Kaydederken maskeyi
//   silmezsen eskisi korunuyor — her seferinde yeniden yazmak gerekmiyor.
// ═══════════════════════════════════════════════════════════════════════

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  saveMailSettingsAction, testMailAction, testImapAction, saveMailTemplateAction,
  previewMailTemplate, resetMailTemplateAction,
  type MailTemplate,
} from "@/actions/mail.actions"
import type { MailSettings } from "@/lib/mailer"
import {
  Badge, Button, Card, CardTitle, ErrorBox, Field, Input, Segmented,
  Select, Spinner, SuccessBox, Switch, Textarea,
} from "@/components/ui"
import { cn } from "@/lib/utils"

export function MailSettingsPanel({
  settings, templates,
}: {
  settings: MailSettings | null
  templates: MailTemplate[]
}) {
  const router = useRouter()
  const [s, setS] = useState<Partial<MailSettings>>(settings ?? {})
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [secili, setSecili] = useState<MailTemplate | null>(templates[0] ?? null)

  async function kaydet() {
    setBusy("save"); setErr(null); setOk(null)
    const r = await saveMailSettingsAction(s as Record<string, unknown>)
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Kaydedilemedi."); return }
    setOk(r.message ?? "Kaydedildi.")
    router.refresh()
  }

  async function imapTest() {
    setBusy("imap"); setErr(null); setOk(null)
    const r = await testImapAction()
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "IMAP bağlantısı kurulamadı."); return }
    setOk(r.message ?? "Bağlantı başarılı.")
  }

  async function test() {
    setBusy("test"); setErr(null); setOk(null)
    const r = await testMailAction()
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Bağlantı kurulamadı."); return }
    setOk(r.message ?? "Bağlantı başarılı.")
  }

  async function sablonKaydet() {
    if (!secili) return
    setBusy("tpl"); setErr(null); setOk(null)
    const r = await saveMailTemplateAction({
      id: secili.id, subject: secili.subject, body_html: secili.body_html,
    })
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Kaydedilemedi."); return }
    setOk(r.message ?? "Şablon kaydedildi.")
    router.refresh()
  }

  const smtp = (s.provider ?? "smtp") === "smtp"

  /* ── Şablonu varsayılana döndür ── */
  const sablonSifirla = async () => {
    setBusy("sablon"); setErr(null)
    const r = await resetMailTemplateAction()
    setBusy(null)
    if (!r.ok) { setErr(r.error ?? "Sıfırlanamadı."); return }
    setS({ ...s, default_template: null })
    setOk("Varsayılan şablona dönüldü.")
    router.refresh()
  }

  /* ── Önizleme ──
     ★ Yeni sekmede açılıyor: iframe içinde göstermek karanlık mod
       medya sorgusunu doğru tetiklemiyor, gerçek görünüm kaybolur. */
  const onizle = async () => {
    const r = await previewMailTemplate()
    if (!r.ok) { setErr(r.error ?? "Önizleme alınamadı."); return }

    const w = window.open("", "_blank")
    if (!w) { setErr("Açılır pencere engellendi."); return }
    w.document.write(r.html)
    w.document.close()
  }

  return (
    <div className="space-y-5">
      {err && <ErrorBox>{err}</ErrorBox>}
      {ok && <SuccessBox>{ok}</SuccessBox>}

      {/* ── SUNUCU ── */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Mail sunucusu</CardTitle>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={test} disabled={busy !== null}>
              {busy === "test" && <Spinner />} Bağlantıyı test et
            </Button>
            <Button size="sm" onClick={kaydet} disabled={busy !== null}>
              {busy === "save" && <Spinner />} Kaydet
            </Button>
          </div>
        </div>

        <div className="space-y-4 max-w-form">
          <Switch
            checked={s.is_active === true}
            onChange={(v) => setS({ ...s, is_active: v })}
            label="Mail sistemi açık"
          />

          <Field label="Sağlayıcı">
            <Select
              value={s.provider ?? "smtp"}
              onChange={(e) => setS({ ...s, provider: e.target.value as MailSettings["provider"] })}
            >
              <option value="smtp">SMTP</option>
              <option value="resend">Resend</option>
              <option value="postmark">Postmark</option>
              <option value="sendgrid">SendGrid</option>
            </Select>
          </Field>

          {smtp ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sunucu">
                  <Input
                    value={s.smtp_host ?? ""}
                    onChange={(e) => setS({ ...s, smtp_host: e.target.value })}
                    placeholder="smtp.ornek.com"
                    spellCheck={false}
                  />
                </Field>
                <Field label="Port">
                  <Input
                    type="number"
                    value={String(s.smtp_port ?? 587)}
                    onChange={(e) => setS({ ...s, smtp_port: Number(e.target.value) })}
                  />
                </Field>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Kullanıcı adı">
                  <Input
                    value={s.smtp_user ?? ""}
                    onChange={(e) => setS({ ...s, smtp_user: e.target.value })}
                    spellCheck={false}
                  />
                </Field>
                <Field label="Şifre">
                  <Input
                    type="password"
                    value={s.smtp_pass ?? ""}
                    onChange={(e) => setS({ ...s, smtp_pass: e.target.value })}
                    placeholder="Değiştirmek istemiyorsan dokunma"
                  />
                </Field>
              </div>

              <Switch
                checked={s.smtp_secure === true}
                onChange={(v) => setS({ ...s, smtp_secure: v })}
                label="SSL/TLS (465 portu için)"
              />
            </>
          ) : (
            <Field label="API anahtarı">
              <Input
                type="password"
                value={s.api_key ?? ""}
                onChange={(e) => setS({ ...s, api_key: e.target.value })}
                placeholder="Değiştirmek istemiyorsan dokunma"
                spellCheck={false}
              />
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Gönderen adres">
              <Input
                value={s.from_email ?? ""}
                onChange={(e) => setS({ ...s, from_email: e.target.value })}
                placeholder="destek@kays.com.tr"
                spellCheck={false}
              />
            </Field>
            <Field label="Gönderen adı">
              <Input
                value={s.from_name ?? ""}
                onChange={(e) => setS({ ...s, from_name: e.target.value })}
                placeholder="Kays"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Yanıt adresi">
              <Input
                value={s.reply_to ?? ""}
                onChange={(e) => setS({ ...s, reply_to: e.target.value })}
                spellCheck={false}
              />
            </Field>
            <Field label="Günlük limit">
              <Input
                type="number"
                value={String(s.daily_limit ?? 2000)}
                onChange={(e) => setS({ ...s, daily_limit: Number(e.target.value) })}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* ── GELEN MAİL (IMAP) ── */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Gelen mail sunucusu (IMAP)</CardTitle>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={imapTest} disabled={busy !== null}>
              {busy === "imap" && <Spinner />} Bağlantıyı test et
            </Button>
            <Button size="sm" onClick={kaydet} disabled={busy !== null}>
              {busy === "save" && <Spinner />} Kaydet
            </Button>
          </div>
        </div>

        <div className="max-w-form space-y-4">
          <Switch
            checked={s.imap_enabled === true}
            onChange={(v) => setS({ ...s, imap_enabled: v })}
            label="Gelen mail açık"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="IMAP sunucusu">
              <Input
                value={s.imap_host ?? ""}
                onChange={(e) => setS({ ...s, imap_host: e.target.value })}
                placeholder="imap.hostinger.com"
                spellCheck={false}
              />
            </Field>
            <Field label="Port">
              <Input
                type="number"
                value={String(s.imap_port ?? 993)}
                onChange={(e) => setS({ ...s, imap_port: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kullanıcı adı">
              <Input
                value={s.imap_user ?? ""}
                onChange={(e) => setS({ ...s, imap_user: e.target.value })}
                placeholder="destek@kays.com.tr"
                spellCheck={false}
              />
            </Field>
            <Field label="Şifre">
              <Input
                type="password"
                value={s.imap_pass ?? ""}
                onChange={(e) => setS({ ...s, imap_pass: e.target.value })}
                placeholder="Değiştirmek istemiyorsan dokunma"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Klasör">
              <Input
                value={s.imap_folder ?? "INBOX"}
                onChange={(e) => setS({ ...s, imap_folder: e.target.value })}
                spellCheck={false}
              />
            </Field>
            <div className="flex items-end">
              <div className="w-full">
                <Switch
                  checked={s.imap_secure !== false}
                  onChange={(v) => setS({ ...s, imap_secure: v })}
                  label="SSL/TLS (993 portu)"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── VARSAYILAN ŞABLON ── */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Varsayılan HTML şablonu</CardTitle>
          <Button size="sm" onClick={kaydet} disabled={busy !== null}>
            {busy === "save" && <Spinner />} Kaydet
          </Button>
        </div>
        {/* ══ MARKA VE MAĞAZA ══
            ★ Şablonda GÖMÜLÜ değil. Adres değişince şablonu elle
              düzenlemek yerine buradan güncelleniyor. */}
        <div className="mb-5 space-y-4 rounded-xl border border-hairline bg-raised p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">
              Marka ve logo
            </div>
            {/* ★ Mağaza adresleri BURADA DEĞİL — Ayarlar → Uygulama
                bölümündeki `ios_store_url` / `android_store_url`
                alanlarından geliyor. Aynı bilgiyi iki yerde tutmak
                kaçınılmaz olarak ayrışmalarına yol açıyor. */}
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              Mağaza adresleri Uygulama ayarlarındaki App Store / Play
              Store alanlarından alınıyor.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Logo — aydınlık tema"
              hint="Tam URL, dosya yolu değil"
            >
              <Input
                value={s.logo_light_url ?? ""}
                onChange={(e) => setS({ ...s, logo_light_url: e.target.value })}
                placeholder="https://kays.business/kays.png"
                spellCheck={false}
              />
            </Field>

            <Field
              label="Logo — karanlık tema"
              hint="Koyu zeminde okunabilen sürüm"
            >
              <Input
                value={s.logo_dark_url ?? ""}
                onChange={(e) => setS({ ...s, logo_dark_url: e.target.value })}
                placeholder="https://kays.business/kays1.png"
                spellCheck={false}
              />
            </Field>



            <Field label="Site adresi">
              <Input
                value={s.site_url ?? ""}
                onChange={(e) => setS({ ...s, site_url: e.target.value })}
                placeholder="https://kays.business"
                spellCheck={false}
              />
            </Field>

            <Field label="Marka adı">
              <Input
                value={s.brand_name ?? ""}
                onChange={(e) => setS({ ...s, brand_name: e.target.value })}
                placeholder="Kays"
              />
            </Field>
          </div>
        </div>

        {/* ══ ŞABLON DURUMU ══
            ★ Şablon seçimi: veritabanında kayıt varsa O kullanılıyor,
              yoksa varsayılan. Eski bir şablon kayıtlıysa yeni
              tasarım hiç devreye girmiyor ve "değişiklik uygulanmadı"
              gibi görünüyor. Bu kutu hangisinin aktif olduğunu
              açıkça söylüyor. */}
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-raised px-4 py-3">
          {(s.default_template ?? "").trim() ? (
            <>
              <Badge tone="scheduled">Özel şablon aktif</Badge>
              <span className="flex-1 text-[12.5px] text-muted">
                Aşağıdaki şablon kullanılıyor. Yeni varsayılan tasarımı
                görmek için sıfırla.
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy !== null}
                onClick={() => { void sablonSifirla() }}
              >
                {busy === "sablon" && <Spinner />} Varsayılana dön
              </Button>
            </>
          ) : (
            <>
              <Badge tone="live">Varsayılan şablon</Badge>
              <span className="flex-1 text-[12.5px] text-muted">
                Karanlık mod uyumlu, logo ve mağaza düğmeli tasarım
                kullanılıyor.
              </span>
            </>
          )}

          <Button variant="ghost" size="sm" onClick={() => { void onizle() }}>
            Önizle
          </Button>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {["{{icerik}}", "{{konu}}", "{{logo}}", "{{imza}}"].map((v) => (
              <Badge key={v} tone="neutral">{v}</Badge>
            ))}
            <span className="ml-1 text-[11.5px] text-faint">
              Boş bırakırsan varsayılan şablon kullanılır
            </span>

            {/* ★ Alanı temizlemek "şablon yok" demek değil —
                "koddaki güncel varsayılanı kullan" demek. Eski bir
                şablon kayıtlıysa yeni tasarım hiç devreye girmiyor. */}
            {(s.default_template ?? "").trim().length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto"
                onClick={() => setS({ ...s, default_template: "" })}
              >
                Varsayılana dön
              </Button>
            )}
          </div>
          <Textarea
            value={s.default_template ?? ""}
            onChange={(e) => setS({ ...s, default_template: e.target.value })}
            className="min-h-[280px] font-mono text-[12px]"
            spellCheck={false}
          />
          <Field label="İmza (HTML)">
            <Textarea
              value={s.signature_html ?? ""}
              onChange={(e) => setS({ ...s, signature_html: e.target.value })}
              className="min-h-[80px] font-mono text-[12px]"
              spellCheck={false}
            />
          </Field>
        </div>
      </Card>

      {/* ── SİSTEM ŞABLONLARI ── */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CardTitle>Sistem şablonları</CardTitle>
          <Button size="sm" onClick={sablonKaydet} disabled={busy !== null || !secili}>
            {busy === "tpl" && <Spinner />} Şablonu kaydet
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <div className="overflow-hidden rounded-xl border border-hairline">
            <ul className="max-h-[360px] divide-y divide-hairline overflow-y-auto">
              {templates.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSecili({ ...t })}
                    className={cn(
                      "w-full px-3.5 py-2.5 text-left transition-colors",
                      secili?.id === t.id ? "bg-accent/10" : "hover:bg-white/[0.03]"
                    )}
                  >
                    <div className="truncate text-[12.5px] font-medium text-text">{t.ad}</div>
                    <div className="truncate font-mono text-[10.5px] text-faint">{t.key}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {secili && (
            <div className="space-y-3">
              <Field label="Konu">
                <Input
                  value={secili.subject}
                  onChange={(e) => setSecili({ ...secili, subject: e.target.value })}
                />
              </Field>
              <Field label="İçerik (HTML)">
                <Textarea
                  value={secili.body_html}
                  onChange={(e) => setSecili({ ...secili, body_html: e.target.value })}
                  className="min-h-[220px] font-mono text-[12px]"
                  spellCheck={false}
                />
              </Field>
              {secili.aciklama && (
                <p className="text-[11.5px] text-faint">{secili.aciklama}</p>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
