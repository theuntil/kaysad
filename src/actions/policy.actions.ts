// src/actions/policy.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// POLİTİKA YÖNETİMİ
//
// ★ Yazma işlemleri RLS'yi bypass eden service_role ile yapılıyor;
//   politikalar tablosunda insert/update politikası YOK. Böylece
//   uygulamadan politika değiştirmek imkânsız.
// ★ Sürüm ve güncelleme tarihi veritabanı trigger'ında artıyor —
//   panel unutsa bile kayıt doğru kalıyor.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"

export interface Policy {
  id: string
  slug: string
  title: string
  content: string
  summary: string | null
  version: number
  is_published: boolean
  sort_order: number
  updated_by: string | null
  created_at: string
  updated_at: string
}

export async function fetchPolicies(): Promise<{ items: Policy[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_policies")
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as Policy[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function savePolicyAction(params: {
  id?: string | null
  slug: string
  title: string
  content: string
  summary?: string | null
  published: boolean
  sort: number
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  if (!params.title.trim()) return { ok: false, error: "Başlık zorunlu." }
  if (!params.slug.trim()) return { ok: false, error: "Slug zorunlu." }
  if (!/^[a-z0-9-]+$/.test(params.slug.trim())) {
    return { ok: false, error: "Slug yalnızca küçük harf, rakam ve tire içerebilir." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_save_policy", {
      p_id: params.id ?? null,
      p_slug: params.slug.trim(),
      p_title: params.title.trim(),
      p_content: params.content,
      p_summary: params.summary?.trim() || null,
      p_published: params.published,
      p_sort: params.sort,
      p_by: session.sub,
    })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: params.id ? "policy_update" : "policy_create",
      targetType: "policy",
      targetId: params.id ?? params.slug,
      detail: { slug: params.slug, baslik: params.title },
    })

    revalidatePath("/politikalar")
    return { ok: true, message: "Politika kaydedildi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function deletePolicyAction(
  id: string
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_delete_policy", { p_id: id })
    if (error) return { ok: false, error: error.message }

    await logAudit({ actor: session.sub, action: "policy_delete", targetType: "policy", targetId: id })
    revalidatePath("/politikalar")
    return { ok: true, message: "Politika silindi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/** Sürükle-bırak sıralama — sadece sort_order değişiyor, sürüm artmıyor */
export async function reorderPoliciesAction(
  ids: string[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_reorder_policies", { p_ids: ids })
    if (error) return { ok: false, error: error.message }
    revalidatePath("/politikalar")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
