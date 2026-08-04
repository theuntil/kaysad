// src/actions/users.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// KULLANICI İŞLEMLERİ
//
// ★ auth.users'a panel DOĞRUDAN erişmiyor. Her şey security definer
//   fonksiyonlardan geçiyor (admin_list_users / admin_user_full). Sebep:
//   auth şemasına service_role ile bile ham SQL atmak, ileride Supabase
//   tarafında bir kolon değişince paneli sessizce bozar; fonksiyon
//   imzası sabit kalıyor.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import type { UserRow, UserFull, UserFilter } from "@/lib/types.v3"

export async function fetchUsers(params: {
  query?: string | null
  filter?: UserFilter
  limit?: number
  offset?: number
}): Promise<{ items: UserRow[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_users", {
      p_query: params.query?.trim() || null,
      p_filter: params.filter ?? "all",
      p_limit: params.limit ?? 50,
      p_offset: params.offset ?? 0,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as UserRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function fetchUserFull(
  userId: string
): Promise<{ user: UserFull | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_user_full", { p_user_id: userId })
    if (error) return { user: null, error: error.message }
    return { user: (data ?? null) as UserFull | null }
  } catch (e) {
    return { user: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ Hesap durumu / rozet ═══════════════ */

export async function setUserActiveAction(
  userId: string, active: boolean
): Promise<{ ok: boolean; error?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_set_active", { p_user_id: userId, p_active: active })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub, action: "user_set_active",
      targetType: "user", targetId: userId, detail: { aktif: active },
    })
    revalidatePath(`/kullanicilar/${userId}`)
    revalidatePath("/kullanicilar")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function setUserVerifyAction(
  userId: string, verify: boolean
): Promise<{ ok: boolean; error?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_set_verify", { p_user_id: userId, p_verify: verify })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub, action: "user_set_verify",
      targetType: "user", targetId: userId, detail: { rozet: verify },
    })
    revalidatePath(`/kullanicilar/${userId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ TUTARSIZLIK ONARIMI ═══════════════ */

export interface FixStep { kod: string; islem: string; detay: string }
export interface FixPlan {
  uygulandi: boolean
  plan: FixStep[]
  adet: number
  degisen: number
  elle_gereken: { kod: string; sebep: string }[]
}

/**
 * İki modda çalışır:
 *   apply = false → SADECE plan döner (panel onay penceresinde gösteriyor)
 *   apply = true  → uygular
 *
 * ★ Neden iki aşamalı: "düzelt" düğmesi neye dokunacağını söylemeden
 *   auth ve profiles tablolarını değiştirirse, geri alması zor bir işi
 *   körlemesine yapmış oluruz. Önce plan, sonra onay.
 */
export async function previewFixMismatch(
  userId: string, codes?: string[] | null
): Promise<{ ok: boolean; plan?: FixPlan; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_fix_mismatch", {
      p_user_id: userId,
      p_codes: codes?.length ? codes : null,
      p_apply: false,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, plan: data as FixPlan }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function applyFixMismatch(
  userId: string, codes?: string[] | null
): Promise<{ ok: boolean; plan?: FixPlan; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_fix_mismatch", {
      p_user_id: userId,
      p_codes: codes?.length ? codes : null,
      p_apply: true,
    })
    if (error) return { ok: false, error: error.message }

    const plan = data as FixPlan

    await logAudit({
      actor: session.sub,
      action: "mismatch_fix",
      targetType: "user",
      targetId: userId,
      detail: { degisen: plan.degisen, kodlar: plan.plan?.map((p) => p.kod) ?? [] },
    })

    revalidatePath(`/kullanicilar/${userId}`)
    revalidatePath("/kullanicilar")
    revalidatePath("/")

    return {
      ok: true,
      plan,
      message: plan.degisen > 0
        ? `${plan.degisen} tutarsızlık düzeltildi.`
        : "Düzeltilecek bir şey kalmamış.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ KİMLİK DÜZENLEME ═══════════════ */

export interface IdentityPatch {
  email?: string | null
  phone?: string | null
  username?: string
  name?: string | null
  sehir?: string | null
  bio?: string | null
  website?: string | null
  business_name?: string | null
  gizli?: boolean
  verify?: boolean
  role?: string
  is_boosted?: boolean
  ogrenci?: boolean
}

/**
 * ★ E-posta ve telefon HEM auth.users HEM profiles'ta güncellenir.
 *   Doğrulama SQL tarafında da var — panel atlatılsa bile geçersiz
 *   değer yazılamaz.
 * ★ E-posta/telefon değişince doğrulama bayrağı sıfırlanır: yeni adres
 *   doğrulanmış sayılamaz.
 */
export async function updateIdentityAction(
  userId: string, patch: IdentityPatch
): Promise<{ ok: boolean; error?: string; message?: string; degisen?: string[] }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const keys = Object.keys(patch)
  if (keys.length === 0) return { ok: false, error: "Değişiklik yok." }

  try {
    const sb = getSupabaseAdmin()
    // ★ Rol ayrı fonksiyondan geçiyor: business_durum ile tutarlılığı
    //   orada sağlanıyor ve kullanıcıya bildirim gidiyor.
    // ★ Boost hakkı ayrı fonksiyondan
    if (patch.is_boosted !== undefined) {
      const { error: bErr } = await sb.rpc("admin_set_boosted", {
        p_user_id: userId, p_value: patch.is_boosted,
      })
      if (bErr) return { ok: false, error: bErr.message }
      delete patch.is_boosted
    }

    if (patch.role !== undefined) {
      const { error: rErr } = await sb.rpc("admin_set_role", {
        p_user_id: userId, p_role: patch.role,
      })
      if (rErr) return { ok: false, error: rErr.message }
      delete patch.role
    }

    if (Object.keys(patch).length === 0) {
      revalidatePath(`/kullanicilar/${userId}`)
      return { ok: true, degisen: ["role"], message: "Hesap türü güncellendi." }
    }

    const { data, error } = await sb.rpc("admin_update_identity", {
      p_user_id: userId,
      p_patch: patch,
    })
    if (error) return { ok: false, error: error.message }

    const r = (data ?? {}) as { degisen?: string[] }

    await logAudit({
      actor: session.sub,
      action: "identity_update",
      targetType: "user",
      targetId: userId,
      // ★ Değerleri değil, hangi alanların değiştiğini logluyoruz:
      //   işlem kaydına kişisel veri kopyalamamak için.
      detail: { alanlar: r.degisen ?? keys },
    })

    revalidatePath(`/kullanicilar/${userId}`)
    revalidatePath("/kullanicilar")

    return { ok: true, degisen: r.degisen ?? keys, message: "Bilgiler güncellendi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ HIZLI ARAMA (bildirim / ban ekranları) ═══════════════ */

export interface QuickUser {
  user_id: string
  username: string | null
  name: string | null
  avatar_url: string | null
  email: string | null
  phone: string | null
  sehir: string | null
  role: string | null
  is_banned: boolean
  device_count: number
  push_device_count: number
  has_profile: boolean
}

export async function quickUserSearch(
  query: string, limit = 12
): Promise<{ items: QuickUser[]; error?: string }> {
  try {
    await assertSession()
    if (!query.trim()) return { items: [] }
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_quick_user_search", {
      p_query: query.trim(), p_limit: limit,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as QuickUser[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ TAM KULLANICI SİLME ═══════════════ */

export interface DeletePlan {
  uygulandi: boolean
  username: string | null
  toplam_satir: number
  tablolar: Record<string, number>
  korunan?: string[]
  cozulemeyen?: string[]
}

/** Ne silineceğini önce sayar — hiçbir şeye dokunmaz. */
export async function previewDeleteUser(
  userId: string
): Promise<{ ok: boolean; plan?: DeletePlan; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_delete_user_completely", {
      p_user_id: userId, p_apply: false,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, plan: data as DeletePlan }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * ★ Kullanıcıyı ve ilişkili TÜM verisini siler: gönderi, ilan, indirim,
 *   etkinlik, yorum, yoruma gelen yanıtlar, mesaj, bildirim, engel
 *   (blocked), takip, favori, cihaz, profil ve auth kaydı.
 *
 * ★ bans tablosu KORUNUR: hesabını sildirip aynı cihazla dönmesin.
 */
export async function deleteUserCompletelyAction(
  userId: string
): Promise<{ ok: boolean; plan?: DeletePlan; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_delete_user_completely", {
      p_user_id: userId, p_apply: true,
    })
    if (error) return { ok: false, error: error.message }

    const plan = data as DeletePlan

    await logAudit({
      actor: session.sub,
      action: "user_delete",
      targetType: "user",
      targetId: userId,
      detail: { username: plan.username, satir: plan.toplam_satir, tablolar: plan.tablolar },
    })

    revalidatePath("/kullanicilar")
    revalidatePath("/")

    return { ok: true, plan, message: `${plan.toplam_satir} kayıt silindi.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
