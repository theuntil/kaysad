// src/lib/types.ts — Panelin kullandığı veritabanı tipleri

export type PopupVariant = "default" | "warning" | "critical" | "promo"
export type PopupActionType = "none" | "internal" | "external"
export type PopupPlacement = "app_open" | "screen" | "notification" | "manual"
export type PopupFrequency = "once" | "once_per_day" | "n_times" | "max_per_day" | "every_time"

export interface Popup {
  id: string
  title: string
  description: string | null
  image_url: string | null
  action_type: PopupActionType
  action_route: string | null
  action_url: string | null
  logo_url: string | null
  popup_kind: "system" | "ad"
  action_label: string | null
  dismiss_label: string | null
  variant: PopupVariant
  dismissible: boolean
  show_opt_out: boolean
  placement: PopupPlacement
  target_screen: string | null
  frequency: PopupFrequency
  max_shows: number | null
  max_per_day: number | null
  cooldown_hours: number | null
  target_cities: string[] | null
  target_students_only: boolean
  target_platforms: string[] | null
  require_login: boolean
  min_account_age_days: number | null
  max_account_age_days: number | null
  start_at: string | null
  end_at: string | null
  is_active: boolean
  priority: number
  note: string | null
  created_at: string
  updated_at: string
  goruntulenme: number
  tiklanma: number
}

export interface PopupStat {
  id: string
  title: string
  note: string | null
  placement: string
  target_screen: string | null
  variant: string
  frequency: string
  max_shows: number | null
  max_per_day: number | null
  target_cities: string[] | null
  is_active: boolean
  priority: number
  start_at: string | null
  end_at: string | null
  toplam_gosterim: number
  toplam_tiklama: number
  ulasilan_kisi: number
  tiklayan_kisi: number
  kapatan_kisi: number
  optout_kisi: number
  tiklama_orani: number
  created_at: string
}

export type BroadcastType = "promo" | "earthquake" | "popup"

export interface NotificationRow {
  id: string
  recipient_id: string
  actor_id: string | null
  type: string
  entity_type: string | null
  entity_id: string | null
  secondary_id: string | null
  message: string | null
  is_read: boolean
  created_at: string
}

export interface BroadcastSummary {
  type: string
  message: string | null
  entity_id: string | null
  gonderilen: number
  okunan: number
  ilk_gonderim: string
  son_gonderim: string
}

export interface AuditEntry {
  id: string
  actor: string
  action: string
  target_type: string | null
  target_id: string | null
  detail: Record<string, unknown> | null
  created_at: string
}

export const POPUP_VARIANTS: { value: PopupVariant; label: string; color: string }[] = [
  { value: "default",  label: "Genel (mavi)",       color: "#3b82f6" },
  { value: "promo",    label: "Kampanya (mor)",     color: "#a855f7" },
  { value: "warning",  label: "Uyarı (turuncu)",    color: "#f59e0b" },
  { value: "critical", label: "Acil (kırmızı)",     color: "#ef4444" },
]

export const POPUP_PLACEMENTS: { value: PopupPlacement; label: string; hint: string }[] = [
  { value: "app_open",     label: "Uygulama açılışı", hint: "Her açılışta kontrol edilir" },
  { value: "screen",       label: "Belirli ekran",     hint: "target_screen zorunlu" },
  { value: "notification", label: "Sadece bildirim",   hint: "Bildirime basılınca açılır" },
  { value: "manual",       label: "Elle tetikleme",    hint: "showPopup(id) ile" },
]

export const POPUP_FREQUENCIES: { value: PopupFrequency; label: string; hint: string }[] = [
  { value: "once",         label: "Bir kez",        hint: "Kullanıcıya hayatta 1 kez" },
  { value: "once_per_day", label: "Günde bir kez",  hint: "Her gün 1 kez" },
  { value: "max_per_day",  label: "Günde N kez",    hint: "max_per_day alanı zorunlu" },
  { value: "n_times",      label: "Toplam N kez",   hint: "max_shows alanı zorunlu" },
  { value: "every_time",   label: "Her seferinde",  hint: "Dikkat: bezdirici olabilir" },
]

export const TR_CITIES = [
  "Adana","Adıyaman","Afyonkarahisar","Ağrı","Amasya","Ankara","Antalya","Artvin","Aydın",
  "Balıkesir","Bilecik","Bingöl","Bitlis","Bolu","Burdur","Bursa","Çanakkale","Çankırı",
  "Çorum","Denizli","Diyarbakır","Edirne","Elazığ","Erzincan","Erzurum","Eskişehir",
  "Gaziantep","Giresun","Gümüşhane","Hakkâri","Hatay","Isparta","Mersin","İstanbul","İzmir",
  "Kars","Kastamonu","Kayseri","Kırklareli","Kırşehir","Kocaeli","Konya","Kütahya","Malatya",
  "Manisa","Kahramanmaraş","Mardin","Muğla","Muş","Nevşehir","Niğde","Ordu","Rize","Sakarya",
  "Samsun","Siirt","Sinop","Sivas","Tekirdağ","Tokat","Trabzon","Tunceli","Şanlıurfa","Uşak",
  "Van","Yozgat","Zonguldak","Aksaray","Bayburt","Karaman","Kırıkkale","Batman","Şırnak",
  "Bartın","Ardahan","Iğdır","Yalova","Karabük","Kilis","Osmaniye","Düzce",
]
