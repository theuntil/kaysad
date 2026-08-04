// src/actions/notification.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// BİLDİRİM İŞLEMLERİ
//
// ★ EN ÖNEMLİ GÜVENLİK ÖNLEMİ: `countRecipientsAction`
//   Broadcast göndermeden ÖNCE kaç kişiye gideceğini gösteriyoruz.
//   Yanlışlıkla 50.000 kişiye spam atmayı önleyen şey bu. Panelde
//   "Gönder" butonu, sayım yapılmadan aktif olmuyor.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import type { BroadcastSummary, NotificationRow } from "@/lib/types"

export interface BroadcastResult {
  ok: boolean
  error?: string
  message?: string
  gonderilen?: number
}

const ALLOWED_TYPES = ["promo", "earthquake", "popup"] as const
type AllowedType = (typeof ALLOWED_TYPES)[number]

/* ═══════════════ KURU ÇALIŞTIRMA — kaç kişiye gidecek? ═══════════════ */

export async function countRecipientsAction(params: {
  cities: string[] | null
  studentsOnly: boolean
}): Promise<{ ok: boolean; count?: number; error?: string }> {
  try {
    await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_count_broadcast_recipients", {
      p_cities: params.cities && params.cities.length ? params.cities : null,
      p_students_only: params.studentsOnly,
      p_only_active: true,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, count: typeof data === "number" ? data : 0 }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ BROADCAST GÖNDER ═══════════════ */

export async function sendBroadcastAction(params: {
  type: string
  message: string
  popupId?: string | null
  cities: string[] | null
  studentsOnly: boolean
  /** Kullanıcının onayladığı sayı — sunucudaki gerçek sayıyla karşılaştırılır */
  expectedCount: number
}): Promise<BroadcastResult> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  // ── Tip doğrulama ──
  if (!ALLOWED_TYPES.includes(params.type as AllowedType)) {
    return { ok: false, error: "Geçersiz bildirim tipi." }
  }
  const type = params.type as AllowedType

  // ── İçerik doğrulama ──
  const message = params.message.trim()
  if (type !== "popup" && !message) {
    return { ok: false, error: "Mesaj boş olamaz." }
  }
  if (message.length > 500) {
    return { ok: false, error: "Mesaj en fazla 500 karakter olabilir." }
  }
  if (type === "popup" && !params.popupId) {
    return { ok: false, error: "Popup tipinde bir popup seçmelisin." }
  }

  try {
    const sb = getSupabaseAdmin()

    // ★ ÇİFT KONTROL: Kullanıcı "1.200 kişiye gidecek" yazısını görüp
    //   onayladı. Ama o ekranı açtıktan sonra veritabanı değişmiş olabilir
    //   (yeni üyeler). Gerçek sayı beklenenden ÇOK farklıysa (>%25) işlemi
    //   durduruyoruz — kullanıcı bilmediği bir kitleye göndermesin.
    const { data: realCount, error: countErr } = await sb.rpc("admin_count_broadcast_recipients", {
      p_cities: params.cities && params.cities.length ? params.cities : null,
      p_students_only: params.studentsOnly,
      p_only_active: true,
    })
    if (countErr) return { ok: false, error: "Alıcı sayısı doğrulanamadı: " + countErr.message }

    const actual = typeof realCount === "number" ? realCount : 0

    if (actual === 0) {
      return { ok: false, error: "Bu filtrelere uyan hiç kullanıcı yok. Gönderim yapılmadı." }
    }

    const expected = Math.max(0, params.expectedCount)
    if (expected > 0) {
      const drift = Math.abs(actual - expected) / expected
      if (drift > 0.25) {
        return {
          ok: false,
          error:
            `Alıcı sayısı değişti (onayladığın: ${expected}, şu anki: ${actual}). ` +
            `Güvenlik için gönderim durduruldu — sayımı yenileyip tekrar dene.`,
        }
      }
    }

    // ── Gönder ──
    const { data, error } = await sb.rpc("admin_send_broadcast", {
      p_type: type,
      p_message: type === "popup" ? (message || null) : message,
      p_popup_id: params.popupId ?? null,
      p_cities: params.cities && params.cities.length ? params.cities : null,
      p_students_only: params.studentsOnly,
      p_only_active: true,
    })
    if (error) return { ok: false, error: error.message }

    const result = data as { gonderilen?: number; mesaj?: string } | null
    const sent = result?.gonderilen ?? 0

    await logAudit({
      actor: session.sub,
      action: "broadcast_send",
      targetType: "notification",
      targetId: params.popupId ?? null,
      detail: {
        tip: type,
        mesaj: result?.mesaj ?? message,
        gonderilen: sent,
        sehirler: params.cities,
        sadece_ogrenci: params.studentsOnly,
      },
    })

    revalidatePath("/notifications")
    revalidatePath("/")
    return { ok: true, gonderilen: sent, message: `Bildirim ${sent} kullanıcıya gönderildi.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ GERİ AL ═══════════════ */

export async function undoBroadcastAction(params: {
  type: string
  message: string | null
  withinMinutes?: number
}): Promise<BroadcastResult> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  if (!ALLOWED_TYPES.includes(params.type as AllowedType)) {
    return { ok: false, error: "Geçersiz bildirim tipi." }
  }
  if (params.message === null) {
    return { ok: false, error: "Mesajı olmayan bir broadcast geri alınamaz." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_undo_broadcast", {
      p_type: params.type,
      p_message: params.message,
      p_within_minutes: params.withinMinutes ?? 1440, // varsayılan 24 saat
    })
    if (error) return { ok: false, error: error.message }

    const deleted = typeof data === "number" ? data : 0

    await logAudit({
      actor: session.sub,
      action: "broadcast_undo",
      targetType: "notification",
      detail: { tip: params.type, mesaj: params.message, silinen: deleted },
    })

    revalidatePath("/notifications")
    revalidatePath("/")
    return { ok: true, message: `${deleted} bildirim geri alındı (silindi).` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ OKUMA ═══════════════ */

export interface NotificationStats {
  toplam: number
  okunmamis: number
  son_24_saat: number
  son_7_gun: number
  tip_dagilimi: { type: string; adet: number }[]
  kullanici_sayisi: number
}

export async function fetchNotificationStats(): Promise<{ stats: NotificationStats | null; error?: string }> {
  await assertSession()
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_notification_stats")
    if (error) return { stats: null, error: error.message }
    return { stats: data as NotificationStats }
  } catch (e) {
    return { stats: null, error: e instanceof Error ? e.message : "Bağlantı hatası." }
  }
}

export async function fetchBroadcasts(limit = 50): Promise<{ items: BroadcastSummary[]; error?: string }> {
  await assertSession()
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_broadcasts", { p_limit: limit })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as BroadcastSummary[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Bağlantı hatası." }
  }
}

export async function fetchCityDistribution(): Promise<{
  cities: { sehir: string; kullanici_sayisi: number }[]
  error?: string
}> {
  await assertSession()
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_city_distribution")
    if (error) return { cities: [], error: error.message }
    return { cities: (data ?? []) as { sehir: string; kullanici_sayisi: number }[] }
  } catch (e) {
    return { cities: [], error: e instanceof Error ? e.message : "Bağlantı hatası." }
  }
}

export async function fetchRecentNotifications(
  limit = 100,
  typeFilter?: string
): Promise<{ items: NotificationRow[]; error?: string }> {
  await assertSession()
  try {
    const sb = getSupabaseAdmin()
    let q = sb
      .from("notifications")
      .select("id, recipient_id, actor_id, type, entity_type, entity_id, secondary_id, message, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(Math.min(500, Math.max(1, limit)))
    if (typeFilter) q = q.eq("type", typeFilter)

    const { data, error } = await q
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as NotificationRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Bağlantı hatası." }
  }
}
