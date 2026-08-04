// src/actions/ad.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// REKLAM VE BOOST YÖNETİMİ
//
// ★ Kapasite kuralı SQL'de: panel "onayla" dediğinde alan doluysa
//   kampanya 'approved' olarak bekliyor, aktifleşmiyor. Panel bunu
//   kullanıcıya söylüyor ve "önce mevcut reklamı pasife al" diyor.
//   Kuralı iki yerde tutmuyoruz — tek kaynak veritabanı.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import { genelAdres } from "@/lib/storage-url"

export type AdStatus =
  | "pending" | "approved" | "active" | "rejected"
  | "paused" | "expired" | "cancelled" | "edit_pending"

export interface AdCounts {
  bekleyen: number
  aktif: number
  onayli_bekler: number
  duzenleme: number
  boost_bekleyen: number
  boost_aktif: number
  yakinda_biten: number
  aylik_gelir: number
  alanlar: { key: string; ad: string; capacity: number; aktif: number; sort_order: number }[]
}

export interface AdRow {
  id: string
  advertiser_id: string
  advertiser_username: string | null
  advertiser_name: string | null
  advertiser_avatar: string | null
  advertiser_email: string | null
  slot_key: string
  slot_ad: string
  title: string
  description: string | null
  image_url: string | null
  logo_url: string | null
  target_type: string
  target_value: string | null
  months: number
  monthly_price: number
  total_price: number
  status: AdStatus
  reject_reason: string | null
  offer_note: string | null
  offer_count: number
  starts_at: string | null
  ends_at: string | null
  created_at: string
  kalan_gun: number | null
  gosterim: number
  tiklama: number
  bekleyen_duzenleme: number
}

export interface BoostRow {
  id: string
  user_id: string
  username: string | null
  avatar_url: string | null
  email: string | null
  content_type: string
  content_id: string
  content_title: string | null
  boost_type: "boost" | "super_boost"
  monthly_price: number
  note: string | null
  offer_no: number
  status: string
  reject_reason: string | null
  starts_at: string | null
  ends_at: string | null
  created_at: string
  kalan_gun: number | null
}

export async function fetchAdCounts(): Promise<{ counts: AdCounts | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_ad_counts")
    if (error) return { counts: null, error: error.message }
    return { counts: data as AdCounts }
  } catch (e) {
    return { counts: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function fetchAds(params: {
  status?: string | null
  slot?: string | null
  limit?: number
}): Promise<{ items: AdRow[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_ads", {
      p_status: params.status || null,
      p_slot: params.slot || null,
      p_limit: params.limit ?? 100,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as AdRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function fetchAdDetail(id: string): Promise<{ detail: unknown; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_ad_detail", { p_id: id })
    if (error) return { detail: null, error: error.message }
    return { detail: data }
  } catch (e) {
    return { detail: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

async function run(
  fn: string,
  args: Record<string, unknown>,
  audit: { action: string; id: string; detail?: Record<string, unknown> }
): Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc(fn, args)
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: audit.action as never,
      targetType: "ad",
      targetId: audit.id,
      detail: audit.detail ?? null,
    })

    revalidatePath("/reklamlar")
    revalidatePath(`/reklamlar/${audit.id}`)
    revalidatePath("/")

    const r = (data ?? {}) as Record<string, unknown>
    return {
      ok: true,
      data,
      message: r.aktif_edilemedi
        ? String(r.sebep ?? "Onaylandı ama alan dolu olduğu için yayına alınamadı.")
        : undefined,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function approveAdAction(id: string) {
  return run("admin_ad_approve", { p_campaign_id: id, p_by: "panel" },
    { action: "ad_approve", id })
}

export async function rejectAdAction(id: string, reason: string) {
  if (!reason.trim()) return { ok: false, error: "Red sebebi zorunlu." }
  return run("admin_ad_reject", { p_campaign_id: id, p_reason: reason, p_by: "panel" },
    { action: "ad_reject", id, detail: { sebep: reason } })
}

export async function pauseAdAction(id: string) {
  return run("admin_ad_pause", { p_campaign_id: id }, { action: "ad_pause", id })
}

export async function resumeAdAction(id: string) {
  return run("admin_ad_resume", { p_campaign_id: id }, { action: "ad_resume", id })
}

export async function decideAdEditAction(editId: string, approve: boolean, reason?: string) {
  if (!approve && !reason?.trim()) return { ok: false, error: "Red sebebi zorunlu." }
  return run("admin_ad_edit_decide",
    { p_edit_id: editId, p_approve: approve, p_reason: reason ?? null, p_by: "panel" },
    { action: approve ? "ad_edit_approve" : "ad_edit_reject", id: editId })
}

/* ═══════════════ BOOST ═══════════════ */

export async function fetchBoosts(status?: string | null): Promise<{
  items: BoostRow[]; error?: string
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_boosts", {
      p_status: status || null, p_limit: 100,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as BoostRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function decideBoostAction(id: string, approve: boolean, reason?: string) {
  if (!approve && !reason?.trim()) return { ok: false, error: "Red sebebi zorunlu." }
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_boost_decide", {
      p_id: id, p_approve: approve, p_reason: reason ?? null, p_by: session.sub,
    })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: (approve ? "boost_approve" : "boost_reject") as never,
      targetType: "boost", targetId: id,
    })

    revalidatePath("/reklamlar")
    return { ok: true, message: approve ? "Boost aktif edildi." : "Boost reddedildi." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function stopBoostAction(id: string) {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }
  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_boost_stop", { p_id: id })
    if (error) return { ok: false, error: error.message }
    await logAudit({ actor: session.sub, action: "boost_stop" as never, targetType: "boost", targetId: id })
    revalidatePath("/reklamlar")
    return { ok: true, message: "Boost durduruldu." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ PANELDEN REKLAM OLUŞTURMA ═══════════════ */

export async function createAdAction(params: {
  advertiserId: string
  slot: string
  title: string
  description?: string | null
  imageUrl?: string | null
  logoUrl?: string | null
  targetType: string
  targetValue?: string | null
  months: number
  monthlyPrice: number
  activate: boolean
  note?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  if (!params.advertiserId) return { ok: false, error: "Reklam veren seçilmeli." }
  if (!params.title.trim()) return { ok: false, error: "Başlık zorunlu." }
  if (!params.monthlyPrice || params.monthlyPrice <= 0) {
    return { ok: false, error: "Aylık fiyat girilmeli." }
  }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_create_ad", {
      p_advertiser: params.advertiserId,
      p_slot: params.slot,
      p_title: params.title.trim(),
      p_description: params.description ?? null,
      p_image_url: params.imageUrl ?? null,
      p_logo_url: params.logoUrl ?? null,
      p_target_type: params.targetType,
      p_target_value: params.targetValue ?? null,
      p_months: params.months,
      p_monthly_price: params.monthlyPrice,
      p_activate: params.activate,
      p_note: params.note ?? null,
    })
    if (error) return { ok: false, error: error.message }

    const r = (data ?? {}) as Record<string, unknown>

    await logAudit({
      actor: session.sub, action: "ad_approve",
      targetType: "ad", targetId: String(r.id ?? ""),
      detail: { panelden: true, alan: params.slot, fiyat: params.monthlyPrice },
    })

    revalidatePath("/reklamlar")
    revalidatePath("/")

    return {
      ok: true,
      message: r.uyari
        ? String(r.uyari)
        : r.durum === "active" ? "Reklam oluşturuldu ve yayına alındı."
        : "Reklam oluşturuldu, onay bekliyor.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/** Reklam görseli/logosu yükle — "reklam" bucket'ına, benzersiz adla */
export async function uploadAdMediaAction(form: FormData): Promise<{
  ok: boolean; error?: string; url?: string
}> {
  try { await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const file = form.get("file")
  const kind = String(form.get("kind") ?? "image")

  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Dosya seçilmedi." }
  if (file.size > 20 * 1024 * 1024) return { ok: false, error: "Görsel en fazla 20 MB olabilir." }
  if (file.type && !file.type.startsWith("image/")) {
    return { ok: false, error: "Sadece görsel yüklenebilir." }
  }

  try {
    const sb = getSupabaseAdmin()

    const nokta = file.name.lastIndexOf(".")
    const ext = nokta > 0
      ? file.name.slice(nokta + 1).toLowerCase().replace(/[^a-z0-9]/g, "")
      : (file.type === "image/png" ? "png" : "jpg")

    const d = new Date()
    const tarih = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
    const path = `${kind}/${tarih}-${Math.random().toString(36).slice(2, 10)}.${ext}`

    const bytes = new Uint8Array(await file.arrayBuffer())
    const { error } = await sb.storage.from("reklam").upload(path, bytes, {
      contentType: file.type || undefined,
      cacheControl: "31536000",
    })
    if (error) return { ok: false, error: `Yükleme başarısız: ${error.message}` }

    const pub = { publicUrl: genelAdres("reklam", path) }
    return { ok: true, url: pub.publicUrl }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════════════════════════════════════════════════════
   REKLAM DÜZENLEME — panelden doğrudan
   ★ Reklam verenin `ad_request_edit` akışından farklı: panel onay
     beklemeden yazıyor, çünkü zaten onaylayan taraf panel.
═══════════════════════════════════════════════════════════════ */

export interface AdDuzenleGirdi {
  id: string
  title?: string
  description?: string | null
  image_url?: string | null
  logo_url?: string | null
  /** Boş metin gönderilirse yönlendirme kaldırılıyor */
  target_value?: string | null
  monthly_price?: number
  months?: number
}

export async function updateAdAction(g: AdDuzenleGirdi): Promise<{
  ok: boolean
  error?: string
}> {
  try {
    const session = await assertSession()
    const sb = getSupabaseAdmin()

    const yama: Record<string, unknown> = {}

    if (g.title !== undefined) {
      const t = g.title.trim()
      if (t.length < 3) return { ok: false, error: "Başlık en az 3 karakter olmalı." }
      yama.title = t.slice(0, 120)
    }

    if (g.description !== undefined) {
      yama.description = g.description?.trim().slice(0, 1000) || null
    }

    if (g.image_url !== undefined) yama.image_url = g.image_url || null
    if (g.logo_url !== undefined) yama.logo_url = g.logo_url || null

    // ★ Adres doluysa external, boşsa yönlendirme yok
    if (g.target_value !== undefined) {
      const v = g.target_value?.trim() ?? ""
      if (v && !/^https?:\/\//i.test(v)) {
        return { ok: false, error: "Adres http:// ya da https:// ile başlamalı." }
      }
      yama.target_value = v || null
      yama.target_type = v ? "external" : "none"
    }

    if (g.months !== undefined) {
      if (![1, 2, 3].includes(g.months)) {
        return { ok: false, error: "Süre 1, 2 ya da 3 ay olabilir." }
      }
      yama.months = g.months
    }

    if (g.monthly_price !== undefined) {
      if (!Number.isFinite(g.monthly_price) || g.monthly_price < 1) {
        return { ok: false, error: "Geçerli bir aylık fiyat gir." }
      }
      // ★ Taban fiyat denetimi — veritabanı tetikleyicisi de kontrol
      //   ediyor ama kullanıcıya erken ve anlaşılır mesaj verelim
      const { data: slot } = await sb
        .from("ad_campaigns")
        .select("slot_key, ad_slots!inner(min_price)")
        .eq("id", g.id)
        .maybeSingle()

      const taban = Number(
        (slot as { ad_slots?: { min_price?: number } } | null)?.ad_slots?.min_price ?? 0
      )
      if (taban > 0 && g.monthly_price < taban) {
        return {
          ok: false,
          error: `Aylık fiyat en az ${taban.toLocaleString("tr-TR")} ₺ olmalı.`,
        }
      }
      yama.monthly_price = g.monthly_price
      // ★ total_price YAZILMIYOR — üretilmiş kolon
    }

    if (Object.keys(yama).length === 0) return { ok: true }

    const { error } = await sb.from("ad_campaigns").update(yama).eq("id", g.id)
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: "ad_update" as never,
      targetType: "ad_campaign",
      targetId: g.id,
      detail: yama,
    })

    revalidatePath("/reklamlar")
    revalidatePath(`/reklamlar/${g.id}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════════════════════════════════════════════════════
   BOOST DETAYI
═══════════════════════════════════════════════════════════════ */

export async function fetchBoostDetail(id: string): Promise<{
  detail: unknown
  error?: string
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()

    const { data: b, error } = await sb
      .from("boost_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle()

    if (error) return { detail: null, error: error.message }
    if (!b) return { detail: null, error: "Talep bulunamadı." }

    const talep = b as Record<string, unknown>

    // Sahibi
    const { data: sahip } = await sb
      .from("profiles")
      .select("id, username, name, business_name, avatar_url, email, phone, sehir")
      .eq("id", String(talep.user_id))
      .maybeSingle()

    // Öne çıkarılan içerik — tablo türe göre değişiyor
    const tablo =
      talep.content_type === "listing" ? "listings"
      : talep.content_type === "discount" ? "indirimler"
      : "etkinlikler"

    let icerik: Record<string, unknown> | null = null
    try {
      const { data } = await sb
        .from(tablo)
        .select("*")
        .eq("id", String(talep.content_id))
        .maybeSingle()
      icerik = (data as Record<string, unknown>) ?? null
    } catch {
      // Tablo yoksa ya da kayıt silinmişse boş geç
    }

    // Aynı içerik için verilen tüm teklifler
    const { data: gecmis } = await sb
      .from("boost_requests")
      .select("*")
      .eq("content_id", String(talep.content_id))
      .eq("user_id", String(talep.user_id))
      .order("offer_no", { ascending: false })

    // Alan doluluğu
    const { data: slot } = await sb
      .from("ad_slots")
      .select("capacity, min_price")
      .eq("key", `boost_${String(talep.content_type)}`)
      .maybeSingle()

    const { count: aktifSayi } = await sb
      .from("boost_requests")
      .select("id", { count: "exact", head: true })
      .eq("content_type", String(talep.content_type))
      .eq("boost_type", String(talep.boost_type))
      .eq("status", "active")

    /* ── Analitik ──
       ★ Boost'un kendi gösterim sayacı yok; içeriğin görüntülenme ve
         etkileşim sayıları okunuyor. Boost süresi boyunca değişim
         anlamlı olan bu. Kolon adları projeler arası değişebildiği
         için hepsi deneniyor. */
    const analitik = {
      goruntulenme: sayiAl(icerik, ["views", "view_count", "goruntulenme", "izlenme"]),
      favori: sayiAl(icerik, ["favorites", "favorite_count", "favori_sayisi", "kaydedilme"]),
      etkilesim: sayiAl(icerik, ["clicks", "click_count", "tiklama", "katilimci_sayisi"]),
    }

    /* Günlük gösterim — boost alanı için toplu istatistik varsa */
    let gunluk: { gun: string; gosterim: number; tiklama: number }[] = []
    try {
      const { data: g } = await sb
        .from("ad_stats_daily")
        .select("gun, gosterim, tiklama")
        .eq("campaign_id", String(talep.id))
        .order("gun", { ascending: true })
        .limit(30)
      gunluk = (g as typeof gunluk) ?? []
    } catch {
      // Tablo boost'u izlemiyorsa boş geç
    }

    return {
      detail: {
        talep,
        sahip: sahip ?? null,
        icerik,
        analitik,
        gunluk,
        gecmis: (gecmis as Record<string, unknown>[]) ?? [],
        slot: {
          kapasite: Number((slot as { capacity?: number } | null)?.capacity ?? 1),
          aktif: aktifSayi ?? 0,
          min_price: Number((slot as { min_price?: number } | null)?.min_price ?? 0),
        },
      },
    }
  } catch (e) {
    return { detail: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/** Boost teklif tutarını panelden güncelle */
/**
 * ÖNE ÇIKARMA GÜNCELLE — panelden tam düzenleme
 *
 * ★ Eskiden sadece fiyat değiştirilebiliyordu. Panel onaylayan taraf;
 *   süreyi uzatmak, seviyeyi yükseltmek ve durumu değiştirmek de
 *   buradan yapılabilmeli.
 *
 * ★ Sadece GÖNDERİLEN alanlar yazılıyor — `undefined` olanlar
 *   dokunulmadan kalıyor.
 */
export interface BoostDuzenleGirdi {
  id: string
  monthly_price?: number
  months?: number
  boost_type?: "boost" | "super_boost"
  content_type?: "listing" | "discount" | "event"
  content_id?: string
  note?: string | null
  status?: "pending" | "approved" | "active" | "rejected" | "expired" | "cancelled"
  reject_reason?: string | null
  /** Süreyi bugünden yeniden başlat */
  yeniden_baslat?: boolean
}

/**
 * BOOST DÜZENLE — panelden
 *
 * ★ Sadece fiyat değil: seviye, içerik, süre, durum ve not da
 *   değiştirilebiliyor. Panel onaylayan taraf olduğu için doğrudan
 *   yazıyor.
 *
 * ★ İçerik değişirse sahiplik yeniden doğrulanıyor — yanlışlıkla
 *   başkasının ilanı öne çıkarılmasın.
 */
export async function updateBoostAction(
  g: BoostDuzenleGirdi
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await assertSession()
    const sb = getSupabaseAdmin()

    const { data: mevcutRaw } = await sb
      .from("boost_requests")
      .select("*")
      .eq("id", g.id)
      .maybeSingle()

    const mevcut = mevcutRaw as Record<string, unknown> | null
    if (!mevcut) return { ok: false, error: "Talep bulunamadı." }

    const yama: Record<string, unknown> = {}

    /* ── İçerik ── */
    const yeniTur = String(g.content_type ?? mevcut.content_type)
    if (g.content_id !== undefined && g.content_id !== mevcut.content_id) {
      // ★ Sahiplik doğrulaması — içerik bu kullanıcıya mı ait?
      const { data: icerik } = await sb
        .from(ICERIK_TABLO[yeniTur])
        .select("id, user_id")
        .eq("id", g.content_id)
        .maybeSingle()

      if (!icerik) return { ok: false, error: "Seçilen içerik bulunamadı." }
      if (String((icerik as { user_id?: string }).user_id) !== String(mevcut.user_id)) {
        return { ok: false, error: "Bu içerik talep sahibine ait değil." }
      }

      yama.content_id = g.content_id
    }

    if (g.content_type !== undefined) yama.content_type = g.content_type
    if (g.boost_type !== undefined) yama.boost_type = g.boost_type
    if (g.note !== undefined) yama.note = g.note?.trim().slice(0, 500) || null

    /* ── Süre ── */
    if (g.months !== undefined) {
      if (!Number.isFinite(g.months) || g.months < 1 || g.months > 12) {
        return { ok: false, error: "Süre 1–12 ay arasında olmalı." }
      }
      yama.months = g.months
    }

    /* ── Fiyat + taban denetimi ── */
    if (g.monthly_price !== undefined) {
      if (!Number.isFinite(g.monthly_price) || g.monthly_price < 1) {
        return { ok: false, error: "Geçerli bir aylık fiyat gir." }
      }

      const { data: slot } = await sb
        .from("ad_slots")
        .select("min_price")
        .eq("key", `boost_${yeniTur}`)
        .maybeSingle()

      const taban = Number((slot as { min_price?: number } | null)?.min_price ?? 0)
      if (taban > 0 && g.monthly_price < taban) {
        return {
          ok: false,
          error: `Aylık fiyat en az ${taban.toLocaleString("tr-TR")} ₺ olmalı.`,
        }
      }
      yama.monthly_price = g.monthly_price
    }

    /* ── Durum ── */
    if (g.status !== undefined) {
      yama.status = g.status
      // Reddedilmişten çıkarken sebebi temizle
      if (g.status !== "rejected") yama.reject_reason = null
    }
    if (g.reject_reason !== undefined) {
      yama.reject_reason = g.reject_reason?.trim() || null
    }

    /* ── Süreyi yeniden başlat ──
       ★ Aktife alırken ya da süre değişince tarihler tutarsız kalmasın */
    const aktifOluyor = g.status === "active" || (
      g.status === undefined && mevcut.status === "active"
    )

    if (g.yeniden_baslat || (g.status === "active" && mevcut.status !== "active")) {
      const ay = Number(yama.months ?? mevcut.months ?? 1)
      const bas = new Date()
      const bit = new Date(bas)
      bit.setMonth(bit.getMonth() + ay)
      yama.starts_at = bas.toISOString()
      yama.ends_at = bit.toISOString()
    } else if (yama.months !== undefined && aktifOluyor && mevcut.starts_at) {
      // Süre değişti ama yeniden başlatılmıyor — bitişi kaydır
      const bas = new Date(String(mevcut.starts_at))
      const bit = new Date(bas)
      bit.setMonth(bit.getMonth() + Number(yama.months))
      yama.ends_at = bit.toISOString()
    }

    if (Object.keys(yama).length === 0) return { ok: true }

    const { error } = await sb.from("boost_requests").update(yama).eq("id", g.id)
    if (error) return { ok: false, error: error.message }

    // ★ Aktifse içerik bayrağını tazele
    if (aktifOluyor) {
      try { await sb.rpc("boost_apply_flags", { p_boost_id: g.id }) } catch { /* RPC yoksa geç */ }
    }

    await logAudit({
      actor: session.sub,
      action: "boost_update" as never,
      targetType: "boost_request",
      targetId: g.id,
      detail: yama,
    })

    revalidatePath("/reklamlar")
    revalidatePath(`/reklamlar/boost/${g.id}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * BOOST SİL
 * ★ Kalıcı siliyor. Aktifse önce içerik bayrağı kaldırılıyor —
 *   yoksa ilan listede öne çıkmış görünmeye devam ederdi.
 */
export async function deleteBoostAction(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const session = await assertSession()
    const sb = getSupabaseAdmin()

    const { data: b } = await sb
      .from("boost_requests")
      .select("id, status, content_id, content_type")
      .eq("id", id)
      .maybeSingle()

    if (!b) return { ok: false, error: "Talep bulunamadı." }

    // ★ Önce pasife al, sonra sil — bayrak temizlensin
    if (String((b as { status?: string }).status) === "active") {
      await sb.from("boost_requests").update({ status: "cancelled" }).eq("id", id)
      try { await sb.rpc("boost_apply_flags", { p_boost_id: id }) } catch { /* geç */ }
    }

    const { error } = await sb.from("boost_requests").delete().eq("id", id)
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub,
      action: "boost_delete" as never,
      targetType: "boost_request",
      targetId: id,
      detail: b as Record<string, unknown>,
    })

    revalidatePath("/reklamlar")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════════════════════════════════════════════════════
   MANUEL BOOST — panelden öne çıkarma oluştur
═══════════════════════════════════════════════════════════════ */

export interface KullaniciIcerik {
  id: string
  baslik: string
  gorsel: string | null
  alt_bilgi: string | null
  olusturma: string | null
}

const ICERIK_TABLO: Record<string, string> = {
  listing: "listings",
  discount: "indirimler",
  event: "etkinlikler",
}

/**
 * Bir kullanıcının içeriklerini getirir — boost için seçilecek.
 *
 * ★ Kolon adları projeler arası değişebiliyor (`title`/`baslik`,
 *   `images`/`image_url`). Hepsini deniyoruz; bulamazsak "Başlıksız"
 *   yazıyoruz ama kayıt yine de seçilebiliyor.
 */
export async function fetchUserContent(
  userId: string,
  contentType: string
): Promise<{ items: KullaniciIcerik[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()

    const tablo = ICERIK_TABLO[contentType]
    if (!tablo) return { items: [], error: "Geçersiz içerik türü." }
    if (!userId) return { items: [], error: "Kullanıcı seçilmeli." }

    const { data, error } = await sb
      .from(tablo)
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100)

    if (error) return { items: [], error: error.message }

    const items = ((data ?? []) as Record<string, unknown>[]).map((r) => {
      const baslik =
        (r.title as string) ?? (r.baslik as string) ??
        (r.name as string) ?? (r.ad as string) ?? "Başlıksız"

      let gorsel: string | null = null
      for (const k of ["images", "image_url", "cover_url", "thumbnail_url", "kapak_url", "gorseller"]) {
        const v = r[k]
        if (typeof v === "string" && v.startsWith("http")) { gorsel = v; break }
        if (Array.isArray(v)) {
          const f = v.find((x) => typeof x === "string" && (x as string).startsWith("http"))
          if (f) { gorsel = f as string; break }
        }
      }

      let alt: string | null = null
      if (contentType === "listing") {
        const p = r.price ?? r.fiyat
        if (p !== null && p !== undefined) {
          alt = `${Number(p).toLocaleString("tr-TR")} ₺`
        }
      } else if (contentType === "discount") {
        const o = r.indirim_orani ?? r.discount ?? r.oran
        if (o !== null && o !== undefined) alt = `%${o} indirim`
      } else {
        const t = r.start_date ?? r.start_at ?? r.tarih
        if (t) alt = String(t).slice(0, 10)
      }

      return {
        id: String(r.id),
        baslik: String(baslik),
        gorsel,
        alt_bilgi: alt,
        olusturma: r.created_at ? String(r.created_at) : null,
      }
    })

    return { items }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * Panelden boost oluştur.
 *
 * ★ `boost_submit` RPC'si `auth.uid()` kullanıyor — panelde oturum
 *   yok, o yüzden doğrudan tabloya yazıyoruz. Kapasite ve taban fiyat
 *   kontrollerini burada elle yapıyoruz.
 *
 * ★ `activate: true` ise doğrudan yayına alıyoruz (panel zaten
 *   onaylayan taraf). `false` ise `pending` olarak bekliyor.
 */
export async function createBoostAction(params: {
  userId: string
  contentType: string
  contentId: string
  boostType: string
  monthlyPrice: number
  months: number
  activate: boolean
  note?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string; id?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  if (!params.userId) return { ok: false, error: "Kullanıcı seçilmeli." }
  if (!params.contentId) return { ok: false, error: "Öne çıkarılacak içerik seçilmeli." }
  if (!["listing", "discount", "event"].includes(params.contentType)) {
    return { ok: false, error: "Geçersiz içerik türü." }
  }
  if (!["boost", "super_boost"].includes(params.boostType)) {
    return { ok: false, error: "Geçersiz öne çıkarma türü." }
  }
  if (!params.monthlyPrice || params.monthlyPrice <= 0) {
    return { ok: false, error: "Aylık fiyat girilmeli." }
  }
  if (![1, 2, 3].includes(params.months)) {
    return { ok: false, error: "Süre 1, 2 ya da 3 ay olabilir." }
  }

  try {
    const sb = getSupabaseAdmin()

    // ── İçerik gerçekten bu kullanıcıya mı ait? ──
    const tablo = ICERIK_TABLO[params.contentType]
    const { data: icerik } = await sb
      .from(tablo)
      .select("id, user_id")
      .eq("id", params.contentId)
      .maybeSingle()

    if (!icerik) return { ok: false, error: "İçerik bulunamadı." }
    if (String((icerik as { user_id: string }).user_id) !== params.userId) {
      return { ok: false, error: "Bu içerik seçilen kullanıcıya ait değil." }
    }

    // ── Alan bilgisi ──
    const { data: slot } = await sb
      .from("ad_slots")
      .select("capacity, min_price")
      .eq("key", `boost_${params.contentType}`)
      .maybeSingle()

    const kapasite = Number((slot as { capacity?: number } | null)?.capacity ?? 1)
    const taban = Number((slot as { min_price?: number } | null)?.min_price ?? 0)

    if (taban > 0 && params.monthlyPrice < taban) {
      return {
        ok: false,
        error: `Aylık fiyat en az ${taban.toLocaleString("tr-TR")} ₺ olmalı.`,
      }
    }

    // ── Aynı içerik zaten aktif mi? ──
    const { data: mevcut } = await sb
      .from("boost_requests")
      .select("id, status")
      .eq("content_id", params.contentId)
      .in("status", ["pending", "approved", "active"])
      .maybeSingle()

    if (mevcut) {
      return {
        ok: false,
        error: "Bu içerik için zaten bekleyen ya da aktif bir öne çıkarma var.",
      }
    }

    // ── Kapasite ──
    const { count: aktifSayi } = await sb
      .from("boost_requests")
      .select("id", { count: "exact", head: true })
      .eq("content_type", params.contentType)
      .eq("boost_type", params.boostType)
      .eq("status", "active")

    if (params.activate && (aktifSayi ?? 0) >= kapasite) {
      return {
        ok: false,
        error: `Bu alan dolu (${aktifSayi}/${kapasite}). Yayına almadan kaydet ya da birini durdur.`,
      }
    }

    // ── Teklif numarası ──
    const { data: gecmis } = await sb
      .from("boost_requests")
      .select("offer_no")
      .eq("content_id", params.contentId)
      .order("offer_no", { ascending: false })
      .limit(1)
      .maybeSingle()

    const teklifNo = Number((gecmis as { offer_no?: number } | null)?.offer_no ?? 0) + 1

    const simdi = new Date()
    const bitis = new Date(simdi)
    bitis.setMonth(bitis.getMonth() + params.months)

    const { data: yeni, error } = await sb
      .from("boost_requests")
      .insert({
        user_id: params.userId,
        content_type: params.contentType,
        content_id: params.contentId,
        boost_type: params.boostType,
        months: params.months,
        monthly_price: params.monthlyPrice,
        note: params.note?.trim().slice(0, 500) || null,
        offer_no: teklifNo,
        status: params.activate ? "active" : "pending",
        starts_at: params.activate ? simdi.toISOString() : null,
        ends_at: params.activate ? bitis.toISOString() : null,
      })
      .select("id")
      .maybeSingle()

    if (error) return { ok: false, error: error.message }

    const id = String((yeni as { id: string } | null)?.id ?? "")

    await logAudit({
      actor: session.sub,
      action: "boost_create" as never,
      targetType: "boost_request",
      targetId: id,
      detail: {
        user_id: params.userId,
        content_type: params.contentType,
        content_id: params.contentId,
        boost_type: params.boostType,
        monthly_price: params.monthlyPrice,
        months: params.months,
        activate: params.activate,
      },
    })

    revalidatePath("/reklamlar")

    return {
      ok: true,
      id,
      message: params.activate
        ? "Öne çıkarma oluşturuldu ve yayına alındı."
        : "Öne çıkarma oluşturuldu, onay bekliyor.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * Kayıttan sayısal alan oku.
 * ★ Kolon adları projeler arası değişebiliyor (`views` / `goruntulenme`
 *   gibi). Adayları sırayla deniyor, bulamazsa null dönüyor —
 *   arayüz "—" gösteriyor, uydurma sayı üretilmiyor.
 */
function sayiAl(
  kayit: Record<string, unknown> | null,
  adaylar: string[]
): number | null {
  if (!kayit) return null
  for (const a of adaylar) {
    const v = kayit[a]
    if (typeof v === "number" && Number.isFinite(v)) return v
    if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v)
  }
  return null
}
