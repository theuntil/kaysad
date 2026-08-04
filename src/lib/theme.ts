// src/lib/theme.ts
//
// Tema çerezde tutuluyor — localStorage'da DEĞİL. Sebep: sunucu bileşeni
// <html> etiketini render ederken temayı bilmek zorunda. localStorage'da
// olsa tema JS yüklendikten sonra uygulanır ve her yüklemede bir kare
// yanlış renk görünür ("flash"). Çerez sunucuda okunabildiği için ilk
// HTML doğru sınıfla geliyor.

import { cookies } from "next/headers"

export type Theme = "dark" | "light"

export const THEME_COOKIE = "kays_theme"

/** Varsayılan KARANLIK — çerez yoksa ya da bozuksa buraya düşer. */
export async function getTheme(): Promise<Theme> {
  const store = await cookies()
  const raw = store.get(THEME_COOKIE)?.value
  return raw === "light" ? "light" : "dark"
}

export function themeCookieOptions() {
  return {
    httpOnly: false,          // istemci de okuyabilsin (anlık geçiş için)
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  }
}
