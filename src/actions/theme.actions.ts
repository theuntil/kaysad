// src/actions/theme.actions.ts
"use server"

import { cookies } from "next/headers"
import { THEME_COOKIE, themeCookieOptions, type Theme } from "@/lib/theme"

/**
 * Temayı çereze yazar. Oturum kontrolü YOK — bilinçli: tema bir yetki
 * konusu değil, sadece görsel tercih. Login ekranında da çalışması lazım.
 */
export async function setThemeAction(theme: Theme): Promise<void> {
  const value: Theme = theme === "light" ? "light" : "dark"
  const store = await cookies()
  store.set(THEME_COOKIE, value, themeCookieOptions())
}
