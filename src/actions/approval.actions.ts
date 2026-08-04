// src/actions/approval.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// ONAY İŞLEMLERİ — işletme hesabı ve öğrenci
//
// ★ RED SEBEBİ: Reddederken sebep yazmak zorunlu. Sebep mobil tarafta
//   kullanıcıya gösteriliyor (profiles.business_red / ogrenci_red_sebep).
//   Sebepsiz red, kullanıcının aynı eksik belgeyle tekrar başvurmasına
//   yol açıyor — hem ona hem sana iş çıkarıyor.
//
// ★ Onayda rol değişimi veritabanı fonksiyonunda yapılıyor
//   (admin_set_business role='business' yazıyor). Panel role alanına
//   elle dokunmuyor — iki yerden yazmak tutarsızlık üretir.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import type { BusinessApplication, StudentApplication } from "@/lib/types.v3"

/* ═══════════════ İŞLETME ═══════════════ */

export async function fetchBusinessApplications(
  durum?: string | null
): Promise<{ items: BusinessApplication[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()

    // Bekleyenlerde tam kayıt (belge, adres, website…) lazım; geçmişte
    // özet yeterli — bu yüzden iki ayrı fonksiyon.
    if (!durum || durum === "pending") {
      const { data, error } = await sb.rpc("admin_pending_business_applications")
      if (error) return { items: [], error: error.message }
      return { items: (data ?? []) as BusinessApplication[] }
    }

    const { data, error } = await sb.rpc("admin_list_business_applications", {
      p_durum: durum,
      p_limit: 200,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as BusinessApplication[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function decideBusinessAction(params: {
  userId: string
  approved: boolean
  rejectReason?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const reason = (params.rejectReason ?? "").trim()
  if (!params.approved && !reason) {
    return { ok: false, error: "Red sebebi zorunlu — kullanıcı bunu görecek." }
  }
  if (reason.length > 400) return { ok: false, error: "Red sebebi en fazla 400 karakter." }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_set_business", {
      p_user_id: params.userId,
      p_approved: params.approved,
      p_reject_reason: params.approved ? null : reason,
    })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: params.approved ? "business_approve" : "business_reject",
      targetType: "user", targetId: params.userId,
      detail: params.approved ? null : { sebep: reason },
    })

    revalidatePath("/onay/isletme")
    revalidatePath(`/kullanicilar/${params.userId}`)
    revalidatePath("/")

    return {
      ok: true,
      message: params.approved
        ? "İşletme hesabı onaylandı."
        : "Başvuru reddedildi. Kullanıcı sebebi görecek ve tekrar başvurabilir.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ ÖĞRENCİ ═══════════════ */

export async function fetchStudentApplications(): Promise<{
  items: StudentApplication[]; error?: string
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_pending_student_applications")
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as StudentApplication[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function decideStudentAction(params: {
  userId: string
  approved: boolean
  rejectReason?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const reason = (params.rejectReason ?? "").trim()
  if (!params.approved && !reason) {
    return { ok: false, error: "Red sebebi zorunlu — kullanıcı bunu görecek." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_set_student", {
      p_user_id: params.userId,
      p_approved: params.approved,
      p_reject_reason: params.approved ? null : reason,
    })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: params.approved ? "student_approve" : "student_reject",
      targetType: "user", targetId: params.userId,
      detail: params.approved ? null : { sebep: reason },
    })

    revalidatePath("/onay/ogrenci")
    revalidatePath(`/kullanicilar/${params.userId}`)
    revalidatePath("/")

    return {
      ok: true,
      message: params.approved ? "Öğrenci doğrulandı." : "Başvuru reddedildi.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
