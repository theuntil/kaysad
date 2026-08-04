// src/lib/session.ts — Server component/action içinde oturum okuma
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SESSION_COOKIE, verifySessionToken, type SessionPayload } from "@/lib/auth"

export async function getSession(): Promise<SessionPayload | null> {
  // ★ Next 16: cookies() artık async — await zorunlu
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  return verifySessionToken(token)
}

/**
 * Korumalı sayfa/aksiyonlarda kullanılır.
 * ★ Middleware zaten koruyor ama BU DA ŞART: middleware atlatılabilir
 *   (ör. bir route matcher hatası), server action ise doğrudan çağrılabilir.
 *   İki katmanlı savunma.
 */
export async function requireSession(): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) redirect("/login")
  return session
}

/** Server action'lar için: redirect yerine hata fırlatır */
export async function assertSession(): Promise<SessionPayload> {
  const session = await getSession()
  if (!session) throw new Error("YETKISIZ")
  return session
}
