// src/lib/types.v3.ts
//
// V3'te eklenen veritabanı tipleri. types.ts'e dokunmuyoruz — böylece
// mevcut dosyaların hiçbiri değişmek zorunda kalmıyor, sadece yeni
// sayfalar buradan import ediyor.

/* ═══════════════ GÖNDERİM ═══════════════ */

export type SendChannel = "both" | "inapp" | "push"
export type SendType = "promo" | "earthquake" | "popup"

export interface SendPreview {
  kullanici: number
  push_kullanici: number
  push_cihaz: number
  push_acik: boolean
  sessiz_saat: boolean
}

export interface SendAudience {
  cities: string[] | null
  studentsOnly: boolean
  businessOnly: boolean
  onlyActive: boolean
  platforms: string[] | null
  activeDays: number | null
}

export interface SendHistoryRow {
  type: SendType
  message: string
  entity_type: string | null
  entity_id: string | null
  adet: number
  okunan: number
  push_sent: number
  push_failed: number
  push_skip: number
  kanal: "both" | "inapp"
  ilk: string
  son: string
}

/* ═══════════════ KULLANICI ═══════════════ */

export type UserFilter =
  | "all" | "active" | "banned" | "business" | "student"
  | "pending_business" | "pending_student" | "no_profile" | "mismatch"

export interface UserRow {
  auth_id: string
  email: string | null
  phone: string | null
  email_confirmed: boolean
  phone_confirmed: boolean
  last_sign_in: string | null
  auth_created: string | null
  has_profile: boolean
  username: string | null
  name: string | null
  avatar_url: string | null
  role: string | null
  sehir: string | null
  is_active: boolean | null
  is_banned: boolean | null
  verify: boolean | null
  ogrenci: boolean | null
  ogrenci_durum: string | null
  business_durum: string | null
  gizli: boolean | null
  follower_count: number | null
  post_count: number | null
  profile_created: string | null
  device_count: number
  push_device_count: number
  active_ban_count: number
  has_mismatch: boolean
}

export interface UserCounts {
  toplam: number
  aktif: number
  banli: number
  isletme: number
  ogrenci: number
  bekleyen_isletme: number
  bekleyen_ogrenci: number
  profilsiz: number
  tutarsiz: number
  son_7_gun: number
  son_30_gun: number
}

export interface ConsistencyIssue {
  kod: string
  seviye: "critical" | "warning" | "info"
  baslik: string
  detay: string
}

export interface UserFull {
  auth: {
    id: string
    email: string | null
    phone: string | null
    email_confirmed_at: string | null
    phone_confirmed_at: string | null
    last_sign_in_at: string | null
    created_at: string | null
    updated_at: string | null
    banned_until: string | null
    meta: Record<string, unknown> | null
  } | null
  profile: Record<string, unknown> | null
  devices: DeviceRow[]
  bans: BanRow[]
  reports_against: unknown[]
  reports_made: unknown[]
  issues: ConsistencyIssue[]
  duplicate_username: unknown[]
  duplicate_email: unknown[]
}

/* ═══════════════ CİHAZ / BAN ═══════════════ */

export interface DeviceRow {
  device_id: string
  user_id: string | null
  username?: string | null
  avatar_url?: string | null
  platform: string | null
  model: string | null
  push_enabled: boolean | null
  has_push_token?: boolean
  last_login_at: string | null
  created_at: string | null
  ip?: string | null
  is_banned?: boolean
  ip_banned?: boolean
  user_count?: number
}

export interface BanRow {
  id: string
  user_id: string | null
  username?: string | null
  name?: string | null
  avatar_url?: string | null
  email?: string | null
  device_id: string | null
  platform: string | null
  model?: string | null
  reason: string | null
  type: string | null
  notes: string | null
  until_at: string | null
  is_active: boolean | null
  created_at: string
  banned_by: string | null
  ip?: string | null
  device_ids?: string[] | null
  ips?: string[] | null
  device_adet?: number
  ip_adet?: number
  etkilenen_hesap?: number
  durum?: "active" | "expired" | "cancelled"
  device_user_count?: number
  ip_user_count?: number
  suresi_gecti?: boolean
}

/* ═══════════════ ŞEHİR ═══════════════ */

export interface CityStat {
  sehir: string
  kullanici: number
  push_cihaz: number
}

/* ═══════════════ ONAY BAŞVURULARI ═══════════════ */

export interface BusinessApplication {
  id: string
  username: string | null
  name: string | null
  business_name: string | null
  avatar_url: string | null
  business_avatar_url: string | null
  website: string | null
  address: string | null
  category: string | null
  bio: string | null
  tags: string[] | null
  sehir: string | null
  email: string | null
  phone: string | null
  email_verified: boolean | null
  phone_verify: boolean | null
  role: string | null
  business_durum: string | null
  business_red: string | null
  business_count: number | null
  business_basvuru_tarih: string | null
  created_at: string | null
}

export interface StudentApplication {
  id: string
  username: string | null
  name: string | null
  avatar_url: string | null
  sehir: string | null
  ogrenci_belgesi: string | null
  ogrenci_basvuru_tarih: string | null
  ogrenci_basvuru_sayisi: number | null
  ogrenci_red_sebep: string | null
  created_at: string | null
}


/* ═══════════════ İÇERİK (gönderi / ilan / indirim / etkinlik) ═══════════════ */

export type ContentKind = "post" | "listing" | "discount" | "event"

/** Satırlar HAM json — tablo kolonları projeye göre değişebilir. */
export type ContentRow = Record<string, unknown>

export interface ContentListResult {
  tablo: string
  sahip_kolonu?: string
  tarih_kolonu?: string
  hata?: string
  satirlar: ContentRow[]
}

/* ═══════════════ ŞİKÂYET ═══════════════ */

export interface UserReport {
  id: string
  yon: "against" | "made"
  karsi_taraf_id: string | null
  karsi_taraf_username: string | null
  karsi_taraf_avatar: string | null
  reason: string | null
  description: string | null
  content_type: string | null
  content_id: string | null
  status: string | null
  admin_note: string | null
  created_at: string
}

/* ═══════════════ IP ═══════════════ */

export interface IpRow {
  ip: string
  kullanici: number
  cihaz: number
  son_gorulme: string | null
  is_banned: boolean
  ornek_kullanici: string | null
}


/* ═══════════════ ŞEHİR (genişletilmiş) ═══════════════ */

export interface CityStatFull {
  sehir: string
  kullanici: number
  push_cihaz: number
  ogrenci: number
  isletme: number
  banli: number
  yeni_7g: number
  son_kayit: string | null
}

/* ═══════════════ GÖNDERİM DETAYI ═══════════════ */

export interface SendDetail {
  tip: string
  mesaj: string
  toplam: number
  okundu: number
  okunmadi: number
  push_sent: number
  push_failed: number
  push_pending: number
  push_skipped: number
  ilk: string | null
  son: string | null
  ilk_push: string | null
  son_push: string | null
  sehirler: { sehir: string; adet: number; okundu: number }[]
  hatalar: { hata: string; adet: number }[]
  platformlar: { platform: string; adet: number }[]
  log_ok: number
  log_hata: number
  zaman_cizgisi: { saat: string; adet: number }[]
}


/* ═══════════════ ŞİKÂYET YÖNETİMİ ═══════════════ */

export type ReportStatus = "pending" | "reviewing" | "resolved" | "dismissed"

export interface ReportCounts {
  toplam: number
  bekleyen: number
  inceleniyor: number
  cozuldu: number
  reddedildi: number
  cevaplanmamis: number
  son_24_saat: number
  son_7_gun: number
  sebep_dagilimi: { sebep: string; adet: number }[]
}

export interface ReportRow {
  id: string
  reporter_id: string | null
  reporter_username: string | null
  reporter_avatar: string | null
  reported_user_id: string | null
  reported_username: string | null
  reported_avatar: string | null
  reason: string | null
  description: string | null
  content_type: string | null
  content_id: string | null
  status: ReportStatus | null
  admin_note: string | null
  created_at: string
  updated_at: string | null
  hedef_toplam_sikayet: number
  hedef_banli: boolean
}

export interface ReportParty {
  id: string
  username: string | null
  name: string | null
  avatar_url: string | null
  email: string | null
  sehir: string | null
  role?: string | null
  is_banned: boolean
  toplam_sikayet?: number
  hakkinda_sikayet?: number
  cozulen?: number
}

export interface ReportDetail {
  id: string
  reason: string | null
  description: string | null
  content_type: string | null
  content_id: string | null
  status: ReportStatus | null
  admin_note: string | null
  created_at: string
  reporter: ReportParty | null
  reported: ReportParty | null
  icerik: Record<string, unknown> | null
  icerik_tablo: string | null
  ayni_icerik_sikayet: {
    id: string; reason: string | null; status: string | null
    created_at: string; reporter_username: string | null
  }[]
}

/* ═══════════════ CİHAZ DETAYI ═══════════════ */

export interface DeviceUser {
  user_id: string
  username: string | null
  name: string | null
  avatar_url: string | null
  email: string | null
  sehir: string | null
  role: string | null
  is_banned: boolean
  son_giris: string | null
  ilk_giris: string | null
  cihaz_adet: number
}

export interface DeviceDetail {
  device_id: string
  kayit_adet: number
  platform: string | null
  model: string | null
  ip: string | null
  ilk_gorulme: string | null
  son_giris: string | null
  push_token_var: boolean | null
  push_acik: boolean | null
  is_banned: boolean
  ip_banned: boolean
  kullanicilar: DeviceUser[]
  banlar: {
    id: string; reason: string | null; type: string | null; notes: string | null
    until_at: string | null; is_active: boolean | null; created_at: string
    banned_by: string | null; user_id: string | null
  }[]
  ayni_ip_cihaz: number
}
