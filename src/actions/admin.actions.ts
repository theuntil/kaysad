// src/actions/admin.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// PANEL GENELİ VERİLER
//
// Kullanıcı sayıları, şehir dağılımı ve yan menüdeki bekleyen iş
// sayaçları. Hepsi tek dosyada çünkü hem ana sayfa hem yan menü hem
// kullanıcılar sayfası aynı sorguları istiyor.
// ═══════════════════════════════════════════════════════════════════════

import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import type { UserCounts, CityStat, CityStatFull } from "@/lib/types.v3"

export async function fetchUserCounts(): Promise<{ counts: UserCounts | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_user_counts")
    if (error) return { counts: null, error: error.message }
    return { counts: (data ?? null) as UserCounts | null }
  } catch (e) {
    return { counts: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * 81 ilin tamamı döner — kullanıcısı olmayan iller de `0` ile listede.
 * Hedefleme ekranı ve ana sayfa şehir widget'ı bunu kullanıyor.
 */
export async function fetchCityStats(): Promise<{ items: CityStat[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_city_stats")
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as CityStat[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * Yan menüdeki kırmızı/sarı sayaçlar. Amaç: panele girdiğin an
 * "3 işletme başvurusu bekliyor" görmen — sayfaları tek tek gezmemen.
 *
 * Hata durumunda sıfır döner, ASLA sayfayı düşürmez.
 */
export async function fetchNavBadges(): Promise<{
  bekleyenIsletme: number
  bekleyenOgrenci: number
  tutarsiz: number
  banli: number
  sikayet: number
  reklam: number
  mail: number
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    // ★ Tek sorgu: dashboard sayaçları hem onay hem şikâyet hem tutarsızlığı
    //   birlikte veriyor. Menü için iki ayrı RPC atmak gereksizdi.
    const [{ data }, { data: ad }, { data: ml }] = await Promise.all([
      sb.rpc("admin_dashboard_counts"),
      sb.rpc("admin_ad_counts"),
      sb.rpc("admin_mail_stats"),
    ])
    const c = (data ?? {}) as Record<string, number>
    const a = (ad ?? {}) as Record<string, number>
    const m = (ml ?? {}) as Record<string, number>
    return {
      bekleyenIsletme: c.bekleyen_isletme ?? 0,
      bekleyenOgrenci: c.bekleyen_ogrenci ?? 0,
      tutarsiz: c.tutarsiz ?? 0,
      banli: c.banli ?? 0,
      sikayet: c.sikayet ?? 0,
      // Bekleyen reklam teklifi + düzenleme + boost talebi
      reklam: (a.bekleyen ?? 0) + (a.duzenleme ?? 0) + (a.boost_bekleyen ?? 0),
      mail: m.gelen_okunmamis ?? 0,
    }
  } catch {
    return {
      bekleyenIsletme: 0, bekleyenOgrenci: 0, tutarsiz: 0,
      banli: 0, sikayet: 0, reklam: 0, mail: 0,
    }
  }
}


/**
 * Tüm şehirler sayfası için genişletilmiş istatistik: öğrenci, işletme,
 * banlı, son 7 gün ve son kayıt tarihi kırılımlarıyla 81 il.
 */
export async function fetchCityStatsFull(): Promise<{ items: CityStatFull[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_city_stats_full")
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as CityStatFull[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ ANA SAYFA SAYAÇLARI ═══════════════ */

export interface LiveCounts {
  kullanici: number
  cihaz?: number | null
  post: number | null
  ilan: number | null
  indirim: number | null
  etkinlik: number | null
  sikayet?: number
}

export interface DashboardCounts extends LiveCounts {
  bekleyen_isletme: number
  bekleyen_ogrenci: number
  sikayet: number
  sikayet_toplam: number
  tutarsiz: number
  banli: number
  yeni_7g: number
}

export async function fetchDashboardCounts(): Promise<{
  counts: DashboardCounts | null; error?: string
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_dashboard_counts")
    if (error) return { counts: null, error: error.message }
    return { counts: data as DashboardCounts }
  } catch (e) {
    return { counts: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * 5 saniyede bir çağrılan HAFİF sayaç. Sadece count(*) yapıyor —
 * ağır ana sayfa sorgusunu bu sıklıkta çalıştırmak veritabanını yorardı.
 * Hata durumunda null döner ve istemci eski değeri korur (ekran zıplamaz).
 */
export async function fetchLiveCounts(): Promise<LiveCounts | null> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_live_counts")
    if (error) return null
    return data as LiveCounts
  } catch {
    return null
  }
}


/* ═══════════════ EK İSTATİSTİKLER ═══════════════ */

export interface DashboardExtra {
  cihaz_toplam: number
  cihaz_push: number
  platformlar: { platform: string; adet: number; push: number }[]
  top_sehirler: { sehir: string; kullanici: number }[]
  son_gonderim: {
    tip: string; mesaj: string; tarih: string
    toplam: number; okundu: number
    push_sent: number; push_failed: number; push_pending: number
  } | null
  buyume: { gun: string; adet: number }[]
  push_acik_oran: number
}

export async function fetchDashboardExtra(): Promise<{
  extra: DashboardExtra | null; error?: string
}> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_dashboard_extra")
    if (error) return { extra: null, error: error.message }
    return { extra: data as DashboardExtra }
  } catch (e) {
    return { extra: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ ŞEHİR DETAYI ═══════════════ */

export interface CityDetail {
  sehir: string
  kullanici: number; aktif: number; banli: number
  isletme: number; ogrenci: number; dogrulanmis: number
  yeni_7g: number; yeni_30g: number
  ilk_kayit: string | null; son_kayit: string | null
  cihaz: number; push_cihaz: number
  platformlar: { platform: string; adet: number }[]
  bekleyen_isletme: number; bekleyen_ogrenci: number
  buyume: { hafta: string; adet: number }[]
  top_kullanici: {
    id: string; username: string | null; name: string | null
    avatar_url: string | null; role: string | null
    post_count: number; follower_count: number
  }[]
  sira: number | null
  toplam_kullanici: number
  icerik: Record<string, { toplam: number | null; son_30_gun: number | null }>
}

export async function fetchCityDetail(
  sehir: string
): Promise<{ detail: CityDetail | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_city_detail", { p_sehir: sehir })
    if (error) return { detail: null, error: error.message }
    return { detail: data as CityDetail }
  } catch (e) {
    return { detail: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ KAPSAMLI İSTATİSTİK ═══════════════ */

export async function fetchFullStats(): Promise<{ stats: Record<string, unknown> | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_full_stats")
    if (error) return { stats: null, error: error.message }
    return { stats: data as Record<string, unknown> }
  } catch (e) {
    return { stats: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
