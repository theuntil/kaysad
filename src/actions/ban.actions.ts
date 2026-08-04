// src/actions/ban.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// BAN İŞLEMLERİ
//
// İki ayrı ban türü var ve bilinçli olarak ayrı:
//
//   1. HESAP BANI  → admin_ban_user_full
//      Kullanıcıyı banlar. `banDevices: true` ise o hesabın bilinen
//      TÜM cihazlarına da ban düşer (yeni hesap açıp devam etmesin).
//
//   2. SADECE CİHAZ BANI → admin_ban_device
//      Hesaba dokunmaz. Aynı telefondan sürekli sahte hesap açan biri
//      için: hesabı temiz kalır, cihaz engellenir.
//
// ★ Sebep alanı ZORUNLU. Ban kaydında sebep yoksa aylar sonra "bunu
//   neden banlamıştım" sorusunun cevabı olmuyor; kullanıcı itiraz
//   ettiğinde de elinde bir şey kalmıyor.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import type { BanRow, DeviceRow, IpRow, DeviceDetail } from "@/lib/types.v3"

/* ═══════════════ HESAP BANI ═══════════════ */

export async function banUserAction(params: {
  userId: string
  reason: string
  notes?: string | null
  /** null = kalıcı ban */
  until?: string | null
  banDevices: boolean
  /** Cihazların son bilinen IP'lerini de banla */
  banIps?: boolean
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const reason = (params.reason ?? "").trim()
  if (!reason) return { ok: false, error: "Ban sebebi zorunlu." }
  if (reason.length > 300) return { ok: false, error: "Sebep en fazla 300 karakter olabilir." }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_ban_user_full", {
      p_user_id: params.userId,
      p_reason: reason,
      p_type: "manual",
      p_notes: params.notes?.trim() || null,
      p_until: params.until || null,
      p_ban_devices: params.banDevices,
      p_ban_ips: !!params.banIps,
      p_banned_by: session.sub,
    })
    if (error) return { ok: false, error: error.message }

    const r = (data ?? {}) as { cihaz_bani?: number; ip_bani?: number; username?: string }
    const cihaz = r.cihaz_bani ?? 0
    const ip = r.ip_bani ?? 0

    await logAudit({
      actor: session.sub, action: "user_ban",
      targetType: "user", targetId: params.userId,
      detail: { sebep: reason, not: params.notes ?? null, bitis: params.until ?? "kalıcı", cihaz_bani: cihaz },
    })

    revalidatePath(`/kullanicilar/${params.userId}`)
    revalidatePath("/kullanicilar")
    revalidatePath("/banlar")
    revalidatePath("/banlar")
    revalidatePath("/")

    // ★ Artık tek kayıt: mesaj da onu yansıtıyor
    const parcalar = ["Hesap banlandı (tek ban kaydı)"]
    if (params.banDevices) {
      parcalar.push(cihaz > 0 ? `${cihaz} cihaz engellendi` : "kayıtlı cihaz bulunamadı")
    }
    if (params.banIps) {
      parcalar.push(ip > 0 ? `${ip} IP engellendi` : "banlanacak IP bulunamadı")
    }

    return { ok: true, message: parcalar.join(" · ") + "." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function unbanUserAction(
  userId: string
): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_unban_user", { p_user_id: userId })
    if (error) return { ok: false, error: error.message }

    await logAudit({ actor: session.sub, action: "user_unban", targetType: "user", targetId: userId })

    revalidatePath(`/kullanicilar/${userId}`)
    revalidatePath("/kullanicilar")
    revalidatePath("/banlar")
    revalidatePath("/")

    return { ok: true, message: "Ban kaldırıldı. Cihaz banları ayrıca kaldırılmalı." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ SADECE CİHAZ BANI ═══════════════ */

export async function banDeviceAction(params: {
  deviceId: string
  reason: string
  notes?: string | null
  until?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const reason = (params.reason ?? "").trim()
  if (!reason) return { ok: false, error: "Ban sebebi zorunlu." }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_ban_device", {
      p_device_id: params.deviceId,
      p_reason: reason,
      p_notes: params.notes?.trim() || null,
      p_until: params.until || null,
      p_banned_by: session.sub,
    })
    if (error) return { ok: false, error: error.message }

    const r = (data ?? {}) as { kullanici?: number; users?: number }
    const etkilenen = r.kullanici ?? r.users ?? 0

    await logAudit({
      actor: session.sub, action: "device_ban",
      targetType: "device", targetId: params.deviceId,
      detail: { sebep: reason, bitis: params.until ?? "kalıcı", etkilenen_kullanici: etkilenen },
    })

    revalidatePath("/cihazlar")
    revalidatePath("/banlar")

    return {
      ok: true,
      message: etkilenen > 0
        // ★ Uyarı niteliğinde: bu cihazı birden fazla hesap kullanmış
        //   olabilir. Hesaplar banlı DEĞİL, sadece cihaz engellendi.
        ? `Cihaz banlandı. Bu cihazı ${etkilenen} hesap kullanmış — hesaplar banlı değil, sadece bu cihazdan giriş engellendi.`
        : "Cihaz banlandı.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/** Tek bir ban kaydını kaldırır (hesap ya da cihaz, hangisi olursa). */
export async function removeBanRecordAction(
  banId: string
): Promise<{ ok: boolean; error?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_unban_record", { p_ban_id: banId })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub, action: "ban_record_remove",
      targetType: "ban", targetId: banId,
    })

    revalidatePath("/banlar")
    revalidatePath("/cihazlar")
    revalidatePath("/kullanicilar")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/* ═══════════════ LİSTELER ═══════════════ */

export async function fetchBans(params: {
  scope?: "active" | "expired" | "cancelled" | "all"
  limit?: number
}): Promise<{ items: BanRow[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_bans", {
      p_scope: params.scope ?? "active",
      p_limit: params.limit ?? 200,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as BanRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function fetchDevices(params: {
  query?: string | null
  filter?: "all" | "banned" | "unbanned" | "orphan"
  limit?: number
}): Promise<{ items: DeviceRow[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_devices", {
      p_query: params.query?.trim() || null,
      p_filter: params.filter ?? "all",
      p_limit: params.limit ?? 150,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as DeviceRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ IP BANI ═══════════════ */

/**
 * ★ IP banı en geniş vuran önlem. Mobil operatörler NAT arkasından
 *   binlerce aboneyi aynı IP ile çıkarır; bu yüzden fonksiyon kaç
 *   kullanıcının o IP'yi kullandığını geri döndürüyor ve panel bunu
 *   kullanıcıya gösteriyor.
 */
export async function banIpAction(params: {
  ip: string
  reason: string
  notes?: string | null
  until?: string | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const ip = (params.ip ?? "").trim()
  const reason = (params.reason ?? "").trim()
  if (!ip) return { ok: false, error: "IP adresi zorunlu." }
  if (!reason) return { ok: false, error: "Ban sebebi zorunlu." }

  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_ban_ip", {
      p_ip: ip,
      p_reason: reason,
      p_notes: params.notes?.trim() || null,
      p_until: params.until || null,
      p_banned_by: session.sub,
    })
    if (error) return { ok: false, error: error.message }

    const r = (data ?? {}) as { kullanici?: number; cihaz?: number }

    await logAudit({
      actor: session.sub, action: "ip_ban",
      targetType: "ip", targetId: ip,
      detail: { sebep: reason, kullanici: r.kullanici ?? 0, cihaz: r.cihaz ?? 0 },
    })

    revalidatePath("/banlar")
    revalidatePath("/banlar")

    return {
      ok: true,
      message: `${ip} banlandı — bu IP'yi ${r.kullanici ?? 0} kullanıcı, ${r.cihaz ?? 0} cihaz kullanmış.`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function fetchIps(params: {
  query?: string | null
  filter?: "all" | "banned" | "unbanned" | "shared"
  limit?: number
}): Promise<{ items: IpRow[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_list_ips", {
      p_query: params.query?.trim() || null,
      p_filter: params.filter ?? "all",
      p_limit: params.limit ?? 150,
    })
    if (error) return { items: [], error: error.message }
    return { items: (data ?? []) as IpRow[] }
  } catch (e) {
    return { items: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ ELLE BAN OLUŞTURMA ═══════════════ */

/**
 * ★ Tek kapı: kullanıcı, cihaz ve IP banı aynı fonksiyondan. Üçü birden
 *   de verilebilir (bir hesabı, cihazını ve IP'sini tek seferde).
 *   Kullanıcı seçmek ZORUNLU DEĞİL — elinde sadece bir device_id ya da
 *   IP varsa onu da banlayabilirsin.
 */
export async function createBanAction(params: {
  userId?: string | null
  /** ★ Birden fazla cihaz TEK ban kaydında saklanır */
  deviceIds?: string[] | null
  ips?: string[] | null
  reason: string
  notes?: string | null
  until?: string | null
}): Promise<{
  ok: boolean; error?: string; message?: string
  cihaziKullanan?: number; ipyiKullanan?: number
}> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  const reason = (params.reason ?? "").trim()
  const deviceIds = (params.deviceIds ?? []).map((d) => d.trim()).filter(Boolean)
  const ips = (params.ips ?? []).map((i) => i.trim()).filter(Boolean)
  const userId = params.userId || null

  if (!reason) return { ok: false, error: "Ban sebebi zorunlu." }
  if (!userId && deviceIds.length === 0 && ips.length === 0) {
    return { ok: false, error: "En az bir hedef gerekli: kullanıcı, cihaz ya da IP." }
  }

  const gecersizIp = ips.find((ip) => !/^[0-9a-fA-F.:]+$/.test(ip))
  if (gecersizIp) return { ok: false, error: `IP adresi geçersiz görünüyor: ${gecersizIp}` }

  try {
    const sb = getSupabaseAdmin()
    // ★ TEK KAYIT: cihaz/IP listeleri dizi olarak gidiyor. Eskiden her
    //   cihaz için ayrı satır açılıyordu; 7 cihazlı kullanıcı 7 kayıt
    //   üretiyordu ve ban listesi okunmaz hâle geliyordu.
    const { data, error } = await sb.rpc("admin_create_ban", {
      p_user_id: userId,
      p_device_ids: deviceIds.length ? deviceIds : null,
      p_ips: ips.length ? ips : null,
      p_reason: reason,
      p_notes: params.notes?.trim() || null,
      p_until: params.until || null,
      p_banned_by: session.sub,
    })
    if (error) return { ok: false, error: error.message }

    const r = (data ?? {}) as {
      ban_id?: string; cihaz_adet?: number; ip_adet?: number
      cihazi_kullanan_hesap?: number; ipyi_kullanan_hesap?: number
    }

    await logAudit({
      actor: session.sub,
      action: "ban_create",
      targetType: userId ? "user" : deviceIds.length ? "device" : "ip",
      targetId: userId ?? deviceIds[0] ?? ips[0],
      detail: {
        sebep: reason, kullanici: userId,
        cihaz_adet: deviceIds.length, ip_adet: ips.length,
        bitis: params.until ?? "kalıcı",
      },
    })

    revalidatePath("/banlar")
    revalidatePath("/cihazlar")
    if (userId) revalidatePath(`/kullanicilar/${userId}`)
    revalidatePath("/")

    const hedefler = [
      userId ? "hesap" : null,
      deviceIds.length ? `${deviceIds.length} cihaz` : null,
      ips.length ? `${ips.length} IP` : null,
    ].filter(Boolean).join(" + ")

    return {
      ok: true,
      cihaziKullanan: r.cihazi_kullanan_hesap ?? 0,
      ipyiKullanan: r.ipyi_kullanan_hesap ?? 0,
      message: `Ban oluşturuldu — tek kayıt (${hedefler}).`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}


/* ═══════════════ CİHAZ DETAYI ═══════════════ */

export async function fetchDeviceDetail(
  deviceId: string
): Promise<{ detail: DeviceDetail | null; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_device_detail", { p_device_id: deviceId })
    if (error) return { detail: null, error: error.message }
    return { detail: (data ?? null) as DeviceDetail | null }
  } catch (e) {
    return { detail: null, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
