// src/actions/popup.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// POPUP İŞLEMLERİ
//
// Her action ilk satırda `assertSession()` çağırıyor — middleware'e EK
// olarak. Sebep: server action'lar HTTP POST ile doğrudan çağrılabilir;
// middleware bir sebeple atlanırsa bu kontrol devreye giriyor.
//
// Doğrulama SUNUCUDA yapılıyor. Tarayıcı tarafı doğrulama sadece kullanıcı
// deneyimi için — güvenlik açısından hiçbir zaman ona güvenilmez.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import type { Popup, PopupActionType, PopupFrequency, PopupPlacement, PopupVariant } from "@/lib/types"
import { fromDatetimeLocal } from "@/lib/utils"

export interface ActionResult {
  ok: boolean
  error?: string
  message?: string
  popupId?: string
}

/* ─────────────────────────────────────────────────────────────
   FORM → NESNE + DOĞRULAMA
───────────────────────────────────────────────────────────── */

const VARIANTS: PopupVariant[] = ["default", "warning", "critical", "promo"]
const ACTIONS: PopupActionType[] = ["none", "internal", "external"]
const PLACEMENTS: PopupPlacement[] = ["app_open", "screen", "notification", "manual"]
const FREQUENCIES: PopupFrequency[] = ["once", "once_per_day", "n_times", "max_per_day", "every_time"]

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim()
}
function strOrNull(fd: FormData, key: string): string | null {
  const v = str(fd, key)
  return v.length ? v : null
}
function bool(fd: FormData, key: string): boolean {
  return fd.get(key) === "on" || fd.get(key) === "true"
}
function intOrNull(fd: FormData, key: string): number | null {
  const v = str(fd, key)
  if (!v) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}
function csvArrayOrNull(fd: FormData, key: string): string[] | null {
  // Çoktan seçmeli alanlar (şehirler, platformlar) getAll ile gelir
  const all = fd.getAll(key).map((v) => String(v).trim()).filter(Boolean)
  if (all.length === 0) return null
  return Array.from(new Set(all))
}

interface ParsedPopup {
  data: Record<string, unknown>
  error?: string
}

function parseAndValidate(fd: FormData): ParsedPopup {
  const title = str(fd, "title")
  if (!title) return { data: {}, error: "Başlık zorunlu." }
  if (title.length > 200) return { data: {}, error: "Başlık en fazla 200 karakter olabilir." }

  const variant = str(fd, "variant") as PopupVariant
  if (!VARIANTS.includes(variant)) return { data: {}, error: "Geçersiz görünüm (variant)." }

  const action_type = str(fd, "action_type") as PopupActionType
  if (!ACTIONS.includes(action_type)) return { data: {}, error: "Geçersiz aksiyon tipi." }

  const placement = str(fd, "placement") as PopupPlacement
  if (!PLACEMENTS.includes(placement)) return { data: {}, error: "Geçersiz gösterim yeri (placement)." }

  const frequency = str(fd, "frequency") as PopupFrequency
  if (!FREQUENCIES.includes(frequency)) return { data: {}, error: "Geçersiz sıklık (frequency)." }

  const action_route = strOrNull(fd, "action_route")
  const action_url = strOrNull(fd, "action_url")
  const logo_url = strOrNull(fd, "logo_url")
  // ★ Popup tipi: system (sistem duyurusu) | ad (reklam)
  const popup_kind = (str(fd, "popup_kind") || "system") as "system" | "ad"
  const target_screen = strOrNull(fd, "target_screen")
  const max_shows = intOrNull(fd, "max_shows")
  const max_per_day = intOrNull(fd, "max_per_day")
  const cooldown_hours = intOrNull(fd, "cooldown_hours")

  // ── Veritabanı constraint'leriyle AYNI kuralları burada da uygula ──
  //    Böylece kullanıcı anlaşılır bir hata görür, çirkin bir Postgres
  //    hata mesajı değil.

  if (action_type === "internal" && !action_route) {
    return { data: {}, error: "Uygulama içi yönlendirme seçtin — 'Hedef sayfa' alanı zorunlu (ör: /food)." }
  }
  if (action_type === "external") {
    if (!action_url) {
      return { data: {}, error: "Dış link seçtin — 'Link' alanı zorunlu." }
    }
    if (!/^https?:\/\//i.test(action_url)) {
      return { data: {}, error: "Link http:// veya https:// ile başlamalı." }
    }
  }
  if (action_type === "internal" && action_route && !action_route.startsWith("/")) {
    return { data: {}, error: "Hedef sayfa '/' ile başlamalı (ör: /food)." }
  }

  if (placement === "screen" && !target_screen) {
    return { data: {}, error: "Belirli ekran seçtin — 'Ekran anahtarı' alanı zorunlu (ör: food)." }
  }

  if (frequency === "n_times" && (!max_shows || max_shows < 1)) {
    return { data: {}, error: "'Toplam N kez' seçtin — gösterim sayısı 1 veya daha büyük olmalı." }
  }
  if (frequency === "max_per_day" && (!max_per_day || max_per_day < 1)) {
    return { data: {}, error: "'Günde N kez' seçtin — günlük sayı 1 veya daha büyük olmalı." }
  }
  if (cooldown_hours !== null && cooldown_hours < 0) {
    return { data: {}, error: "Bekleme süresi negatif olamaz." }
  }

  const min_age = intOrNull(fd, "min_account_age_days")
  const max_age = intOrNull(fd, "max_account_age_days")
  if (min_age !== null && max_age !== null && min_age > max_age) {
    return {
      data: {},
      error: `Hesap yaşı aralığı imkansız: en az ${min_age} gün ama en fazla ${max_age} gün. Bu popup hiç kimseye gösterilmez.`,
    }
  }

  const start_at = fromDatetimeLocal(str(fd, "start_at"))
  const end_at = fromDatetimeLocal(str(fd, "end_at"))
  if (start_at && end_at && new Date(start_at) >= new Date(end_at)) {
    return { data: {}, error: "Bitiş tarihi başlangıçtan sonra olmalı." }
  }

  const image_url = strOrNull(fd, "image_url")
  if (image_url && !/^https?:\/\//i.test(image_url)) {
    return { data: {}, error: "Görsel adresi http:// veya https:// ile başlamalı." }
  }

  const priority = intOrNull(fd, "priority") ?? 0

  return {
    data: {
      title,
      description: strOrNull(fd, "description"),
      image_url,
      logo_url,
      popup_kind,
      action_type,
      action_route: action_type === "internal" ? action_route : null,
      action_url: action_type === "external" ? action_url : null,
      action_label: strOrNull(fd, "action_label"),
      dismiss_label: strOrNull(fd, "dismiss_label"),
      variant,
      dismissible: bool(fd, "dismissible"),
      show_opt_out: bool(fd, "show_opt_out"),
      placement,
      target_screen: placement === "screen" ? target_screen : null,
      frequency,
      max_shows: frequency === "n_times" ? max_shows : null,
      max_per_day: frequency === "max_per_day" ? max_per_day : null,
      cooldown_hours,
      target_cities: csvArrayOrNull(fd, "target_cities"),
      target_students_only: bool(fd, "target_students_only"),
      target_platforms: csvArrayOrNull(fd, "target_platforms"),
      require_login: bool(fd, "require_login"),
      min_account_age_days: min_age,
      max_account_age_days: max_age,
      start_at,
      end_at,
      is_active: bool(fd, "is_active"),
      priority,
      note: strOrNull(fd, "note"),
    },
  }
}

/** Postgres hatalarını okunabilir Türkçeye çevirir */
function humanizeDbError(msg: string): string {
  if (msg.includes("popups_action_consistency")) {
    return "Aksiyon tipi ile ilgili alan uyuşmuyor (internal → hedef sayfa, external → link zorunlu)."
  }
  if (msg.includes("popups_screen_consistency")) {
    return "Gösterim yeri 'Belirli ekran' seçildi ama ekran anahtarı boş."
  }
  if (msg.includes("popups_frequency_consistency")) {
    return "Sıklık ile sayı alanı uyuşmuyor (Toplam N kez → gösterim sayısı, Günde N kez → günlük sayı)."
  }
  if (msg.includes("violates check constraint")) {
    return "Girilen değerlerden biri veritabanı kuralına uymuyor: " + msg
  }
  return msg
}

/* ═══════════════ OLUŞTUR ═══════════════ */

export async function createPopupAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturumun sona ermiş. Sayfayı yenile ve tekrar giriş yap." }
  }

  const parsed = parseAndValidate(fd)
  if (parsed.error) return { ok: false, error: parsed.error }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from("popups").insert(parsed.data).select("id, title").single()
    if (error) return { ok: false, error: humanizeDbError(error.message) }

    await logAudit({
      actor: session.sub,
      action: "popup_create",
      targetType: "popup",
      targetId: data.id,
      detail: { title: data.title, placement: parsed.data.placement, frequency: parsed.data.frequency },
    })

    revalidatePath("/popups")
    revalidatePath("/")
    return { ok: true, message: `"${data.title}" oluşturuldu.`, popupId: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ GÜNCELLE ═══════════════ */

export async function updatePopupAction(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturumun sona ermiş. Sayfayı yenile ve tekrar giriş yap." }
  }

  const id = str(fd, "id")
  if (!id) return { ok: false, error: "Popup id eksik." }

  const parsed = parseAndValidate(fd)
  if (parsed.error) return { ok: false, error: parsed.error }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from("popups").update(parsed.data).eq("id", id).select("id, title").single()
    if (error) return { ok: false, error: humanizeDbError(error.message) }

    await logAudit({
      actor: session.sub,
      action: "popup_update",
      targetType: "popup",
      targetId: id,
      detail: { title: data.title },
    })

    revalidatePath("/popups")
    revalidatePath(`/popups/${id}`)
    revalidatePath("/")
    return { ok: true, message: "Değişiklikler kaydedildi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ AKTİF/PASİF ═══════════════ */

export async function togglePopupAction(id: string, nextActive: boolean): Promise<ActionResult> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from("popups")
      .update({ is_active: nextActive })
      .eq("id", id)
      .select("title")
      .single()
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: "popup_toggle",
      targetType: "popup",
      targetId: id,
      detail: { title: data.title, is_active: nextActive },
    })

    revalidatePath("/popups")
    revalidatePath("/")
    return { ok: true, message: nextActive ? "Popup yayına alındı." : "Popup durduruldu." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ SİL ═══════════════ */

export async function deletePopupAction(id: string): Promise<ActionResult> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  try {
    const sb = getSupabaseAdmin()

    // Silmeden önce başlığı al (audit log için — sonradan öğrenemeyiz)
    const { data: before } = await sb.from("popups").select("title").eq("id", id).maybeSingle()

    const { error } = await sb.from("popups").delete().eq("id", id)
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: "popup_delete",
      targetType: "popup",
      targetId: id,
      detail: { title: before?.title ?? null },
    })

    revalidatePath("/popups")
    revalidatePath("/")
    return { ok: true, message: "Popup silindi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ GÖSTERİM GEÇMİŞİNİ SIFIRLA ═══════════════ */

export async function resetPopupViewsAction(id: string): Promise<ActionResult> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_reset_popup_views", { p_popup_id: id })
    if (error) return { ok: false, error: error.message }

    const silinen = typeof data === "number" ? data : 0

    await logAudit({
      actor: session.sub,
      action: "popup_reset_views",
      targetType: "popup",
      targetId: id,
      detail: { silinen_kayit: silinen },
    })

    revalidatePath("/popups")
    revalidatePath(`/popups/${id}`)
    return {
      ok: true,
      message: `${silinen} kullanıcının gösterim geçmişi silindi. Popup onlara yeniden gösterilecek.`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ POPUP'I BİLDİRİM OLARAK GÖNDER ═══════════════ */

export async function sendPopupAsNotificationAction(
  popupId: string,
  message: string | null
): Promise<ActionResult> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_send_broadcast", {
      p_type: "popup",
      p_message: message,
      p_popup_id: popupId,
      p_cities: null,
      p_students_only: false,
      p_only_active: true,
    })
    if (error) return { ok: false, error: error.message }

    const sent = (data as { gonderilen?: number } | null)?.gonderilen ?? 0

    await logAudit({
      actor: session.sub,
      action: "broadcast_send",
      targetType: "popup",
      targetId: popupId,
      detail: { tip: "popup", gonderilen: sent, mesaj: message },
    })

    revalidatePath("/notifications")
    return { ok: true, message: `Bildirim ${sent} kullanıcıya gönderildi.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ OKUMA (server component'ler için) ═══════════════ */

export async function fetchPopups(): Promise<{ popups: Popup[]; error?: string }> {
  await assertSession()
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from("popups")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
    if (error) return { popups: [], error: error.message }
    return { popups: (data ?? []) as Popup[] }
  } catch (e) {
    return { popups: [], error: e instanceof Error ? e.message : "Bağlantı hatası." }
  }
}

export async function fetchPopup(id: string): Promise<{ popup: Popup | null; error?: string }> {
  await assertSession()
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.from("popups").select("*").eq("id", id).maybeSingle()
    if (error) return { popup: null, error: error.message }
    return { popup: (data as Popup) ?? null }
  } catch (e) {
    return { popup: null, error: e instanceof Error ? e.message : "Bağlantı hatası." }
  }
}
