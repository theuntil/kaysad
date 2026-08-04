// src/actions/config.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// UYGULAMA AYARLARI
//
// ★ Bakım modu açmak/kapatmak PAROLA istiyor. Yanlışlıkla tıklamayla
//   tüm uygulamayı kapatmak mümkün olmamalı.
//
// ★ Sınırlar rol × içerik tipi matrisi. is_boosted=true olan kullanıcı
//   "boosted" satırındaki sınırı alıyor — kullanıcıya ekstra hak vermek
//   için kod değişikliği gerekmiyor.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import bcrypt from "bcryptjs"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
// ★ Parola hash'i ADMIN_PASSWORD_HASH_B64'te (base64) tutuluyor —
//   bcrypt hash'indeki `$` işaretleri .env'de bozulduğu için.
//   Giriş ekranıyla AYNI okuyucuyu kullanıyoruz ki iki yer ayrı düşmesin.
import { getAdminPasswordHash } from "@/lib/auth"
import { logAudit } from "@/lib/audit"

export interface AppConfig {
  maintenance: boolean
  maintenance_message: string | null
  maintenance_until: string | null
  maintenance_at: string | null
  maintenance_by: string | null
  app_version: string | null
  min_version: string | null
  force_update: boolean
  update_message: string | null
  ios_store_url: string | null
  android_store_url: string | null
  mail_service: boolean
  phone_service: boolean
  push_service: boolean
  ads_service: boolean
  registration_open: boolean
  updated_at: string
  updated_by: string | null
}

export interface ContentLimit {
  content_type: "post" | "listing" | "discount" | "event"
  role: "user" | "business" | "boosted_user" | "boosted_business"
  limit_type: "daily" | "active"
  limit_value: number
  is_allowed: boolean
}

export interface ConfigBundle {
  config: AppConfig
  limits: ContentLimit[]
  boosted_user_count: number
}

export async function fetchConfig(): Promise<{ bundle: ConfigBundle | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_get_config")
    if (error) return { bundle: null, error: error.message }
    return { bundle: data as ConfigBundle }
  } catch (e) {
    return { bundle: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function saveConfigAction(
  patch: Record<string, unknown>
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_save_config", { p_patch: patch, p_by: session.sub })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub, action: "config_update" as never,
      targetType: "config", detail: { alanlar: Object.keys(patch) },
    })

    revalidatePath("/ayarlar")
    revalidatePath("/")
    return { ok: true, message: "Ayarlar kaydedildi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * ★ Bakım modu ayrı bir eylem: PAROLA doğrulaması gerekiyor.
 *   Parola sunucuda bcrypt ile karşılaştırılıyor; istemciye hiçbir
 *   şey sızmıyor.
 */
export async function setMaintenanceAction(params: {
  enabled: boolean
  password: string
  message?: string | null
  until?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  if (!params.password) return { ok: false, error: "Parola gerekli." }

  let hash: string
  try {
    hash = getAdminPasswordHash()
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error
        ? e.message
        : "Sunucuda parola doğrulaması yapılandırılmamış.",
    }
  }

  const dogru = await bcrypt.compare(params.password, hash).catch(() => false)
  if (!dogru) {
    // Yanlış parola denemesi işlem kaydına yazılıyor
    await logAudit({
      actor: session.sub, action: "config_update" as never,
      targetType: "config", detail: { bakim: params.enabled, sonuc: "yanlış parola" },
    })
    return { ok: false, error: "Parola yanlış." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_save_config", {
      p_patch: {
        maintenance: params.enabled,
        ...(params.message !== undefined ? { maintenance_message: params.message } : {}),
        ...(params.until !== undefined ? { maintenance_until: params.until } : {}),
      },
      p_by: session.sub,
    })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub, action: "config_update" as never,
      targetType: "config",
      detail: { bakim: params.enabled, sonuc: "uygulandı" },
    })

    revalidatePath("/ayarlar")
    revalidatePath("/")

    return {
      ok: true,
      message: params.enabled
        ? "Bakım modu AÇILDI — uygulama kullanıcılara kapalı."
        : "Bakım modu kapatıldı, uygulama açık.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function saveLimitsAction(
  limits: ContentLimit[]
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_save_limits", { p_limits: limits })
    if (error) return { ok: false, error: error.message }

    const n = (data as { guncellenen?: number } | null)?.guncellenen ?? 0

    await logAudit({
      actor: session.sub, action: "config_update" as never,
      targetType: "limits", detail: { guncellenen: n },
    })

    revalidatePath("/ayarlar")
    return { ok: true, message: `${n} sınır güncellendi.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function setBoostedAction(
  userId: string, value: boolean
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_set_boosted", { p_user_id: userId, p_value: value })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub, action: "config_update" as never,
      targetType: "user", targetId: userId, detail: { is_boosted: value },
    })

    revalidatePath(`/kullanicilar/${userId}`)
    return { ok: true, message: value ? "Boost hakkı verildi." : "Boost hakkı kaldırıldı." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/** Bildirim temizlik kuralının ne yapacağını gösterir */
export async function fetchCleanupPreview(): Promise<Record<string, unknown> | null> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data } = await sb.rpc("admin_cleanup_preview", { p_days: 10, p_keep: 10 })
    return (data ?? null) as Record<string, unknown> | null
  } catch {
    return null
  }
}


/* ═══════════════ REKLAM ANAHTARININ ETKİSİ ═══════════════ */

export interface AdsImpact {
  enabled: boolean
  maintenance: boolean
  aktif_reklam: number
  aktif_boost: number
  bugun_gosterim: number
  aylik_gelir: number
}

export async function fetchAdsImpact(): Promise<AdsImpact | null> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data } = await sb.rpc("admin_ads_impact")
    return (data ?? null) as AdsImpact | null
  } catch {
    return null
  }
}
