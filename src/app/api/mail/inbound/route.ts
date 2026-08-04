// src/app/api/mail/inbound/route.ts
//
// ═══════════════════════════════════════════════════════════════════════
// GELEN MAİL WEBHOOK'U
//
// ★ NEDEN IMAP DEĞİL: IMAP kalıcı bir TCP bağlantısı gerektirir; Next.js
//   request/response modelinde bu mümkün değil. Üretimde doğru yöntem
//   sağlayıcının inbound webhook'u — mail geldiği anda buraya POST edilir.
//
// Desteklenen biçimler: Resend, Postmark, SendGrid ve genel JSON.
// Sağlayıcı ne gönderirse göndersin ortak alanlara indirgeniyor.
//
// Kurulum: sağlayıcı panelinde inbound webhook adresini
//   https://<panel>/api/mail/inbound?secret=<inbound_secret>
// olarak ayarla.
// ═══════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

export const dynamic = "force-dynamic"
export const maxDuration = 30

interface Normalized {
  message_id: string | null
  from_email: string
  from_name: string | null
  to_email: string | null
  subject: string | null
  body_text: string | null
  body_html: string | null
  attachments: unknown
  headers: unknown
}

/** "Ad Soyad <mail@ornek.com>" → { ad, email } */
function parseAddress(v: unknown): { name: string | null; email: string } {
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>
    const email = String(o.email ?? o.address ?? o.Email ?? "")
    const name = o.name ?? o.Name ?? null
    if (email) return { name: name ? String(name) : null, email: email.toLowerCase() }
  }
  const s = String(v ?? "")
  const m = s.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim() || null, email: m[2].trim().toLowerCase() }
  return { name: null, email: s.trim().toLowerCase() }
}

function normalize(body: Record<string, unknown>): Normalized | null {
  // Postmark
  if (body.From !== undefined || body.FromFull !== undefined) {
    const f = parseAddress(body.FromFull ?? body.From)
    return {
      message_id: (body.MessageID as string) ?? null,
      from_email: f.email,
      from_name: f.name,
      to_email: String(body.To ?? "") || null,
      subject: (body.Subject as string) ?? null,
      body_text: (body.TextBody as string) ?? null,
      body_html: (body.HtmlBody as string) ?? null,
      attachments: body.Attachments ?? null,
      headers: body.Headers ?? null,
    }
  }

  // SendGrid inbound parse
  if (body.envelope !== undefined && body.from !== undefined) {
    const f = parseAddress(body.from)
    return {
      message_id: null,
      from_email: f.email,
      from_name: f.name,
      to_email: String(body.to ?? "") || null,
      subject: (body.subject as string) ?? null,
      body_text: (body.text as string) ?? null,
      body_html: (body.html as string) ?? null,
      attachments: null,
      headers: body.headers ?? null,
    }
  }

  // Resend / genel JSON
  const data = (body.data ?? body) as Record<string, unknown>
  const fromRaw = data.from ?? data.sender ?? data.From
  if (!fromRaw) return null

  const f = parseAddress(fromRaw)
  if (!f.email) return null

  return {
    message_id: (data.message_id ?? data.messageId ?? data.id) as string ?? null,
    from_email: f.email,
    from_name: f.name,
    to_email: Array.isArray(data.to) ? String(data.to[0]) : (data.to as string) ?? null,
    subject: (data.subject as string) ?? null,
    body_text: (data.text ?? data.body_text ?? data.plain) as string ?? null,
    body_html: (data.html ?? data.body_html) as string ?? null,
    attachments: data.attachments ?? null,
    headers: data.headers ?? null,
  }
}

export async function POST(req: NextRequest) {
  try {
    const sb = getSupabaseAdmin()

    const { data: sData } = await sb
      .from("mail_settings")
      .select("inbound_enabled, inbound_secret")
      .eq("id", 1)
      .maybeSingle()

    const s = sData as { inbound_enabled: boolean | null; inbound_secret: string | null } | null

    if (!s?.inbound_enabled) {
      return NextResponse.json({ error: "Gelen mail kapalı" }, { status: 403 })
    }

    // ★ Doğrulama: secret query'de ya da başlıkta olabilir
    const gelen =
      req.nextUrl.searchParams.get("secret") ??
      req.headers.get("x-mail-secret") ??
      ""

    if (!s.inbound_secret || gelen !== s.inbound_secret) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })
    }

    const raw = await req.json().catch(() => null)
    if (!raw || typeof raw !== "object") {
      return NextResponse.json({ error: "Geçersiz gövde" }, { status: 400 })
    }

    const m = normalize(raw as Record<string, unknown>)
    if (!m) {
      return NextResponse.json({ error: "Gönderen çözümlenemedi" }, { status: 400 })
    }

    // ★ message_id benzersiz: sağlayıcı aynı maili tekrar gönderirse
    //   çift kayıt oluşmuyor.
    const { error } = await sb.from("mails").insert({
      message_id: m.message_id,
      from_email: m.from_email,
      from_name: m.from_name,
      to_email: m.to_email,
      subject: m.subject,
      body_text: m.body_text,
      body_html: m.body_html,
      attachments: m.attachments,
      headers: m.headers,
    })

    if (error) {
      // Tekrar eden mail — sorun değil
      if (error.code === "23505") {
        return NextResponse.json({ ok: true, duplicate: true })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Hata" },
      { status: 500 }
    )
  }
}
