// src/lib/auth.ts
//
// ═══════════════════════════════════════════════════════════════════════
// KİMLİK DOĞRULAMA — Supabase'den BAĞIMSIZ, .env tabanlı tek admin
//
// GÜVENLİK TASARIMI:
//   1. Şifre .env'de DÜZ METİN DEĞİL, bcrypt hash olarak tutulur.
//      (`npm run hash-password` ile üretilir)
//   2. Giriş başarılıysa imzalı bir JWT (HS256) HttpOnly cookie'ye yazılır.
//      HttpOnly → JavaScript okuyamaz, XSS ile çalınamaz.
//   3. Cookie `secure` (sadece HTTPS) ve `sameSite=lax` (CSRF azaltma).
//   4. Kullanıcı adı karşılaştırması SABİT ZAMANLI (timing attack'a karşı).
//   5. Brute-force koruması: IP başına 15 dakikada 5 deneme.
//   6. `jose` kütüphanesi kullanılıyor çünkü Edge runtime uyumlu —
//      middleware'de de aynı doğrulama çalışabiliyor.
// ═══════════════════════════════════════════════════════════════════════

import { SignJWT, jwtVerify } from "jose"

export const SESSION_COOKIE = "kays_admin_session"

/* ─────────────────────────────────────────────────────────────
   ENV OKUMA — eksik/zayıf yapılandırmada AÇIKÇA HATA VER
   ★ Sessizce varsayılana düşmek güvenlik açığıdır. Panel yanlış
     yapılandırıldıysa çalışmamalı, hata vermeli.
───────────────────────────────────────────────────────────── */

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v || v.trim().length === 0) {
    throw new Error(
      `[auth] Eksik ortam değişkeni: ${name}. .env dosyanı kontrol et (.env.example'a bak).`
    )
  }
  return v.trim()
}

export function getSessionSecret(): Uint8Array {
  const secret = requireEnv("SESSION_SECRET")
  if (secret.length < 32) {
    throw new Error(
      "[auth] SESSION_SECRET en az 32 karakter olmalı. Üretmek için: openssl rand -base64 48"
    )
  }
  if (secret.includes("REPLACE_WITH")) {
    throw new Error("[auth] SESSION_SECRET hâlâ örnek değerde. Gerçek bir değer üret.")
  }
  return new TextEncoder().encode(secret)
}

function getSessionTtlSeconds(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 8)
  if (!Number.isFinite(hours) || hours <= 0 || hours > 720) return 8 * 3600
  return Math.floor(hours * 3600)
}

/* ─────────────────────────────────────────────────────────────
   OTURUM TOKEN'I
───────────────────────────────────────────────────────────── */

export interface SessionPayload {
  sub: string      // kullanıcı adı
  iat: number
  exp: number
}

export async function createSessionToken(username: string): Promise<{ token: string; maxAge: number }> {
  const secret = getSessionSecret()
  const ttl = getSessionTtlSeconds()
  const now = Math.floor(Date.now() / 1000)

  const token = await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setIssuer("kays-admin")
    .setAudience("kays-admin")
    .setExpirationTime(now + ttl)
    .sign(secret)

  return { token, maxAge: ttl }
}

export async function verifySessionToken(token: string | undefined | null): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const secret = getSessionSecret()
    const { payload } = await jwtVerify(token, secret, {
      issuer: "kays-admin",
      audience: "kays-admin",
      algorithms: ["HS256"],   // ★ algoritma sabitleniyor (alg confusion saldırısına karşı)
    })
    if (typeof payload.sub !== "string") return null
    return payload as unknown as SessionPayload
  } catch {
    // Süresi dolmuş, imzası bozuk veya kurcalanmış
    return null
  }
}

/* ─────────────────────────────────────────────────────────────
   SABİT ZAMANLI KARŞILAŞTIRMA
   ★ Normal `===` karşılaştırması ilk farklı karakterde durur; bu
     mikro zaman farkı, saldırganın kullanıcı adını karakter karakter
     tahmin etmesine yardımcı olabilir (timing attack). Bu fonksiyon
     her zaman aynı süreyi harcar.
───────────────────────────────────────────────────────────── */

export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const bufA = enc.encode(a)
  const bufB = enc.encode(b)
  // Uzunluk farkını da sızdırmamak için sabit uzunlukta karşılaştır
  const len = Math.max(bufA.length, bufB.length)
  let diff = bufA.length ^ bufB.length
  for (let i = 0; i < len; i++) {
    diff |= (bufA[i] ?? 0) ^ (bufB[i] ?? 0)
  }
  return diff === 0
}

/* ─────────────────────────────────────────────────────────────
   BRUTE-FORCE KORUMASI (bellek içi)
   ★ Tek instance için bellek içi yeterli. Çoklu instance'a
     geçerseniz Redis'e taşınması gerekir.
───────────────────────────────────────────────────────────── */

const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000     // 15 dakika
const LOCKOUT_MS = 15 * 60 * 1000    // kilit süresi

interface AttemptRecord {
  count: number
  firstAt: number
  lockedUntil?: number
}

const attempts = new Map<string, AttemptRecord>()

// Bellek şişmesini önle: her 100 kayıtta bir eskileri temizle
function sweep() {
  if (attempts.size < 100) return
  const now = Date.now()
  for (const [key, rec] of attempts) {
    const expired = now - rec.firstAt > WINDOW_MS && (!rec.lockedUntil || now > rec.lockedUntil)
    if (expired) attempts.delete(key)
  }
}

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now()
  const rec = attempts.get(ip)

  if (!rec) return { allowed: true }

  if (rec.lockedUntil && now < rec.lockedUntil) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) }
  }

  // Pencere geçtiyse sıfırla
  if (now - rec.firstAt > WINDOW_MS) {
    attempts.delete(ip)
    return { allowed: true }
  }

  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = now + LOCKOUT_MS
    return { allowed: false, retryAfterSec: Math.ceil(LOCKOUT_MS / 1000) }
  }

  return { allowed: true }
}

export function recordFailedAttempt(ip: string): void {
  sweep()
  const now = Date.now()
  const rec = attempts.get(ip)
  if (!rec || now - rec.firstAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: now })
  } else {
    rec.count += 1
    if (rec.count >= MAX_ATTEMPTS) rec.lockedUntil = now + LOCKOUT_MS
  }
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip)
}

/* ─────────────────────────────────────────────────────────────
   COOKIE SEÇENEKLERİ
───────────────────────────────────────────────────────────── */

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true as const,
    // Geliştirmede http://localhost kullanıldığı için secure kapalı olmalı,
    // aksi halde cookie hiç yazılmaz.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}

export function clearedCookieOptions() {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  }
}

/* ─────────────────────────────────────────────────────────────
   ADMIN KİMLİK BİLGİLERİ (env'den)
───────────────────────────────────────────────────────────── */

export function getAdminUsername(): string {
  return requireEnv("ADMIN_USERNAME")
}

/**
 * Şifre hash'ini okur.
 *
 * ★★★ NEDEN İKİ DEĞİŞKEN ★★★
 * bcrypt hash'leri `$2a$12$...` şeklinde `$` içeriyor. Next.js ise `.env`
 * değerlerine DEĞİŞKEN GENİŞLETMESİ uyguluyor — `$2a` gibi parçaları
 * "tanımsız değişken" sayıp siliyor. Tırnak işaretleri de kurtarmıyor
 * (tek de çift de); sadece her `$`'ı `\$` diye kaçırmak işe yarıyor.
 *
 * Bu kırılgan olduğu için ASIL YÖNTEM base64: `ADMIN_PASSWORD_HASH_B64`
 * içinde `$` yok, hiçbir kaçırma gerekmiyor, kopyala-yapıştır güvenli.
 * `ADMIN_PASSWORD_HASH` geriye dönük uyumluluk için hâlâ okunuyor.
 */
export function getAdminPasswordHash(): string {
  const b64 = process.env.ADMIN_PASSWORD_HASH_B64?.trim()
  const plain = process.env.ADMIN_PASSWORD_HASH?.trim()

  // ── 1) Önce base64 (önerilen yol) ──
  if (b64 && b64.length > 0 && !b64.includes("REPLACE_WITH")) {
    let decoded: string
    try {
      decoded = Buffer.from(b64, "base64").toString("utf8").trim()
    } catch {
      throw new Error(
        "[auth] ADMIN_PASSWORD_HASH_B64 base64 olarak çözülemedi. `npm run hash-password` ile yeniden üret."
      )
    }
    if (!decoded.startsWith("$2")) {
      throw new Error(
        "[auth] ADMIN_PASSWORD_HASH_B64 çözüldüğünde bcrypt hash'i çıkmadı. " +
        "Değeri kopyalarken eksik kalmış olabilir — `npm run hash-password` ile yeniden üret."
      )
    }
    return decoded
  }

  // ── 2) Düz hash (kaçırılmış olması gerekir) ──
  if (!plain || plain.length === 0) {
    throw new Error(
      "[auth] Şifre hash'i tanımlı değil. `npm run hash-password` çalıştır ve çıkan " +
      "ADMIN_PASSWORD_HASH_B64 satırını .env dosyana ekle."
    )
  }

  if (plain.includes("REPLACE_WITH")) {
    throw new Error(
      "[auth] ADMIN_PASSWORD_HASH hâlâ örnek değerde. Üretmek için: npm run hash-password"
    )
  }

  // ★ Next'in `$` genişletmesi tarafından BOZULMUŞ hash'i tanı.
  //   Bozulmuş hali `$2a$12$` ön ekini kaybeder ama bcrypt'in 53 karakterlik
  //   gövdesinden bir parça kalır. Genel "bcrypt değil" hatası yerine
  //   kullanıcıya tam olarak ne olduğunu söylüyoruz.
  const looksMangled =
    !plain.startsWith("$2") &&
    plain.length >= 20 &&
    /^[./A-Za-z0-9]+$/.test(plain)

  if (looksMangled) {
    throw new Error(
      "[auth] ADMIN_PASSWORD_HASH bozulmuş görünüyor. Next.js, .env değerlerindeki " +
      "`$` işaretlerini değişken sayıp siliyor — bcrypt hash'leri bu yüzden olduğu gibi " +
      "yapıştırılamaz (tırnak da işe yaramaz). " +
      "ÇÖZÜM: `npm run hash-password` çalıştır ve çıkan ADMIN_PASSWORD_HASH_B64 satırını kullan."
    )
  }

  if (!plain.startsWith("$2")) {
    throw new Error(
      "[auth] ADMIN_PASSWORD_HASH bir bcrypt hash'i değil — düz metin şifre yazmış olabilirsin. " +
      "`npm run hash-password` çalıştır ve çıkan ADMIN_PASSWORD_HASH_B64 satırını .env'e ekle."
    )
  }

  return plain
}
