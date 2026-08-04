// src/lib/mailer.ts
//
// ═══════════════════════════════════════════════════════════════════════
// MAİL GÖNDERİMİ
//
// Dört sağlayıcı destekleniyor. Hepsi aynı arayüzü döndürüyor, böylece
// kuyruk worker'ı hangi sağlayıcı olduğunu bilmek zorunda değil.
//
// ★ SMTP için nodemailer, diğerleri HTTP API. Sağlayıcı değişince
//   kuyruk kodu değişmiyor.
// ═══════════════════════════════════════════════════════════════════════

import nodemailer from "nodemailer"

export interface MailSettings {
  provider: "smtp" | "resend" | "postmark" | "sendgrid"
  smtp_host: string | null
  smtp_port: number | null
  smtp_secure: boolean | null
  smtp_user: string | null
  smtp_pass: string | null
  api_key: string | null
  from_email: string | null
  from_name: string | null
  reply_to: string | null
  is_active: boolean | null
  daily_limit: number | null
  default_template: string | null
  signature_html: string | null
  inbound_secret: string | null
  inbound_enabled: boolean | null
  // ★ IMAP — Hostinger gibi klasik sunucularda webhook yerine bu kullanılıyor
  // ★ Şablon ayarları — logo URL, mağaza adresleri, marka
  app_store_url?: string | null
  play_store_url?: string | null
  logo_light_url?: string | null
  logo_dark_url?: string | null
  site_url?: string | null
  brand_name?: string | null
  imap_host?: string | null
  imap_port?: number | null
  imap_secure?: boolean | null
  imap_user?: string | null
  imap_pass?: string | null
  imap_folder?: string | null
  imap_enabled?: boolean | null
  imap_last_uid?: number | null
  imap_last_sync?: string | null
}

export interface SendResult {
  ok: boolean
  providerId?: string
  error?: string
}

export interface OutgoingMail {
  to: string
  toName?: string | null
  subject: string
  html?: string | null
  text?: string | null
}

/**
 * Şablonu içerikle doldurur.
 * {{icerik}} {{konu}} {{logo}} {{imza}} yerleştirilir.
 */
export function wrapTemplate(
  template: string | null,
  params: { icerik: string; konu: string; logo?: string; imza?: string | null }
): string {
  if (!template) return params.icerik
  return template
    .replaceAll("{{icerik}}", params.icerik)
    .replaceAll("{{konu}}", params.konu)
    .replaceAll("{{logo}}", params.logo ?? "")
    .replaceAll("{{imza}}", params.imza ?? "")
}

/** HTML'den kaba düz metin — text/plain alternatifi için */
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function settingsReady(s: MailSettings | null): { ok: boolean; reason?: string } {
  if (!s) return { ok: false, reason: "Mail ayarları okunamadı." }
  if (!s.is_active) return { ok: false, reason: "Mail sistemi kapalı." }
  if (!s.from_email) return { ok: false, reason: "Gönderen adresi tanımlı değil." }

  if (s.provider === "smtp") {
    if (!s.smtp_host || !s.smtp_user || !s.smtp_pass) {
      return { ok: false, reason: "SMTP sunucu bilgileri eksik." }
    }
  } else if (!s.api_key) {
    return { ok: false, reason: `${s.provider} için API anahtarı eksik.` }
  }

  return { ok: true }
}

/* ═══════════════ SMTP ═══════════════ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedTransport: any = null
let cachedKey = ""

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getTransport(s: MailSettings): any {
  // ★ Bağlantıyı önbelleğe alıyoruz: her mail için yeni TLS el sıkışması
  //   yapmak toplu gönderimde ciddi yavaşlık demek.
  const key = `${s.smtp_host}:${s.smtp_port}:${s.smtp_user}`
  if (cachedTransport && cachedKey === key) return cachedTransport

  cachedTransport = nodemailer.createTransport({
    host: s.smtp_host!,
    port: s.smtp_port ?? 587,
    secure: s.smtp_secure ?? false,
    auth: { user: s.smtp_user!, pass: s.smtp_pass! },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  })
  cachedKey = key
  return cachedTransport
}

async function sendSmtp(s: MailSettings, m: OutgoingMail): Promise<SendResult> {
  try {
    const t = getTransport(s)
    const info = await t.sendMail({
      from: s.from_name ? `"${s.from_name}" <${s.from_email}>` : s.from_email!,
      to: m.toName ? `"${m.toName}" <${m.to}>` : m.to,
      replyTo: s.reply_to ?? undefined,
      subject: m.subject,
      html: m.html ?? undefined,
      text: m.text ?? (m.html ? htmlToText(m.html) : undefined),
    })
    return { ok: true, providerId: info.messageId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SMTP hatası" }
  }
}

/* ═══════════════ HTTP SAĞLAYICILAR ═══════════════ */

async function sendResend(s: MailSettings, m: OutgoingMail): Promise<SendResult> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${s.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: s.from_name ? `${s.from_name} <${s.from_email}>` : s.from_email,
        to: [m.to],
        reply_to: s.reply_to ?? undefined,
        subject: m.subject,
        html: m.html ?? undefined,
        text: m.text ?? undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (data as { message?: string }).message ?? `HTTP ${res.status}` }
    }
    return { ok: true, providerId: (data as { id?: string }).id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Resend hatası" }
  }
}

async function sendPostmark(s: MailSettings, m: OutgoingMail): Promise<SendResult> {
  try {
    const res = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        "X-Postmark-Server-Token": s.api_key ?? "",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        From: s.from_name ? `${s.from_name} <${s.from_email}>` : s.from_email,
        To: m.to,
        ReplyTo: s.reply_to ?? undefined,
        Subject: m.subject,
        HtmlBody: m.html ?? undefined,
        TextBody: m.text ?? undefined,
        MessageStream: "outbound",
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, error: (data as { Message?: string }).Message ?? `HTTP ${res.status}` }
    }
    return { ok: true, providerId: (data as { MessageID?: string }).MessageID }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Postmark hatası" }
  }
}

async function sendSendgrid(s: MailSettings, m: OutgoingMail): Promise<SendResult> {
  try {
    const content: { type: string; value: string }[] = []
    if (m.text) content.push({ type: "text/plain", value: m.text })
    if (m.html) content.push({ type: "text/html", value: m.html })

    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${s.api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: m.to, name: m.toName ?? undefined }] }],
        from: { email: s.from_email, name: s.from_name ?? undefined },
        reply_to: s.reply_to ? { email: s.reply_to } : undefined,
        subject: m.subject,
        content: content.length ? content : [{ type: "text/plain", value: "" }],
      }),
    })
    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      return { ok: false, error: txt.slice(0, 200) || `HTTP ${res.status}` }
    }
    return { ok: true, providerId: res.headers.get("x-message-id") ?? undefined }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "SendGrid hatası" }
  }
}

export async function sendMail(s: MailSettings, m: OutgoingMail): Promise<SendResult> {
  const hazir = settingsReady(s)
  if (!hazir.ok) return { ok: false, error: hazir.reason }

  switch (s.provider) {
    case "resend":   return sendResend(s, m)
    case "postmark": return sendPostmark(s, m)
    case "sendgrid": return sendSendgrid(s, m)
    default:         return sendSmtp(s, m)
  }
}

/** Ayarları test et — gerçek mail göndermeden bağlantı doğrula */
export async function verifyMail(s: MailSettings): Promise<SendResult> {
  const hazir = settingsReady({ ...s, is_active: true })
  if (!hazir.ok) return { ok: false, error: hazir.reason }

  if (s.provider === "smtp") {
    try {
      const t = getTransport(s)
      await t.verify()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "SMTP bağlantısı kurulamadı" }
    }
  }

  // HTTP sağlayıcılarda anahtar doğrulaması için hafif bir istek yok;
  // gerçek gönderim testi ile doğrulanıyor.
  return { ok: true }
}
