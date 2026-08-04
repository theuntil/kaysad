// src/actions/report.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// ŞİKÂYET (REPORT) YÖNETİMİ
//
// reports.status dört değer alıyor: pending | reviewing | resolved | dismissed
// Panel iki karar veriyor:
//   KABUL ET  → resolved  (şikâyet haklı)
//   REDDET    → dismissed (şikâyet yersiz)
// "reviewing" ara durum olarak korunuyor — uzun incelemede işaretlemek için.
//
// ★ Silme ayrı bir eylem: karar vermek ile kaydı yok etmek farklı şeyler.
//   Karar veri bırakır (aynı kullanıcı tekrar şikâyet edilirse geçmiş
//   görünür), silme bırakmaz. Panel ikisini karıştırmıyor.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import type { ReportRow, ReportDetail, ReportCounts, ReportStatus } from "@/lib/types.v3"

export async function fetchReportCounts(): Promise<{ counts: ReportCounts | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_report_counts")
    if (error) return { counts: null, error: error.message }
    return { counts: data as ReportCounts }
  } catch (e) {
    return { counts: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function fetchReports(params: {
  status?: ReportStatus | null
  query?: string | null
  limit?: number
  offset?: number
}): Promise<{ items: ReportRow[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_reports_v2", {
      p_status: params.status ?? null,
      p_query: params.query?.trim() || null,
      p_limit: params.limit ?? 50,
      p_offset: params.offset ?? 0,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as ReportRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function fetchReportDetail(
  id: string
): Promise<{ detail: ReportDetail | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_report_detail", { p_id: id })
    if (error) return { detail: null, error: error.message }
    return { detail: (data ?? null) as ReportDetail | null }
  } catch (e) {
    return { detail: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function setReportStatusAction(params: {
  id: string
  status: ReportStatus
  note?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_set_report_status", {
      p_id: params.id,
      p_status: params.status,
      p_note: params.note?.trim() || null,
    })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: params.status === "resolved" ? "report_resolve"
            : params.status === "dismissed" ? "report_dismiss" : "report_update",
      targetType: "report",
      targetId: params.id,
      detail: { durum: params.status, not: params.note ?? null },
    })

    revalidatePath("/reports")
    revalidatePath(`/reports/${params.id}`)
    revalidatePath("/")

    return {
      ok: true,
      message: params.status === "resolved" ? "Şikâyet kabul edildi ve çözüldü olarak işaretlendi."
        : params.status === "dismissed" ? "Şikâyet reddedildi."
        : "Durum güncellendi.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function deleteReportAction(
  id: string
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_delete_report", { p_id: id })
    if (error) return { ok: false, error: error.message }

    const n = (data as { silinen?: number } | null)?.silinen ?? 0

    await logAudit({
      actor: session.sub, action: "report_delete",
      targetType: "report", targetId: id,
    })

    revalidatePath("/reports")
    revalidatePath("/")

    return { ok: true, message: n > 0 ? "Şikâyet kaydı silindi." : "Kayıt bulunamadı." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
