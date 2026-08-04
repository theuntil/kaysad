// src/actions/content.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// KULLANICI İÇERİĞİ — gönderi / ilan / indirim / etkinlik
//
// ★ Şema-bağımsız: SQL tarafındaki `admin_user_content` sahip kolonunu
//   (user_id / author_id / owner_id …) kendisi buluyor ve satırları HAM
//   json olarak döndürüyor. Panel hangi alan varsa onu gösteriyor.
//   Böylece tabloya yeni kolon eklediğinde burada kod değişmiyor.
//
// ★ Düzenlemede sadece DEĞİŞEN alanlar gönderilir ve SQL tarafı her
//   anahtarı information_schema'ya karşı doğrular. id, user_id,
//   created_at gibi kolonlar panelden değiştirilemez.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import type { ContentKind, ContentListResult, ContentRow, UserReport } from "@/lib/types.v3"

export async function fetchContentCounts(
  userId: string
): Promise<Record<ContentKind, number | null>> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data } = await sb.rpc("admin_user_content_counts", { p_user_id: userId })
    const d = (data ?? {}) as Record<string, number | null>
    return {
      post: d.post ?? null,
      listing: d.listing ?? null,
      discount: d.discount ?? null,
      event: d.event ?? null,
    }
  } catch {
    return { post: null, listing: null, discount: null, event: null }
  }
}

export async function fetchUserContent(params: {
  userId: string
  kind: ContentKind
  limit?: number
  offset?: number
}): Promise<{ result: ContentListResult | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_user_content", {
      p_user_id: params.userId,
      p_kind: params.kind,
      p_limit: params.limit ?? 20,
      p_offset: params.offset ?? 0,
    })
    if (error) return { result: null, error: error.message }
    return { result: data as ContentListResult }
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function fetchContentDetail(
  kind: ContentKind, id: string
): Promise<{ row: ContentRow | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_content_detail", { p_kind: kind, p_id: id })
    if (error) return { row: null, error: error.message }
    return { row: (data ?? null) as ContentRow | null }
  } catch (e) {
    return { row: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function updateContentAction(params: {
  kind: ContentKind
  id: string
  patch: Record<string, unknown>
  userId?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  if (!params.patch || Object.keys(params.patch).length === 0) {
    return { ok: false, error: "Değişiklik yok." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_update_content", {
      p_kind: params.kind,
      p_id: params.id,
      p_patch: params.patch,
    })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: "content_update",
      targetType: params.kind,
      targetId: params.id,
      detail: { alanlar: Object.keys(params.patch) },
    })

    if (params.userId) revalidatePath(`/kullanicilar/${params.userId}`)
    return { ok: true, message: "Kayıt güncellendi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function deleteContentAction(params: {
  kind: ContentKind
  id: string
  userId?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_delete_content", {
      p_kind: params.kind, p_id: params.id,
    })
    if (error) return { ok: false, error: error.message }

    const n = (data as { silinen?: number } | null)?.silinen ?? 0

    await logAudit({
      actor: session.sub,
      action: "content_delete",
      targetType: params.kind,
      targetId: params.id,
    })

    if (params.userId) revalidatePath(`/kullanicilar/${params.userId}`)
    return {
      ok: true,
      message: n > 0 ? "Kayıt silindi." : "Kayıt bulunamadı (zaten silinmiş olabilir).",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ ŞİKÂYETLER ═══════════════ */

export async function fetchUserReports(
  userId: string
): Promise<{ items: UserReport[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_user_reports", {
      p_user_id: userId, p_limit: 100,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as UserReport[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ TÜM İÇERİKLER (sayfa) ═══════════════ */

export interface ContentPage {
  tablo: string
  sahip_kolonu?: string | null
  tarih_kolonu?: string | null
  toplam: number
  hata?: string
  satirlar: ContentRow[]
}

export async function fetchAllContent(params: {
  kind: ContentKind
  query?: string | null
  limit?: number
  offset?: number
}): Promise<{ result: ContentPage | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_content", {
      p_kind: params.kind,
      p_query: params.query?.trim() || null,
      p_limit: params.limit ?? 40,
      p_offset: params.offset ?? 0,
    })
    if (error) return { result: null, error: error.message }
    return { result: data as ContentPage }
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function fetchContentTotals(): Promise<Record<ContentKind, number | null>> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data } = await sb.rpc("admin_content_counts")
    const d = (data ?? {}) as Record<string, number | null>
    return {
      post: d.post ?? null, listing: d.listing ?? null,
      discount: d.discount ?? null, event: d.event ?? null,
    }
  } catch {
    return { post: null, listing: null, discount: null, event: null }
  }
}
