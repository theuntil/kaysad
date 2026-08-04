// src/actions/send.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// BİRLEŞİK GÖNDERİM — "Bildirimler" ve "Push" artık tek akış
//
// ┌─ NEDEN BİRLEŞTİ ──────────────────────────────────────────────────┐
// │ İkisi aynı işin iki yüzüydü: aynı kitle, aynı metin, aynı         │
// │ hedefleme. Ayrı sayfa tutmak aynı formu iki kere doldurmak         │
// │ demekti. Artık tek form + KANAL anahtarı:                         │
// │                                                                   │
// │   both  → uygulama içi bildirim + telefona push  (varsayılan)     │
// │   inapp → sadece uygulama içi (zil ikonu) — telefon çalmaz        │
// │   push  → sadece telefona push — uygulama içinde iz bırakmaz      │
// └───────────────────────────────────────────────────────────────────┘
//
// ★ GÜVENLİK: Gönderim öncesi kitle sayımı ZORUNLU. Sayım ile gerçek
//   sayı arasında %25'ten fazla sapma varsa gönderim DURUR — ekranı
//   açtıktan sonra kitle büyümüş olabilir, bilmediğin kişilere spam
//   atmayı bu engelliyor.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import { sendExpoPush, isValidExpoToken, type ExpoMessage } from "@/lib/expo-push"
import type {
  SendChannel, SendType, SendPreview, SendAudience, SendHistoryRow, SendDetail,
} from "@/lib/types.v3"

const TYPES: SendType[] = ["promo", "earthquake", "popup"]
const CHANNELS: SendChannel[] = ["both", "inapp", "push"]

export interface SendResult {
  ok: boolean
  error?: string
  message?: string
  /** Uygulama içi bildirim düşen kullanıcı sayısı */
  inapp?: number
  /** Push denenen cihaz sayısı */
  cihaz?: number
  basarili?: number
  basarisiz?: number
  silinenToken?: number
}

/** notifications tarafı — `p_only_active` KABUL EDEN fonksiyonlar için */
function audienceArgs(a: SendAudience) {
  return {
    p_cities: a.cities?.length ? a.cities : null,
    p_students_only: !!a.studentsOnly,
    p_business_only: !!a.businessOnly,
    p_only_active: a.onlyActive !== false,
  }
}

/**
 * ★ admin_push_targets / admin_count_push_targets imzasında
 *   `p_only_active` YOK — cihaz sorgusu aktifliği zaten kendi içinde
 *   kontrol ediyor. Fazla parametre gönderince PostgREST fonksiyonu
 *   bulamıyor ve "Could not find the function ... in the schema cache"
 *   hatası veriyor. Bu yüzden push için ayrı bir argüman kurucu var.
 */
function pushTargetArgs(a: SendAudience) {
  return {
    p_cities: a.cities?.length ? a.cities : null,
    p_students_only: !!a.studentsOnly,
    p_business_only: !!a.businessOnly,
    p_platforms: a.platforms?.length ? a.platforms : null,
    p_active_days: a.activeDays,
  }
}

/* ═══════════════ 1) ÖN İZLEME — kaç kişiye gidecek? ═══════════════ */

export async function previewAudienceAction(
  audience: SendAudience
): Promise<{ ok: boolean; preview?: SendPreview; error?: string }> {
  try {
    await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_send_preview", {
      ...audienceArgs(audience),
      p_platforms: audience.platforms?.length ? audience.platforms : null,
      p_active_days: audience.activeDays,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, preview: data as SendPreview }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ 2) GÖNDER ═══════════════ */

export async function sendAction(params: {
  type: SendType
  channel: SendChannel
  /** ★ Doluysa hedefleme filtreleri yok sayılır: sadece bu kullanıcılara gider */
  userIds?: string[] | null
  /** Push başlığı. Boşsa tipe göre varsayılan kullanılır. */
  title?: string | null
  message: string
  popupId?: string | null
  /** Push'a tıklayınca açılacak uygulama içi adres, ör: /food */
  route?: string | null
  audience: SendAudience
  /** Kullanıcının ekranda gördüğü ve onayladığı sayılar */
  expected: { kullanici: number; cihaz: number }
}): Promise<SendResult> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  const type = params.type
  const channel = params.channel
  const message = (params.message ?? "").trim()

  if (!TYPES.includes(type)) return { ok: false, error: "Geçersiz gönderim tipi." }
  if (!CHANNELS.includes(channel)) return { ok: false, error: "Geçersiz kanal." }
  if (type !== "popup" && !message) return { ok: false, error: "Mesaj boş olamaz." }
  if (message.length > 300) return { ok: false, error: "Mesaj en fazla 300 karakter olabilir." }
  if (type === "popup" && !params.popupId) {
    return { ok: false, error: "Popup tipinde popup seçmek zorunlu." }
  }
  if (params.route && !params.route.startsWith("/")) {
    return { ok: false, error: "Yönlendirme adresi '/' ile başlamalı (ör: /food)." }
  }

  const title =
    (params.title ?? "").trim() ||
    (type === "earthquake" ? "ACİL UYARI" : "Kays")

  if (title.length > 80) return { ok: false, error: "Başlık en fazla 80 karakter olabilir." }

  try {
    const sb = getSupabaseAdmin()

    /* ── Sapma kontrolü ── */
    const secili = params.userIds?.filter(Boolean) ?? []
    const tekKisi = secili.length > 0

    let now: SendPreview

    if (tekKisi) {
      // ★ Seçili kullanıcı(lar) modunda sayım/sapma kontrolü anlamsız:
      //   kimin alacağı zaten kesin. Sadece push alabilir mi diye bakıyoruz.
      const { count: cihazSayisi, error: cErr } = await sb
        .from("devices")
        .select("device_id", { count: "exact", head: true })
        .in("user_id", secili)
        .not("push_token", "is", null)
      if (cErr) return { ok: false, error: "Cihazlar okunamadı: " + cErr.message }

      now = {
        kullanici: secili.length,
        push_kullanici: secili.length,
        push_cihaz: cihazSayisi ?? 0,
        push_acik: true,
        sessiz_saat: false,
      }

      const { data: setting } = await sb.rpc("app_setting", { p_key: "push_enabled" })
      now.push_acik = setting !== "false"
    } else {
      const { data: pv, error: pErr } = await sb.rpc("admin_send_preview", {
        ...audienceArgs(params.audience),
        p_platforms: params.audience.platforms?.length ? params.audience.platforms : null,
        p_active_days: params.audience.activeDays,
      })
      if (pErr) return { ok: false, error: "Kitle doğrulanamadı: " + pErr.message }
      now = pv as SendPreview
    }
    const gerekliSayi = channel === "push" ? now.push_cihaz : now.kullanici

    if (gerekliSayi === 0) {
      return {
        ok: false,
        error: channel === "push"
          ? "Bu filtrelere uyan, push alabilen cihaz yok. Gönderim yapılmadı."
          : "Bu filtrelere uyan hiç kullanıcı yok. Gönderim yapılmadı.",
      }
    }

    const beklenen = channel === "push"
      ? Math.max(0, params.expected.cihaz)
      : Math.max(0, params.expected.kullanici)

    // ★ Sapma kontrolü sadece KİTLE gönderiminde: tek kişide kitle büyümez
    if (!tekKisi && beklenen > 0) {
      const sapma = Math.abs(gerekliSayi - beklenen) / beklenen
      if (sapma > 0.25) {
        return {
          ok: false,
          error:
            `Kitle değişti (onayladığın: ${beklenen}, şu anki: ${gerekliSayi}). ` +
            `Güvenlik için gönderim durduruldu — sayımı yenileyip tekrar dene.`,
        }
      }
    }

    if (channel !== "inapp" && !now.push_acik) {
      return { ok: false, error: "Push sistemi kapalı. Ayarlardan açman gerekiyor." }
    }

    /* ── A) 'inapp' ve 'both': DB fonksiyonu satırları atar ──
       'both' durumunda satırlar push_status='pending' açılır ve
       trigger/sweep push'u kendisi gönderir — burada Expo'ya ayrıca
       istek atmıyoruz, yoksa çift push gider. */
    let inapp = 0

    if (channel === "inapp" || channel === "both") {
      // ★ v4: mesajdaki {ad} {sehir} gibi değişkenleri ALICI BAŞINA
      //   dolduruyor ve p_user_ids ile tek kişiye gönderimi destekliyor.
      const { data, error } = await sb.rpc("admin_send_v4", {
        p_type: type,
        p_message: type === "popup" ? (message || null) : message,
        p_channel: channel,
        p_popup_id: params.popupId ?? null,
        ...audienceArgs(params.audience),
        p_user_ids: tekKisi ? secili : null,
      })
      if (error) return { ok: false, error: error.message }
      inapp = (data as { gonderilen?: number } | null)?.gonderilen ?? 0

      await logAudit({
        actor: session.sub,
        action: "send",
        targetType: "notification",
        targetId: params.popupId ?? null,
        detail: {
          tip: type, kanal: channel, mesaj: message.slice(0, 160),
          kullanici: inapp,
          hedef: tekKisi ? { secili_kullanici: secili.length } : params.audience,
          kisisel: /\{(ad|kullanici_adi|sehir|eposta)\}/.test(message),
        },
      })

      revalidatePath("/gonderim")
      revalidatePath("/")

      return {
        ok: true,
        inapp,
        message: channel === "inapp"
          ? `${inapp} kullanıcıya uygulama içi bildirim düştü (push gönderilmedi).`
          : `${inapp} kullanıcıya bildirim oluşturuldu — push'lar sırayla gönderiliyor.`,
      }
    }

    /* ── B) 'push': notifications'a HİÇ satır atmadan doğrudan Expo ── */
    // ★ Kişiselleştirilmiş push: metni SQL alıcı başına dolduruyor,
    //   panel her cihaz için hazır mesajı alıyor.
    const { data: targets, error: tErr } = await sb.rpc("admin_push_targets_personal", {
      p_message: message,
      ...pushTargetArgs(params.audience),
      p_user_ids: tekKisi ? secili : null,
      p_limit: 50000,
    })
    if (tErr) return { ok: false, error: tErr.message }

    const list = (targets ?? []) as {
      user_id: string; device_id: string; push_token: string
      platform: string | null; message: string
    }[]

    if (list.length === 0) {
      return { ok: false, error: "Push alabilen cihaz bulunamadı." }
    }

    const messages: ExpoMessage[] = []
    const meta: { user_id: string; device_id: string; push_token: string; message: string }[] = []

    for (const t of list) {
      if (!isValidExpoToken(t.push_token)) continue
      messages.push({
        to: t.push_token,
        title,
        body: t.message || message,
        data: {
          type,
          // ★ null: uygulama içinde karşılığı olan bir bildirim YOK.
          //   Mobil taraf buna bakıp "okundu" işaretlemeye çalışmıyor.
          notification_id: null,
          route: params.route ?? null,
        },
        sound: "default",
        channelId: type === "earthquake" ? "urgent" : "default",
        priority: type === "earthquake" ? "high" : "default",
        ttl: 60 * 60 * 24 * 3,
      })
      meta.push({
        user_id: t.user_id, device_id: t.device_id,
        push_token: t.push_token, message: t.message || message,
      })
    }

    if (messages.length === 0) {
      return { ok: false, error: "Geçerli Expo token'ı bulunamadı." }
    }

    const results = await sendExpoPush(messages)

    const payload = results.map((res) => {
      const m = meta[res.index]
      return {
        notification_id: null,
        user_id: m.user_id,
        device_id: m.device_id,
        push_token: m.push_token,
        type,
        title,
        body: (meta[res.index] as { message?: string }).message ?? message,
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
      action: "send",
      targetType: "push",
      detail: {
        tip: type, kanal: "push", baslik: title, mesaj: message.slice(0, 160),
        cihaz: messages.length, basarili: r.basarili ?? 0, basarisiz: r.basarisiz ?? 0,
        hedef: params.audience,
      },
    })

    revalidatePath("/gonderim")
    revalidatePath("/")

    return {
      ok: true,
      inapp: 0,
      cihaz: messages.length,
      basarili: r.basarili ?? 0,
      basarisiz: r.basarisiz ?? 0,
      silinenToken: r.silinen_token ?? 0,
      message: `${messages.length} cihaza push gönderildi · ${r.basarili ?? 0} başarılı · ${r.basarisiz ?? 0} başarısız`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ 3) GERİ AL ═══════════════ */

export async function undoSendAction(params: {
  type: SendType
  message: string
  withinMinutes?: number
}): Promise<{ ok: boolean; silinen?: number; pushCikmis?: number; error?: string; message?: string }> {
  let session
  try {
    session = await assertSession()
  } catch {
    return { ok: false, error: "Oturum sona ermiş." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_undo_send_v3", {
      p_type: params.type,
      p_message: params.message,
      p_within_minutes: params.withinMinutes ?? 60,
    })
    if (error) return { ok: false, error: error.message }

    const r = (data ?? {}) as { silinen?: number; push_cikmis?: number }
    const silinen = r.silinen ?? 0
    const pushCikmis = r.push_cikmis ?? 0

    await logAudit({
      actor: session.sub,
      action: "send_undo",
      targetType: "notification",
      detail: { tip: params.type, mesaj: params.message.slice(0, 160), silinen, push_cikmis: pushCikmis },
    })

    revalidatePath("/gonderim")
    revalidatePath("/")

    return {
      ok: true,
      silinen,
      pushCikmis,
      message: pushCikmis > 0
        // ★ Dürüst uyarı: push telefonda göründüyse geri alınamaz.
        ? `${silinen} bildirim silindi. Ancak ${pushCikmis} tanesinin push'u zaten telefona düşmüştü — o bildirimler kullanıcıların telefonunda görüldü, silmek onu geri almıyor.`
        : `${silinen} bildirim silindi. Hiçbirinin push'u çıkmamıştı.`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ 4) GEÇMİŞ ═══════════════ */

export async function fetchSendHistory(
  limit = 50
): Promise<{ items: SendHistoryRow[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_sends", { p_limit: limit })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as SendHistoryRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ DEĞİŞKENLİ MESAJ ÖNİZLEME ═══════════════ */

/**
 * Mesajdaki {ad} {sehir} gibi değişkenleri gerçek bir kullanıcı için
 * (ya da örnek değerlerle) doldurup döner. Telefon önizlemesi bunu
 * kullanıyor — böylece gönderim öncesi metnin gerçekte nasıl görüneceği
 * tahmin değil, veritabanının verdiği cevap oluyor.
 */
export async function renderMessageAction(
  message: string, userId?: string | null
): Promise<{ ok: boolean; text?: string; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_render_message", {
      p_message: message,
      p_user_id: userId ?? null,
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, text: (data as string) ?? message }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ GÖNDERİM DETAY İSTATİSTİĞİ ═══════════════ */

export async function fetchSendDetail(
  type: SendType, message: string
): Promise<{ detail: SendDetail | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_send_detail", {
      p_type: type, p_message: message,
    })
    if (error) return { detail: null, error: error.message }
    return { detail: data as SendDetail }
  } catch (e) {
    return { detail: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
