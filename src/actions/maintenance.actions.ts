// src/actions/maintenance.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// BAKIM İŞLERİ
//
// Otomatik temizlik gece 04:00'te pg_cron ile çalışıyor (run_maintenance).
// Buradakiler ELLE tetikleme için — beklemek istemediğin durumlar.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"

export interface QueueStatus {
  pending: number
  sending: number
  failed: number
  en_eski: string | null
  sessiz_saat: boolean
  push_acik: boolean
  son_uyandirma: string | null
  uyandirma_sayisi: number
}

export async function fetchQueueStatus(): Promise<QueueStatus | null> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_queue_status")
    if (error) return null
    return data as QueueStatus
  } catch {
    return null
  }
}

/**
 * ★ İki mod var ve farkları önemli:
 *   skip   → bildirim satırları kalır, sadece push gönderilmez.
 *            Kullanıcı uygulamayı açınca bildirimi yine görür.
 *   delete → satırlar tamamen silinir. Bildirim hiç olmamış gibi olur.
 */
export async function clearPushQueueAction(
  mode: "skip" | "delete"
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_clear_push_queue", { p_mode: mode })
    if (error) return { ok: false, error: error.message }

    const n = (data as { etkilenen?: number } | null)?.etkilenen ?? 0

    await logAudit({
      actor: session.sub, action: "queue_clear",
      targetType: "push", detail: { mod: mode, etkilenen: n },
    })

    revalidatePath("/push")
    revalidatePath("/gonderim")

    return {
      ok: true,
      message: mode === "skip"
        ? `${n} bildirim kuyruktan çıkarıldı (uygulamada görünmeye devam edecek).`
        : `${n} bildirim tamamen silindi.`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function runCleanupAction(
  kind: "notifications" | "audit" | "push_log" | "all"
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const fn = kind === "notifications" ? "cleanup_notifications"
    : kind === "audit" ? "cleanup_audit_log"
    : kind === "push_log" ? "cleanup_push_log"
    : "run_maintenance"

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc(fn, {})
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub, action: "cleanup_run",
      targetType: "maintenance", detail: { tur: kind, sonuc: data as never },
    })

    revalidatePath("/audit")
    revalidatePath("/push")

    const r = (data ?? {}) as Record<string, unknown>
    const n = r.silinen ?? (r.bildirim as Record<string, unknown> | undefined)?.silinen ?? 0

    return { ok: true, message: `Temizlik tamamlandı — ${n} kayıt silindi.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
