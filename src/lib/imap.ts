// src/lib/imap.ts
//
// ═══════════════════════════════════════════════════════════════════════
// IMAP İLE MAİL ÇEKME
//
// ★ Hostinger gibi klasik mail sunucularında inbound webhook yok.
//   Bu yüzden panel IMAP'e bağlanıp yeni mailleri çekiyor.
//
// ★ KALICI DİNLEME DEĞİL: bağlan → yeni mailleri al → bağlantıyı kapat.
//   Bu Next.js'te sorunsuz çalışır (IDLE dinleme çalışmazdı).
//   Son okunan UID veritabanında tutuluyor, aynı mail iki kez alınmıyor.
// ═══════════════════════════════════════════════════════════════════════

import { ImapFlow } from "imapflow"
import { simpleParser } from "mailparser"

export interface ImapConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  folder: string
}

export interface FetchedMail {
  uid: number
  messageId: string | null
  fromEmail: string
  fromName: string | null
  toEmail: string | null
  subject: string | null
  text: string | null
  html: string | null
  date: Date | null
  attachments: { filename: string | null; size: number; contentType: string }[]
}

export interface ImapResult {
  ok: boolean
  error?: string
  mails: FetchedMail[]
  lastUid: number
}

/** Bağlantıyı test et — gerçek mail çekmeden */
export async function testImap(cfg: ImapConfig): Promise<{ ok: boolean; error?: string; kutu?: number }> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  })

  try {
    await client.connect()
    const lock = await client.getMailboxLock(cfg.folder || "INBOX")
    try {
      const kutu = typeof client.mailbox === "object" ? client.mailbox.exists : 0
      return { ok: true, kutu }
    } finally {
      lock.release()
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "IMAP bağlantısı kurulamadı" }
  } finally {
    await client.logout().catch(() => null)
  }
}

/**
 * Son okunan UID'den sonraki mailleri çeker.
 * ★ limit koruması var: ilk senkronda binlerce mail çekip belleği
 *   doldurmasın diye en fazla `limit` kadar alıyoruz.
 */
export async function fetchNewMails(
  cfg: ImapConfig,
  sinceUid: number,
  limit = 50
): Promise<ImapResult> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  })

  const mails: FetchedMail[] = []
  let lastUid = sinceUid

  try {
    await client.connect()
    const lock = await client.getMailboxLock(cfg.folder || "INBOX")

    try {
      // İlk senkronda tüm kutuyu çekmemek için son N maile bak
      const aralik = sinceUid > 0 ? `${sinceUid + 1}:*` : "1:*"

      const bulunan: number[] = []
      for await (const msg of client.fetch(aralik, { uid: true }, { uid: true })) {
        if (msg.uid > sinceUid) bulunan.push(msg.uid)
      }

      // En yenilerden başla, limit kadar
      const secilen = bulunan.sort((a, b) => b - a).slice(0, limit).sort((a, b) => a - b)

      for (const uid of secilen) {
        const msg = await client.fetchOne(String(uid), { source: true }, { uid: true })
        if (!msg || typeof msg === "boolean" || !msg.source) continue

        const p = await simpleParser(msg.source)

        const from = p.from?.value?.[0]
        if (!from?.address) { lastUid = Math.max(lastUid, uid); continue }

        mails.push({
          uid,
          messageId: p.messageId ?? null,
          fromEmail: from.address.toLowerCase(),
          fromName: from.name || null,
          toEmail: Array.isArray(p.to)
            ? (p.to[0]?.value?.[0]?.address ?? null)
            : (p.to?.value?.[0]?.address ?? null),
          subject: p.subject ?? null,
          text: p.text ?? null,
          html: typeof p.html === "string" ? p.html : null,
          date: p.date ?? null,
          attachments: (p.attachments ?? []).map((a) => ({
            filename: a.filename ?? null,
            size: a.size ?? 0,
            contentType: a.contentType ?? "application/octet-stream",
          })),
        })

        lastUid = Math.max(lastUid, uid)
      }
    } finally {
      lock.release()
    }

    return { ok: true, mails, lastUid }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "IMAP hatası",
      mails,
      lastUid,
    }
  } finally {
    await client.logout().catch(() => null)
  }
}
