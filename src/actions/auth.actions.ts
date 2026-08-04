// src/actions/auth.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// GİRİŞ / ÇIKIŞ
//
// Server action olarak yazıldı — şifre doğrulama tarayıcıya hiç ulaşmıyor.
// bcrypt karşılaştırması Node runtime gerektiriyor (Edge'de çalışmaz), bu
// yüzden middleware'de değil burada yapılıyor.
// ═══════════════════════════════════════════════════════════════════════

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import bcrypt from "bcryptjs"

import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  clearedCookieOptions,
  timingSafeEqual,
  checkRateLimit,
  recordFailedAttempt,
  clearAttempts,
  getAdminUsername,
  getAdminPasswordHash,
} from "@/lib/auth"
import { getSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"

export interface LoginState {
  error?: string
}

/** İstemci IP'sini reverse proxy başlıklarından çıkarır */
async function clientIp(): Promise<string> {
  // ★ Next 16: headers() artık async
  const h = await headers()
  const fwd = h.get("x-forwarded-for")
  if (fwd) return fwd.split(",")[0].trim()
  return h.get("x-real-ip") ?? "unknown"
}

/**
 * Açık yönlendirme (open redirect) korumalı hedef doğrulama.
 * Sadece kendi sitemizdeki bir path kabul edilir; "//evil.com" veya
 * "https://evil.com" gibi değerler reddedilir.
 */
function safeNext(raw: string | null | undefined): string {
  if (!raw) return "/"
  if (!raw.startsWith("/")) return "/"
  if (raw.startsWith("//")) return "/"
  if (raw.includes("://")) return "/"
  return raw
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const ip = await clientIp()

  // ── 1) Brute-force kontrolü ──
  const rate = checkRateLimit(ip)
  if (!rate.allowed) {
    const min = Math.ceil((rate.retryAfterSec ?? 900) / 60)
    return { error: `Çok fazla başarısız deneme. ${min} dakika sonra tekrar dene.` }
  }

  const username = String(formData.get("username") ?? "").trim()
  const password = String(formData.get("password") ?? "")
  const next = safeNext(String(formData.get("next") ?? "/"))

  if (!username || !password) {
    return { error: "Kullanıcı adı ve şifre gerekli." }
  }

  // ── 2) Yapılandırma kontrolü ──
  let expectedUser: string
  let expectedHash: string
  try {
    expectedUser = getAdminUsername()
    expectedHash = getAdminPasswordHash()
  } catch (e) {
    // Yapılandırma hatası — kullanıcıya teknik detay verilir çünkü
    // bu paneli sadece sen kullanıyorsun ve sorunu çözmen gerekiyor.
    return { error: e instanceof Error ? e.message : "Sunucu yapılandırma hatası." }
  }

  // ── 3) Doğrulama ──
  // ★ Kullanıcı adı yanlış olsa bile bcrypt karşılaştırması YAPILIYOR.
  //   Sebep: aksi halde "kullanıcı adı yanlış" (hızlı) ile "şifre yanlış"
  //   (yavaş, ~250ms) arasındaki zaman farkı, saldırgana kullanıcı adının
  //   doğru olduğunu sızdırır. İkisi de aynı süreyi harcıyor.
  const userOk = timingSafeEqual(username, expectedUser)
  const passOk = await bcrypt.compare(password, expectedHash)

  if (!userOk || !passOk) {
    recordFailedAttempt(ip)
    await logAudit({
      actor: username.slice(0, 64),
      action: "login_failed",
      detail: { ip, reason: userOk ? "wrong_password" : "wrong_username" },
    })
    return { error: "Kullanıcı adı veya şifre hatalı." }
  }

  // ── 4) Oturum aç ──
  clearAttempts(ip)
  const { token, maxAge } = await createSessionToken(expectedUser)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge))

  await logAudit({ actor: expectedUser, action: "login", detail: { ip } })

  redirect(next)
}

export async function logoutAction(): Promise<void> {
  const session = await getSession()
  if (session) {
    await logAudit({ actor: session.sub, action: "logout" })
  }
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, "", clearedCookieOptions())
  redirect("/login")
}
