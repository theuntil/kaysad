// src/lib/audit.ts — Kim ne zaman ne yaptı kaydı
//
// Neden: Panel tek kişilik olsa da, "bu popup'ı ne zaman kapatmıştım",
// "bu broadcast'i gerçekten ben mi gönderdim" gibi soruların cevabı
// lazım oluyor. Kazara silmelerde de iz bırakır.
//
// V3: ban / cihaz banı / onay-red işlemleri de kaydediliyor. Ban gibi
// geri dönüşü olan ama kullanıcıyı doğrudan etkileyen işlemlerde
// "sebep" alanı da detail içinde saklanıyor.

import { getSupabaseAdmin } from "@/lib/supabase-admin"

export type AuditAction =
  | "login" | "login_failed" | "logout"
  | "popup_create" | "popup_update" | "popup_delete"
  | "popup_toggle" | "popup_reset_views"
  | "broadcast_send" | "broadcast_undo"
  | "notification_delete"
  // ── V3 ──
  | "send" | "send_undo"
  | "user_ban" | "user_unban" | "ban_record_remove"
  | "device_ban" | "device_unban"
  | "business_approve" | "business_reject"
  | "student_approve" | "student_reject"
  | "user_set_active" | "user_set_verify" | "user_set_role"
  | "ip_ban" | "ip_unban"
  | "content_update" | "content_delete" | "media_replace"
  | "mismatch_fix" | "identity_update" | "ban_create"
  | "report_resolve" | "report_dismiss" | "report_update" | "report_delete"
  | "profile_media_set" | "profile_media_delete" | "user_delete"
  | "policy_create" | "policy_update" | "policy_delete"
  | "ad_approve" | "ad_reject" | "ad_pause" | "ad_resume"
  | "ad_edit_approve" | "ad_edit_reject"
  | "boost_approve" | "boost_reject" | "boost_stop"
  | "queue_clear" | "cleanup_run"
  | "mail_send" | "mail_settings" | "mail_template"
  | "media_upload" | "media_delete" | "config_update" | "mail_delete"

export async function logAudit(params: {
  actor: string
  action: AuditAction
  targetType?: string | null
  targetId?: string | null
  detail?: Record<string, unknown> | null
}): Promise<void> {
  try {
    const sb = getSupabaseAdmin()
    await sb.from("admin_audit_log").insert({
      actor: params.actor,
      action: params.action,
      target_type: params.targetType ?? null,
      target_id: params.targetId ?? null,
      detail: params.detail ?? null,
    })
  } catch (e) {
    // Audit yazımı başarısız olursa asıl işlemi ENGELLEMEZ — sadece loglar.
    console.error("[audit] kayıt yazılamadı:", e)
  }
}
