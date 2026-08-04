// src/actions/push.actions.ts
"use server"

// ┌─ BU DOSYA NE YAPIYOR ─────────────────────────────────────────────┐
// │                                                                    │
// │ Panelin push motoru. Üç ana iş:                                    │
// │                                                                    │
// │  1) processPendingPush()                                           │
// │     Kuyrukta bekleyen bildirimleri alır, Expo'ya gönderir,         │
// │     sonucu veritabanına yazar. Hem "Bekleyenleri Gönder"           │
// │     butonundan hem otomatik yoklamadan hem webhook'tan çağrılır.   │
// │                                                                    │
// │  2) sendManualPush()                                               │
// │     Panelden yazdığın özel bildirimi hedef kitleye gönderir.       │
// │     Hem push atar hem notifications tablosuna kayıt düşer.         │
// │                                                                    │
// │  3) Ayar yönetimi — tip aç/kapa, sessiz saat, panel URL'i          │
// │                                                                    │
// └────────────────────────────────────────────────────────────────────┘
//
// ┌─ ÖNEMLİ NOKTALAR ─────────────────────────────────────────────────┐
// │ • Aynı anda iki işleme çalışmasın diye KİLİT var (processingLock). │
// │   Yoksa aynı bildirim iki kez gönderilir.                          │
// │ • Bir kullanıcının birden fazla cihazı olabilir → her cihaza ayrı  │
// │   mesaj gider ama bildirim TEK kez "gönderildi" sayılır.           │
// │ • Geçersiz token'lar (DeviceNotRegistered) otomatik silinir.       │
// │ • Manuel gönderimde önce SAYIM zorunlu — yanlış hedefi böyle       │
// │   yakalıyorsun (broadcast'te de aynı mantık var).                  │
// └────────────────────────────────────────────────────────────────────┘

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import {
  sendExpoPush,
  isValidExpoToken,
  hasExpoAccessToken,
  type ExpoMessage,
} from "@/lib/expo-push"
import { buildPushText, buildPushData, type PushSource } from "@/lib/push-text"

/* ═══════════════════════════════════════════════════════════════
   TİPLER
═══════════════════════════════════════════════════════════════ */

export interface PushProcessResult {
  ok: boolean
  error?: string
  /** İşlenen bildirim sayısı */
  islenen?: number
  /** Expo'ya giden mesaj sayısı (cihaz bazlı) */
  gonderilen?: number
  basarili?: number
  basarisiz?: number
  silinenToken?: number
  message?: string
}

export interface PushStats {
  bekleyen: number
  gonderilen_24s: number
  basarisiz_24s: number
  atlanan_24s: number
  log_24s_ok: number
  log_24s_hata: number
  aktif_token: number
  push_kapali_cihaz: number
  hata_dagilimi: { error_code: string; adet: number }[]
  sistem_acik: boolean
  sessiz_saatte: boolean
}

interface PendingRow {
  notification_id: string
  recipient_id: string
  type: string
  entity_type: string | null
  entity_id: string | null
  secondary_id: string | null
  message: string | null
  created_at: string
  push_tries: number
  title: string | null
  actor_id: string | null
  actor_username: string | null
  actor_avatar: string | null
  devices: { device_id: string; push_token: string; platform: string | null }[]
}

/* ═══════════════════════════════════════════════════════════════
   KİLİT
   ★ Aynı anda iki işleme çalışırsa aynı bildirim iki kez gönderilir.
   Bellek içi kilit — tek instance için yeterli. Çoklu instance'a
   geçilirse veritabanı seviyesinde advisory lock gerekir.
═══════════════════════════════════════════════════════════════ */

let processingLock = false
let lastProcessAt = 0

/* ═══════════════════════════════════════════════════════════════
   ★ 1) BEKLEYENLERİ İŞLE
═══════════════════════════════════════════════════════════════ */

export async function processPendingPush(opts?: {
  limit?: number
  source?: "auto" | "manual" | "sweep"
  /** Webhook'tan çağrılıyorsa oturum kontrolü atlanır */
  skipAuth?: boolean
  sentBy?: string
}): Promise<PushProcessResult> {
  const source = opts?.source ?? "auto"
  const sentBy = opts?.sentBy ?? "system"

  if (!opts?.skipAuth) {
    try {
      const s = await assertSession()
      opts = { ...opts, sentBy: s.sub }
    } catch {
      return { ok: false, error: "Oturum sona ermiş." }
    }
  }

  // Kilit — aynı anda tek işleme
  if (processingLock) {
    return { ok: true, islenen: 0, message: "Zaten bir işleme sürüyor, atlandı." }
  }
  // Çok sık çağrıyı engelle (webhook + poll aynı anda gelebilir)
  if (Date.now() - lastProcessAt < 1500) {
    return { ok: true, islenen: 0, message: "Çok sık istek, atlandı." }
  }

  processingLock = true
  lastProcessAt = Date.now()

  try {
    const sb = getSupabaseAdmin()

    // ── 1) Gönderilemeyecekleri temizle (sorgu hafif kalsın) ──
    // Hata olursa yoksay — asıl iş kuyruğu göndermek, temizlik ikincil.
    // (Supabase builder Promise değil, .catch() zincirlenemez → try/catch)
    try {
      await sb.rpc("admin_mark_unpushable")
    } catch {
      /* yoksay */
    }

    // ── 2) Bekleyenleri al ──
    const { data, error } = await sb.rpc("admin_pending_push", {
      p_limit: opts?.limit ?? 200,
    })
    if (error) return { ok: false, error: error.message }

    const rows = (data ?? []) as PendingRow[]
    if (rows.length === 0) {
      return { ok: true, islenen: 0, gonderilen: 0, message: "Kuyrukta bekleyen bildirim yok." }
    }

    // ── 3) Expo mesajlarını hazırla ──
    //    Her cihaz için ayrı mesaj, ama hangi bildirime ait olduğunu
    //    izliyoruz — sonucu bildirim bazında kaydedeceğiz.
    const messages: ExpoMessage[] = []
    const meta: {
      notification_id: string
      user_id: string
      device_id: string
      push_token: string
      type: string
      title: string
      body: string
    }[] = []

    for (const r of rows) {
      const src: PushSource = {
        type: r.type,
        message: r.message,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        secondary_id: r.secondary_id,
        actor_username: r.actor_username,
      }
      const { title, body } = buildPushText(src, r.title)
      const pushData = buildPushData(src, r.notification_id)

      const devices = Array.isArray(r.devices) ? r.devices : []

      for (const d of devices) {
        if (!isValidExpoToken(d.push_token)) continue

        messages.push({
          to: d.push_token,
          title,
          body,
          data: pushData,
          sound: "default",
          channelId: "default",
          priority: r.type === "earthquake" ? "high" : "default",
          ttl: 60 * 60 * 24, // 24 saat sonra anlamsızlaşır
        })

        meta.push({
          notification_id: r.notification_id,
          user_id: r.recipient_id,
          device_id: d.device_id,
          push_token: d.push_token,
          type: r.type,
          title,
          body,
        })
      }
    }

    if (messages.length === 0) {
      return {
        ok: true,
        islenen: rows.length,
        gonderilen: 0,
        message: `${rows.length} bildirim var ama geçerli token bulunamadı.`,
      }
    }

    // ── 4) Gönder ──
    const results = await sendExpoPush(messages)

    // ── 5) Sonuçları veritabanına yaz ──
    const payload = results.map((res) => {
      const m = meta[res.index]
      return {
        notification_id: m.notification_id,
        user_id: m.user_id,
        device_id: m.device_id,
        push_token: m.push_token,
        type: m.type,
        title: m.title,
        body: m.body,
        result: res.ok ? "ok" : "error",
        error_code: res.errorCode ?? null,
        error_message: res.errorMessage ?? null,
        source,
        sent_by: sentBy,
      }
    })

    const { data: recorded, error: recErr } = await sb.rpc("admin_record_push_results", {
      p_results: payload,
    })
    if (recErr) {
      // Gönderim OLDU ama kayıt tutulamadı — bunu bilmek önemli
      console.error("[push] sonuç kaydedilemedi:", recErr)
      return {
        ok: false,
        error: `Bildirimler gönderildi ama kayıt tutulamadı: ${recErr.message}`,
        gonderilen: messages.length,
      }
    }

    const r = (recorded ?? {}) as { basarili?: number; basarisiz?: number; silinen_token?: number }

    revalidatePath("/push")
    revalidatePath("/")

    return {
      ok: true,
      islenen: rows.length,
      gonderilen: messages.length,
      basarili: r.basarili ?? 0,
      basarisiz: r.basarisiz ?? 0,
      silinenToken: r.silinen_token ?? 0,
      message: `${rows.length} bildirim · ${r.basarili ?? 0} başarılı · ${r.basarisiz ?? 0} başarısız${
        (r.silinen_token ?? 0) > 0 ? ` · ${r.silinen_token} geçersiz token silindi` : ""
      }`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  } finally {
    processingLock = false
  }
}

/* ═══════════════════════════════════════════════════════════════
   ★ 2) MANUEL PUSH — hedef sayımı
═══════════════════════════════════════════════════════════════ */

/**
 * @deprecated V3.2 — gönderim /gonderim sayfasına taşındı.
 * Yeni akış: `send.actions.ts` → previewAudienceAction / sendAction.
 * Bu iki fonksiyon (countPushTargets, sendManualPush) artık hiçbir
 * ekrandan çağrılmıyor; API uyumluluğu için bırakıldı.
 *
 * ★ NOT: admin_count_push_targets / admin_push_targets imzalarında
 *   `p_only_active` YOKTUR. Buraya o parametreyi eklemeyin — PostgREST
 *   fonksiyonu bulamaz ve "Could not find the function ... in the schema
 *   cache" hatası verir.
 */
export async function countPushTargets(params: {
  cities: string[] | null
  studentsOnly: boolean
  platforms: string[] | null
  activeDays: number | null
}): Promise<{ ok: boolean; kullanici?: number; cihaz?: number; error?: string }> {
  try {
    await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_count_push_targets", {
      p_cities: params.cities?.length ? params.cities : null,
      p_students_only: params.studentsOnly,
      p_platforms: params.platforms?.length ? params.platforms : null,
      p_active_days: params.activeDays,
    })
    if (error) return { ok: false, error: error.message }
    const d = (data ?? {}) as { kullanici?: number; cihaz?: number }
    return { ok: true, kullanici: d.kullanici ?? 0, cihaz: d.cihaz ?? 0 }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════════════════════════════════════════════════════
   ★ 2b) MANUEL PUSH — gönder
   
   İki şey birden yapar:
     • Expo'ya push atar (telefonlara düşer)
     • notifications tablosuna kayıt düşer (uygulama içinde de görünür)
   
   `alsoCreateNotification: false` derseniz sadece push gider, uygulama
   içi bildirim listesinde görünmez (ör. tek seferlik hatırlatma).
═══════════════════════════════════════════════════════════════ */

export async function sendManualPush(params: {
  title: string
  body: string
  /** Uygulama içi yönlendirme, ör: /food veya /postid/uuid */
  route?: string | null
  cities: string[] | null
  studentsOnly: boolean
  platforms: string[] | null
  activeDays: number | null
  /** Kullanıcının onayladığı cihaz sayısı — sunucuda tekrar doğrulanır */
  expectedDevices: number
  /** notifications tablosuna da kayıt düşülsün mü */
  alsoCreateNotification: boolean
}): Promise<PushProcessResult> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  const title = params.title.trim()
  const body = params.body.trim()

  if (!title) return { ok: false, error: "Başlık boş olamaz." }
  if (!body) return { ok: false, error: "Mesaj boş olamaz." }
  if (title.length > 80) return { ok: false, error: "Başlık en fazla 80 karakter olabilir." }
  if (body.length > 300) return { ok: false, error: "Mesaj en fazla 300 karakter olabilir." }

  if (params.route && !params.route.startsWith("/")) {
    return { ok: false, error: "Yönlendirme adresi '/' ile başlamalı (ör: /food)." }
  }

  try {
    const sb = getSupabaseAdmin()

    // ── Sistem kapalı mı ──
    const { data: enabled } = await sb.rpc("app_setting", { p_key: "push_enabled" })
    if (enabled === "false") {
      return { ok: false, error: "Push sistemi kapalı. Ayarlardan açman gerekiyor." }
    }

    // ── Hedefleri al ──
    const { data: targets, error: tErr } = await sb.rpc("admin_push_targets", {
      p_cities: params.cities?.length ? params.cities : null,
      p_students_only: params.studentsOnly,
      p_platforms: params.platforms?.length ? params.platforms : null,
      p_active_days: params.activeDays,
      p_limit: 50000,
    })
    if (tErr) return { ok: false, error: tErr.message }

    const list = (targets ?? []) as {
      user_id: string
      device_id: string
      push_token: string
      platform: string | null
    }[]

    if (list.length === 0) {
      return { ok: false, error: "Bu filtrelere uyan push alabilen cihaz yok." }
    }

    // ★ SAPMA KONTROLÜ — onayladığın sayı ile gerçek sayı çok farklıysa dur.
    //   Ekranı açtıktan sonra yeni cihazlar eklenmiş olabilir; bilmediğin
    //   bir kitleye göndermeni engelliyor.
    const expected = Math.max(0, params.expectedDevices)
    if (expected > 0) {
      const drift = Math.abs(list.length - expected) / expected
      if (drift > 0.25) {
        return {
          ok: false,
          error:
            `Cihaz sayısı değişti (onayladığın: ${expected}, şu anki: ${list.length}). ` +
            `Güvenlik için gönderim durduruldu — sayımı yenileyip tekrar dene.`,
        }
      }
    }

    // ── notifications kaydı (istenirse) ──
    //    Kullanıcı bazında tek kayıt; aynı kişinin 5 cihazı olsa da
    //    bildirim listesinde 1 satır görünmeli.
    const notifByUser = new Map<string, string>()

    if (params.alsoCreateNotification) {
      const uniqueUsers = Array.from(new Set(list.map((t) => t.user_id)))
      const rows = uniqueUsers.map((uid) => ({
        recipient_id: uid,
        actor_id: null,
        type: "promo",
        entity_type: "promotion",
        entity_id: null,
        message: body,
        is_read: false,
        // ★ 'sent' olarak işaretliyoruz: push'u BURADA gönderiyoruz,
        //   trigger'ın tekrar göndermesini istemiyoruz.
        push_status: "sent",
        pushed_at: new Date().toISOString(),
      }))

      const { data: inserted, error: nErr } = await sb
        .from("notifications")
        .insert(rows)
        .select("id, recipient_id")

      if (nErr) {
        console.error("[push] notifications kaydı başarısız:", nErr)
        // Push'u yine gönderiyoruz — bildirim kaydı olmasa da telefona düşsün
      } else {
        ;(inserted ?? []).forEach((n: { id: string; recipient_id: string }) => {
          notifByUser.set(n.recipient_id, n.id)
        })
      }
    }

    // ── Expo mesajları ──
    const messages: ExpoMessage[] = []
    const meta: typeof list & { notification_id: string | null }[] = [] as any
    const metaList: {
      notification_id: string | null
      user_id: string
      device_id: string
      push_token: string
    }[] = []

    for (const t of list) {
      if (!isValidExpoToken(t.push_token)) continue

      messages.push({
        to: t.push_token,
        title,
        body,
        data: {
          type: "promo",
          notification_id: notifByUser.get(t.user_id) ?? null,
          route: params.route ?? null,
        },
        sound: "default",
        channelId: "default",
        priority: "default",
        ttl: 60 * 60 * 24 * 3,
      })

      metaList.push({
        notification_id: notifByUser.get(t.user_id) ?? null,
        user_id: t.user_id,
        device_id: t.device_id,
        push_token: t.push_token,
      })
    }

    if (messages.length === 0) {
      return { ok: false, error: "Geçerli Expo token'ı bulunamadı." }
    }

    // ── Gönder ──
    const results = await sendExpoPush(messages)

    const payload = results.map((res) => {
      const m = metaList[res.index]
      return {
        notification_id: m.notification_id,
        user_id: m.user_id,
        device_id: m.device_id,
        push_token: m.push_token,
        type: "promo",
        title,
        body,
        result: res.ok ? "ok" : "error",
        error_code: res.errorCode ?? null,
        error_message: res.errorMessage ?? null,
        source: "manual",
        sent_by: session.sub,
      }
    })

    const { data: recorded } = await sb.rpc("admin_record_push_results", { p_results: payload })
    const r = (recorded ?? {}) as { basarili?: number; basarisiz?: number; silinen_token?: number }

    await logAudit({
      actor: session.sub,
      action: "broadcast_send",
      targetType: "push",
      detail: {
        tip: "manuel_push",
        baslik: title,
        mesaj: body.slice(0, 120),
        cihaz: messages.length,
        basarili: r.basarili ?? 0,
        basarisiz: r.basarisiz ?? 0,
        sehirler: params.cities,
        sadece_ogrenci: params.studentsOnly,
        platformlar: params.platforms,
        bildirim_kaydi: params.alsoCreateNotification,
      },
    })

    revalidatePath("/push")
    revalidatePath("/notifications")
    revalidatePath("/")

    return {
      ok: true,
      gonderilen: messages.length,
      basarili: r.basarili ?? 0,
      basarisiz: r.basarisiz ?? 0,
      silinenToken: r.silinen_token ?? 0,
      message: `${messages.length} cihaza gönderildi · ${r.basarili ?? 0} başarılı · ${
        r.basarisiz ?? 0
      } başarısız`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════════════════════════════════════════════════════
   3) OKUMA — istatistik, log, ayarlar
═══════════════════════════════════════════════════════════════ */

export async function fetchPushStats(): Promise<{ stats: PushStats | null; error?: string }> {
  await assertSession()
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_push_stats")
    if (error) return { stats: null, error: error.message }
    return { stats: data as PushStats }
  } catch (e) {
    return { stats: null, error: e instanceof Error ? e.message : "Bağlantı hatası." }
  }
}

export interface PushLogRow {
  id: string
  notification_id: string | null
  user_id: string | null
  username: string | null
  device_id: string | null
  type: string | null
  title: string | null
  body: string | null
  result: string
  error_code: string | null
  error_message: string | null
  source: string
  sent_by: string | null
  created_at: string
}

export async function fetchPushLog(
  result?: string | null,
  limit = 100
): Promise<{ items: PushLogRow[]; error?: string }> {
  await assertSession()
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_push_log", {
      p_result: result ?? null,
      p_limit: limit,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as PushLogRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Bağlantı hatası." }
  }
}

export interface PushSetting {
  type: string
  enabled: boolean
  title_template: string | null
  bypass_quiet: boolean
  collapse_window_sec: number | null
  sort_order: number
  gonderim_7g: number
}

export async function fetchPushSettings(): Promise<{ items: PushSetting[]; error?: string }> {
  await assertSession()
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_push_settings")
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as PushSetting[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Bağlantı hatası." }
  }
}

export async function togglePushType(
  type: string,
  enabled: boolean
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_update_push_setting", {
      p_type: type,
      p_enabled: enabled,
      p_title: null,
      p_bypass_quiet: null,
      p_collapse_sec: null,
    })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: "popup_toggle",
      targetType: "push_setting",
      targetId: type,
      detail: { tip: type, enabled },
    })

    revalidatePath("/push")
    return { ok: true, message: enabled ? `${type} push'u açıldı.` : `${type} push'u kapatıldı.` }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export interface AppSetting {
  key: string
  value: string | null
  description: string | null
  updated_at: string
}

export async function fetchAppSettings(): Promise<{ items: AppSetting[]; error?: string }> {
  await assertSession()
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_settings")
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as AppSetting[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Bağlantı hatası." }
  }
}

export async function setAppSetting(
  key: string,
  value: string | null
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  // Sadece bilinen anahtarlara izin ver — rastgele ayar yazılmasın
  const ALLOWED = [
    "push_enabled",
    "push_panel_url",
    "push_webhook_secret",
    "push_quiet_start",
    "push_quiet_end",
    "push_default_sound",
  ]
  if (!ALLOWED.includes(key)) {
    return { ok: false, error: `Bu ayar panelden değiştirilemez: ${key}` }
  }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_set_setting", {
      p_key: key,
      p_value: value === null || value === "" ? null : value,
    })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: "popup_update",
      targetType: "app_setting",
      targetId: key,
      // ★ Gizli anahtarın değerini audit log'a YAZMIYORUZ
      detail: { key, value: key.includes("secret") ? "***" : value },
    })

    revalidatePath("/push")
    return { ok: true, message: "Ayar kaydedildi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/** Panelde uyarı göstermek için — .env'de Expo token var mı */
export async function checkExpoToken(): Promise<{ hasToken: boolean }> {
  await assertSession()
  return { hasToken: hasExpoAccessToken() }
}
