// src/app/login/page.tsx
//
// Server component — searchParams'ı await edip (Next 16 gereği) client
// forma düz bir string olarak geçiyor.

import { LoginForm } from "@/components/LoginForm"

export const dynamic = "force-dynamic"

/** Açık yönlendirme koruması: sadece kendi sitemizdeki path kabul edilir */
function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.includes("://")) return "/"
  return v
}

export default async function LoginPage({
  searchParams,
}: {
  // ★ Next 16: searchParams artık Promise
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const sp = await searchParams
  return <LoginForm nextPath={safeNext(sp.next)} />
}
