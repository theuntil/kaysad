// src/actions/mail.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// MAİL YÖNETİMİ
//
// ★ Kuyruk mimarisi: tetikleyiciler ve panel mail_queue'ya yazar,
//   drainMailQueue() gönderir. Tetikleyicinin içinde SMTP beklemek
//   kullanıcı kaydını yavaşlatırdı.
//
// ★ Şifreler panele MASKELİ geliyor (••••). Kaydederken boş bırakırsan
//   eskisi korunuyor — her seferinde yeniden yazmak zorunda değilsin.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import {
  imzaBlogu, sablonHazirla, type SablonKaynak,
} from "@/lib/mail-sablon"
import {
  sendMail, verifyMail, wrapTemplate, htmlToText,
  type MailSettings, type OutgoingMail,
} from "@/lib/mailer"
import { fetchNewMails, testImap } from "@/lib/imap"

export interface MailStats {
  gelen_toplam: number
  gelen_okunmamis: number
  giden_bekleyen: number
  giden_gonderilen: number
  giden_hata: number
  bugun_gonderilen: number
  ayarli: boolean | null
  gunluk_limit: number | null
}

export interface MailRow {
  id: string
  from_email: string
  from_name: string | null
  to_email: string | null
  subject: string | null
  body_text: string | null
  is_read: boolean
  is_starred: boolean
  is_archived: boolean
  matched_user_id: string | null
  match_score: number | null
  match_reason: string | null
  matched_username: string | null
  matched_avatar: string | null
  received_at: string
}

export interface MailTemplate {
  id: string
  key: string
  ad: string
  subject: string
  body_html: string
  is_system: boolean
  aciklama: string | null
}

/* ═══════════════ AYARLAR ═══════════════ */

/**
 * ŞABLON KAYNAĞI
 *
 * ★ Mağaza adresleri `app_config` tablosundan geliyor:
 *     ios_store_url     → App Store rozeti
 *     android_store_url → Google Play rozeti
 *
 *   `mail_settings` içinde ikinci bir kopya tutmuyoruz. Aynı bilgiyi
 *   iki yerde tutmak kaçınılmaz olarak birbirinden ayrılmalarına yol
 *   açıyor — biri güncellenip diğeri unutuluyor.
 *
 * ★ `app_config` okunamazsa mail yine gidiyor, sadece rozetler
 *   indirme sayfasına düşüyor.
 */
async function sablonKaynagi(
  s: MailSettings | null
): Promise<SablonKaynak> {
  const temel: SablonKaynak = {
    default_template: s?.default_template ?? null,
    logo_light_url: s?.logo_light_url ?? null,
    logo_dark_url: s?.logo_dark_url ?? null,
    site_url: s?.site_url ?? null,
    brand_name: s?.brand_name ?? null,
  }

  try {
    const sb = getSupabaseAdmin()
    const { data } = await sb
      .from("app_config")
      .select("ios_store_url, android_store_url")
      .limit(1)
      .maybeSingle()

    const c = data as {
      ios_store_url?: string | null
      android_store_url?: string | null
    } | null

    return {
      ...temel,
      ios_store_url: c?.ios_store_url ?? null,
      android_store_url: c?.android_store_url ?? null,
    }
  } catch {
    return temel
  }
}

export async function fetchMailSettings(): Promise<{
  settings: MailSettings | null; error?: string
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from("mail_settings").select("*").eq("id", 1).maybeSingle()
    if (error) return { settings: null, error: error.message }

    const s = data as MailSettings | null
    if (!s) return { settings: null }

    // ★ Sırları panele göndermiyoruz; sadece "dolu mu" bilgisi gidiyor
    return {
      settings: {
        ...s,
        smtp_pass: s.smtp_pass ? "••••••••" : null,
        api_key: s.api_key ? "••••••••" : null,
        imap_pass: s.imap_pass ? "••••••••" : null,
        inbound_secret: s.inbound_secret ? "••••••••" : null,
      },
    }
  } catch (e) {
    return { settings: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function saveMailSettingsAction(
  patch: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    // Maskeli değer geldiyse gönderme — SQL tarafı boşu "koru" olarak yorumluyor
    const temiz = { ...patch }
    for (const k of ["smtp_pass", "api_key", "imap_pass", "inbound_secret"]) {
      if (temiz[k] === "••••••••") delete temiz[k]
    }

    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_save_mail_settings", { p_patch: temiz })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub, action: "mail_settings" as never,
      targetType: "mail", detail: { alanlar: Object.keys(temiz) },
    })

    revalidatePath("/mail")
    return { ok: true, message: "Ayarlar kaydedildi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/** Gerçek ayarlarla bağlantı testi (maskesiz okuma sunucuda) */
export async function testMailAction(): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data } = await sb.from("mail_settings").select("*").eq("id", 1).maybeSingle()
    const s = data as MailSettings | null
    if (!s) return { ok: false, error: "Ayar bulunamadı." }

    const r = await verifyMail(s)
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, message: "Bağlantı başarılı." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ GELEN KUTUSU ═══════════════ */

export async function fetchMailStats(): Promise<MailStats | null> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data } = await sb.rpc("admin_mail_stats")
    return (data ?? null) as MailStats | null
  } catch {
    return null
  }
}

export async function fetchMails(params: {
  filter?: string
  query?: string | null
  limit?: number
  offset?: number
}): Promise<{ items: MailRow[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_mails", {
      p_filter: params.filter ?? "inbox",
      p_query: params.query?.trim() || null,
      p_limit: params.limit ?? 50,
      p_offset: params.offset ?? 0,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as MailRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function fetchMailDetail(id: string): Promise<{ detail: unknown; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_mail_detail", { p_id: id })
    if (error) return { detail: null, error: error.message }
    return { detail: data }
  } catch (e) {
    return { detail: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function flagMailAction(
  id: string, field: "is_read" | "is_starred" | "is_archived", value: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_mail_flag", { p_id: id, p_field: field, p_value: value })
    if (error) return { ok: false, error: error.message }
    revalidatePath("/mail")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ GÖNDERİM ═══════════════ */

export async function sendMailAction(params: {
  to: string
  subject: string
  body: string
  mode: "html" | "text"
  useTemplate: boolean
  userId?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const to = params.to.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, error: "Geçersiz alıcı adresi." }
  }
  if (!params.subject.trim()) return { ok: false, error: "Konu zorunlu." }
  if (!params.body.trim()) return { ok: false, error: "İçerik boş olamaz." }

  try {
    const sb = getSupabaseAdmin()
    const { data: sData } = await sb.from("mail_settings").select("*").eq("id", 1).maybeSingle()
    const s = sData as MailSettings | null
    if (!s?.is_active) return { ok: false, error: "Mail sistemi kapalı. Ayarlardan aç." }

    let html: string | null = null
    let text: string | null = null

    if (params.mode === "html") {
      /* ★ Ayarlarda şablon tanımlı değilse varsayılan üretiliyor.
         Mağaza adresleri ve logolar ayarlardan geliyor — şablonda
         gömülü değil, adres değişince şablonu elle düzenlemek
         gerekmiyor. */
      const sablon = sablonHazirla(await sablonKaynagi(s))

      html = params.useTemplate
        ? wrapTemplate(sablon, {
            icerik: params.body,
            konu: params.subject,
            logo: "",
            imza: imzaBlogu(s.signature_html),
          })
        : params.body
      text = htmlToText(html)
    } else {
      text = params.body
      html = null
    }

    const mail: OutgoingMail = { to, subject: params.subject.trim(), html, text }
    const r = await sendMail(s, mail)

    // ★ Gönderilen mail kuyruğa da yazılıyor: geçmiş tek yerde tutulsun
    await sb.from("mail_queue").insert({
      to_email: to,
      user_id: params.userId ?? null,
      subject: params.subject.trim(),
      body_html: html,
      body_text: text,
      status: r.ok ? "sent" : "failed",
      error: r.ok ? null : r.error,
      provider_id: r.providerId ?? null,
      attempts: 1,
      sent_at: r.ok ? new Date().toISOString() : null,
    })

    await logAudit({
      actor: session.sub, action: "mail_send" as never,
      targetType: "mail", targetId: params.userId ?? to,
      detail: { konu: params.subject, basarili: r.ok },
    })

    revalidatePath("/mail")

    if (!r.ok) return { ok: false, error: r.error ?? "Gönderilemedi." }
    return { ok: true, message: "Mail gönderildi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * ★ KUYRUK WORKER'I — tetikleyicilerin yazdığı mailleri gönderir.
 *   /api/mail/drain ve panel yoklaması çağırıyor.
 */
export async function drainMailQueue(limit = 30): Promise<{
  ok: boolean; sent: number; failed: number; error?: string
}> {
  try {
    const sb = getSupabaseAdmin()

    const { data: sData } = await sb.from("mail_settings").select("*").eq("id", 1).maybeSingle()
    const s = sData as MailSettings | null
    if (!s?.is_active) return { ok: true, sent: 0, failed: 0 }

    // Günlük limit kontrolü
    const bugun = new Date(); bugun.setHours(0, 0, 0, 0)
    const { count } = await sb
      .from("mail_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("sent_at", bugun.toISOString())

    if ((count ?? 0) >= (s.daily_limit ?? 2000)) {
      return { ok: true, sent: 0, failed: 0, error: "Günlük mail limiti doldu." }
    }

    const { data, error } = await sb.rpc("admin_claim_mail_batch", { p_limit: limit })
    if (error) return { ok: false, sent: 0, failed: 0, error: error.message }

    const batch = (data ?? []) as {
      id: string; to_email: string; subject: string
      body_html: string | null; body_text: string | null
    }[]

    let sent = 0, failed = 0

    /* ★ Şablon döngü DIŞINDA bir kez üretiliyor — her mail için
       `app_config` sorgusu atmak 50 maillik partide 50 gereksiz
       sorgu demek olurdu. */
    const sablon = sablonHazirla(await sablonKaynagi(s))

    for (const m of batch) {
      /* ★ Eskiden `s.default_template` HAM kullanılıyordu — ayarlarda
         şablon yoksa mail sarmalanmadan gidiyordu. Normal mailler
         buradan geçtiği için yeni tasarım hiç görünmüyordu. */
      const html = m.body_html
        ? wrapTemplate(sablon, {
            icerik: m.body_html,
            konu: m.subject,
            logo: "",
            imza: imzaBlogu(s.signature_html),
          })
        : null

      const r = await sendMail(s, {
        to: m.to_email,
        subject: m.subject,
        html,
        text: m.body_text ?? (html ? htmlToText(html) : null),
      })

      await sb.rpc("admin_mark_mail", {
        p_id: m.id, p_ok: r.ok,
        p_error: r.error ?? null, p_provider_id: r.providerId ?? null,
      })

      if (r.ok) sent++; else failed++
    }

    return { ok: true, sent, failed }
  } catch (e) {
    return { ok: false, sent: 0, failed: 0, error: e instanceof Error ? e.message : "Hata" }
  }
}

/* ═══════════════ ŞABLONLAR ═══════════════ */

export async function fetchMailTemplates(): Promise<{ items: MailTemplate[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from("mail_templates").select("*").order("key")
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as MailTemplate[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function saveMailTemplateAction(params: {
  id: string
  subject: string
  body_html: string
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.from("mail_templates").update({
      subject: params.subject,
      body_html: params.body_html,
      updated_at: new Date().toISOString(),
    }).eq("id", params.id)
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub, action: "mail_template" as never,
      targetType: "mail_template", targetId: params.id,
    })

    revalidatePath("/mail")
    return { ok: true, message: "Şablon kaydedildi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ IMAP — GELEN MAİL ÇEKME ═══════════════ */

interface ImapSettings extends MailSettings {
  imap_host: string | null
  imap_port: number | null
  imap_secure: boolean | null
  imap_user: string | null
  imap_pass: string | null
  imap_folder: string | null
  imap_enabled: boolean | null
  imap_last_uid: number | null
  imap_last_sync: string | null
}

export async function testImapAction(): Promise<{ ok: boolean; error?: string; message?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data } = await sb.from("mail_settings").select("*").eq("id", 1).maybeSingle()
    const s = data as ImapSettings | null

    if (!s?.imap_host || !s.imap_user || !s.imap_pass) {
      return { ok: false, error: "IMAP bilgileri eksik (sunucu, kullanıcı, şifre)." }
    }

    const r = await testImap({
      host: s.imap_host,
      port: s.imap_port ?? 993,
      secure: s.imap_secure ?? true,
      user: s.imap_user,
      pass: s.imap_pass,
      folder: s.imap_folder ?? "INBOX",
    })

    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, message: `Bağlantı başarılı — kutuda ${r.kutu ?? 0} mail var.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * ★ IMAP'ten yeni mailleri çekip mails tablosuna yazar.
 *   Son okunan UID veritabanında; aynı mail iki kez alınmıyor.
 *   Panel açıldığında ve "Yenile" butonuyla çalışıyor.
 */
export async function syncImapAction(): Promise<{
  ok: boolean; error?: string; message?: string; yeni?: number
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data } = await sb.from("mail_settings").select("*").eq("id", 1).maybeSingle()
    const s = data as ImapSettings | null

    if (!s?.imap_enabled) return { ok: false, error: "IMAP kapalı. Ayarlardan aç." }
    if (!s.imap_host || !s.imap_user || !s.imap_pass) {
      return { ok: false, error: "IMAP bilgileri eksik." }
    }

    const r = await fetchNewMails(
      {
        host: s.imap_host,
        port: s.imap_port ?? 993,
        secure: s.imap_secure ?? true,
        user: s.imap_user,
        pass: s.imap_pass,
        folder: s.imap_folder ?? "INBOX",
      },
      s.imap_last_uid ?? 0,
      50
    )

    if (!r.ok && r.mails.length === 0) {
      return { ok: false, error: r.error }
    }

    let yeni = 0
    for (const m of r.mails) {
      // message_id benzersiz — tekrar eden mail sessizce atlanıyor
      const { error } = await sb.from("mails").insert({
        message_id: m.messageId,
        from_email: m.fromEmail,
        from_name: m.fromName,
        to_email: m.toEmail,
        subject: m.subject,
        body_text: m.text,
        body_html: m.html,
        attachments: m.attachments.length ? m.attachments : null,
        received_at: m.date?.toISOString() ?? new Date().toISOString(),
      })
      if (!error) yeni++
    }

    // Son UID'yi kaydet
    if (r.lastUid > (s.imap_last_uid ?? 0)) {
      await sb.rpc("admin_mail_sync_state", { p_uid: r.lastUid })
    }

    revalidatePath("/mail")

    return {
      ok: true,
      yeni,
      message: yeni > 0 ? `${yeni} yeni mail alındı.` : "Yeni mail yok.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ MAİL SİLME (kalıcı) ═══════════════ */

/**
 * ★ Arşiv değil KALICI silme: kayıt tamamen gidiyor.
 *   Toplu silme destekleniyor (seçili maillerin hepsi tek çağrıda).
 */
export async function deleteMailsAction(
  ids: string[]
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  if (!ids.length) return { ok: false, error: "Seçim yok." }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_delete_mail", { p_ids: ids })
    if (error) return { ok: false, error: error.message }

    const n = (data as { silinen?: number } | null)?.silinen ?? 0

    await logAudit({
      actor: session.sub, action: "mail_delete" as never,
      targetType: "mail", detail: { adet: n },
    })

    revalidatePath("/mail")
    return { ok: true, message: `${n} mail kalıcı olarak silindi.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════════════════════════════════════════════════════
   TOPLU MAİL — filtreli alıcı seçimi
═══════════════════════════════════════════════════════════════ */

export interface AliciFiltre {
  sehir?: string | null
  rol?: string | null
  /** true → sadece e-postası doğrulanmış, false → doğrulanmamış */
  dogrulanmis?: boolean | null
}

export interface SehirSayim { sehir: string; adet: number }

/** Filtre açılır kutusu için — sadece kullanıcısı olan şehirler */
export async function fetchMailSehirler(): Promise<{
  items: SehirSayim[]
  error?: string
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_mail_sehirler")
    if (error) return { items: [], error: error.message }
    return { items: (data as SehirSayim[]) ?? [] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * Filtreye uyan alıcı sayısı.
 * ★ Göndermeden ÖNCE gösteriliyor — "kaç kişiye gidecek" bilinmeden
 *   toplu mail göndermek tehlikeli.
 */
export async function countMailAlicilar(f: AliciFiltre): Promise<{
  adet: number
  error?: string
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_mail_alici_sayisi", {
      p_sehir: f.sehir || null,
      p_rol: f.rol || null,
      p_dogrulu: f.dogrulanmis ?? null,
    })
    if (error) return { adet: 0, error: error.message }
    return { adet: Number(data ?? 0) }
  } catch (e) {
    return { adet: 0, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export interface TopluSonuc {
  ok: boolean
  error?: string
  kuyruga: number
  atlanan: number
  message?: string
}

/**
 * TOPLU MAİL GÖNDER
 *
 * ★ Anında göndermiyor — `mail_queue` kuyruğuna yazıyor. Sebebi:
 *   2000 kişiye tek istekte mail atmak hem zaman aşımına uğrar hem
 *   SMTP sunucusunu tetikler. Kuyruk sırayla boşaltılıyor.
 *
 * ★ Aynı e-posta birden çok kayıtta olabilir (tekrar eden hesaplar);
 *   `Set` ile teke indiriliyor.
 */
export async function sendBulkMailAction(params: {
  subject: string
  body: string
  mode: "html" | "text"
  useTemplate: boolean
  filtre: AliciFiltre
  /** Ek olarak elle eklenen adresler */
  ekAdresler?: string[]
}): Promise<TopluSonuc> {
  let session
  try { session = await assertSession() }
  catch { return { ok: false, error: "Oturum sona ermiş.", kuyruga: 0, atlanan: 0 } }

  if (!params.subject.trim()) {
    return { ok: false, error: "Konu gerekli.", kuyruga: 0, atlanan: 0 }
  }
  if (!params.body.trim()) {
    return { ok: false, error: "İçerik gerekli.", kuyruga: 0, atlanan: 0 }
  }

  try {
    const sb = getSupabaseAdmin()

    const { data: sData } = await sb.from("mail_settings").select("*").eq("id", 1).maybeSingle()
    const s = sData as MailSettings | null
    if (!s?.is_active) {
      return { ok: false, error: "Mail sistemi kapalı. Ayarlardan aç.", kuyruga: 0, atlanan: 0 }
    }

    /* ── Alıcıları topla ── */
    const { data: alicilar, error: aErr } = await sb.rpc("admin_mail_alicilar", {
      p_sehir: params.filtre.sehir || null,
      p_rol: params.filtre.rol || null,
      p_dogrulu: params.filtre.dogrulanmis ?? null,
      p_limit: 20000,
    })

    if (aErr) return { ok: false, error: aErr.message, kuyruga: 0, atlanan: 0 }

    const liste = (alicilar as { user_id: string; email: string }[]) ?? []

    // ★ Tekrar eden adresleri ele — aynı kişiye iki mail gitmesin
    const gorulen = new Set<string>()
    const hedefler: { user_id: string | null; email: string }[] = []

    for (const a of liste) {
      const e = (a.email ?? "").trim().toLowerCase()
      if (!e || gorulen.has(e)) continue
      gorulen.add(e)
      hedefler.push({ user_id: a.user_id, email: e })
    }

    for (const raw of params.ekAdresler ?? []) {
      const e = raw.trim().toLowerCase()
      if (!e || gorulen.has(e)) continue
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) continue
      gorulen.add(e)
      hedefler.push({ user_id: null, email: e })
    }

    if (hedefler.length === 0) {
      return { ok: false, error: "Filtreye uyan alıcı yok.", kuyruga: 0, atlanan: 0 }
    }

    /* ── Gövdeyi hazırla ── */
    const sablon = sablonHazirla(await sablonKaynagi(s))

    const html = params.mode === "html"
      ? (params.useTemplate
          ? wrapTemplate(sablon, {
              icerik: params.body,
              konu: params.subject,
              logo: "",
              imza: imzaBlogu(s.signature_html),
            })
          : params.body)
      : null

    const text = params.mode === "text"
      ? params.body
      : htmlToText(html ?? params.body)

    /* ── Kuyruğa yaz ──
       ★ Tablo `mail_queue`. Kolonlar tam olarak şunlar:
           to_email · to_name · user_id · subject · body_html ·
           body_text · template_key · variables · status · attempts ·
           error · provider_id · priority · created_at · sent_at
         `created_by` YOK — eklemek "Kuyruğa yazılamadı" hatası veriyordu.

       ★ 500'lük parçalar: tek seferde 20.000 satır göndermek istek
         boyutu sınırına takılıyor.

       ★ priority 8 — tekil mailler varsayılan 5 ile giriyor. Toplu
         gönderim sıraya arkadan giriyor, tek bir kullanıcıya giden
         önemli mail 2000 kişilik duyurunun arkasında beklemiyor. */
    const PARCA = 500
    let kuyruga = 0

    for (let i = 0; i < hedefler.length; i += PARCA) {
      const parca = hedefler.slice(i, i + PARCA).map((h) => ({
        to_email: h.email,
        user_id: h.user_id,
        subject: params.subject.trim(),
        body_html: html,
        body_text: text,
        status: "pending",
        priority: 8,
      }))

      const { error } = await sb.from("mail_queue").insert(parca)
      if (error) {
        /* ★ Hata metni birden çok alanda olabiliyor. Eskiden sadece
           `error.message` okunuyordu ve tablo bulunamadığında undefined
           çıkıyordu — "Kuyruğa yazılamadı: undefined". */
        const detay =
          error.message ||
          (error as { details?: string }).details ||
          (error as { hint?: string }).hint ||
          (error as { code?: string }).code ||
          JSON.stringify(error)

        return {
          ok: false,
          error: `Kuyruğa yazılamadı: ${detay}`,
          kuyruga,
          atlanan: hedefler.length - kuyruga,
        }
      }
      kuyruga += parca.length
    }

    await logAudit({
      actor: session.sub,
      action: "mail_bulk" as never,
      targetType: "mail",
      targetId: null,
      detail: {
        konu: params.subject,
        alici: kuyruga,
        filtre: params.filtre,
      },
    })

    revalidatePath("/mail")

    return {
      ok: true,
      kuyruga,
      atlanan: 0,
      message: `${kuyruga} alıcı kuyruğa eklendi.`,
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Beklenmeyen hata.",
      kuyruga: 0,
      atlanan: 0,
    }
  }
}

/* ═══════════════════════════════════════════════════════════════
   ŞABLON YARDIMCILARI
═══════════════════════════════════════════════════════════════ */

/**
 * Şu anda hangi şablonun kullanıldığını ve önizlemesini döndürür.
 *
 * ★ NEDEN GEREKLİ: şablon seçimi `s.default_template?.trim() ||
 *   varsayilanSablon(...)` şeklinde. Veritabanında ESKİ bir şablon
 *   kayıtlıysa yeni varsayılan hiç devreye girmiyor ve "değişiklik
 *   uygulanmamış" gibi görünüyor. Bu fonksiyon hangisinin aktif
 *   olduğunu açıkça söylüyor.
 */
export async function previewMailTemplate(): Promise<{
  ok: boolean
  /** true → veritabanındaki özel şablon, false → varsayılan */
  ozelMi: boolean
  html: string
  error?: string
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()

    const { data } = await sb.from("mail_settings").select("*").eq("id", 1).maybeSingle()
    const s = data as MailSettings | null

    const ozel = (s?.default_template ?? "").trim()
    const ozelMi = ozel.length > 0

    const sablon = sablonHazirla(await sablonKaynagi(s))

    const html = wrapTemplate(sablon, {
      icerik:
        "<p>Merhaba,</p>" +
        "<p>Bu bir önizleme mailidir. Şablonun nasıl göründüğünü buradan " +
        "kontrol edebilirsin.</p>" +
        "<p>Karanlık mod desteğini görmek için cihazının temasını " +
        "değiştirip sayfayı yenile.</p>",
      konu: "Şablon önizlemesi",
      logo: "",
      imza: imzaBlogu(s?.signature_html),
    })

    return { ok: true, ozelMi, html }
  } catch (e) {
    return {
      ok: false,
      ozelMi: false,
      html: "",
      error: e instanceof Error ? e.message : "Beklenmeyen hata.",
    }
  }
}

/**
 * Kayıtlı özel şablonu siler → varsayılan devreye girer.
 * ★ Yeni tasarımı görmek isteyenler için tek tıklık çıkış yolu.
 */
export async function resetMailTemplateAction(): Promise<{
  ok: boolean
  error?: string
}> {
  try {
    const session = await assertSession()
    const sb = getSupabaseAdmin()

    const { error } = await sb
      .from("mail_settings")
      .update({ default_template: null })
      .eq("id", 1)

    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: "mail_settings_update" as never,
      targetType: "mail_settings",
      targetId: "1",
      detail: { default_template: "sifirlandi" },
    })

    revalidatePath("/mail")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
