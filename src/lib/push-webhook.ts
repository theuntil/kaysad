// src/lib/push-webhook.ts
//
// ┌─ BU DOSYA NE YAPIYOR ─────────────────────────────────────────────┐
// │ Veritabanından (pg_net) gelen HTTP isteklerini doğrular.           │
// │                                                                    │
// │ Bu endpoint'ler oturum cookie'si KULLANAMAZ — çağıran taraf bir    │
// │ tarayıcı değil, PostgreSQL. Onun yerine paylaşılan gizli anahtar   │
// │ kullanıyoruz: `x-push-secret` başlığı.                             │
// └────────────────────────────────────────────────────────────────────┘
//
// ┌─ ÖNEMLİ ──────────────────────────────────────────────────────────┐
// │ PUSH_WEBHOOK_SECRET (.env) değeri, veritabanındaki                 │
// │ app_settings.push_webhook_secret ile AYNI olmalı.                   │
// │                                                                    │
// │ Ayarlanmamışsa endpoint TÜM istekleri reddeder — açık kapı         │
// │ bırakmamak için bilinçli. Panel localde çalışıyorsa bu             │
// │ endpoint'lere hiç ihtiyaç yok, "Bekleyenleri Gönder" butonu ve     │
// │ otomatik yoklama zaten işi yapıyor.                                 │
// └────────────────────────────────────────────────────────────────────┘

import type { NextRequest } from "next/server"

/** Sabit zamanlı karşılaştırma — timing attack'a karşı */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const A = enc.encode(a)
  const B = enc.encode(b)
  const len = Math.max(A.length, B.length)
  let diff = A.length ^ B.length
  for (let i = 0; i < len; i++) diff |= (A[i] ?? 0) ^ (B[i] ?? 0)
  return diff === 0
}

export function verifyPushWebhook(req: NextRequest): { ok: boolean; reason?: string } {
  const expected = process.env.PUSH_WEBHOOK_SECRET?.trim()

  if (!expected || expected.length < 16 || expected.includes("REPLACE")) {
    return {
      ok: false,
      reason:
        "PUSH_WEBHOOK_SECRET tanımlı değil. Otomatik push kullanmak istiyorsan .env'e ekle ve " +
        "veritabanında admin_set_setting('push_webhook_secret', ...) ile aynı değeri gir.",
    }
  }

  const got = req.headers.get("x-push-secret")?.trim()
  if (!got) return { ok: false, reason: "x-push-secret başlığı yok" }
  if (!timingSafeEqual(got, expected)) return { ok: false, reason: "gizli anahtar eşleşmiyor" }

  return { ok: true }
}
