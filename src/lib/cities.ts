// src/lib/cities.ts
//
// ★ 81 İL SABİT LİSTE
//
// Eskiden hedefleme ekranı sadece VERİTABANINDA KAYITLI şehirleri
// gösteriyordu. Sorun: henüz kullanıcısı olmayan bir ile önceden gönderim
// hazırlayamıyordun (ör. yeni açılan bir şehir için duyuru). Artık 81 il
// her zaman seçilebilir; yanına o ildeki kullanıcı sayısı yazılıyor,
// böylece "0 kullanıcı" olduğunu görerek seçiyorsun.
//
// Yazım profiles.sehir ile BİRE BİR aynı olmalı (Türkçe karakterler dahil),
// yoksa `p.sehir = any(p_cities)` eşleşmez.

export interface City {
  ad: string
  plaka: number
  bolge: Region
}

export type Region =
  | "Marmara"
  | "İç Anadolu"
  | "Ege"
  | "Akdeniz"
  | "Karadeniz"
  | "Doğu Anadolu"
  | "Güneydoğu Anadolu"

export const REGIONS: Region[] = [
  "Marmara", "İç Anadolu", "Ege", "Akdeniz",
  "Karadeniz", "Doğu Anadolu", "Güneydoğu Anadolu",
]

export const CITIES: City[] = [
  { ad: "Adana",           plaka:  1, bolge: "Akdeniz" },
  { ad: "Adıyaman",        plaka:  2, bolge: "Güneydoğu Anadolu" },
  { ad: "Afyonkarahisar",  plaka:  3, bolge: "Ege" },
  { ad: "Ağrı",            plaka:  4, bolge: "Doğu Anadolu" },
  { ad: "Amasya",          plaka:  5, bolge: "Karadeniz" },
  { ad: "Ankara",          plaka:  6, bolge: "İç Anadolu" },
  { ad: "Antalya",         plaka:  7, bolge: "Akdeniz" },
  { ad: "Artvin",          plaka:  8, bolge: "Karadeniz" },
  { ad: "Aydın",           plaka:  9, bolge: "Ege" },
  { ad: "Balıkesir",       plaka: 10, bolge: "Marmara" },
  { ad: "Bilecik",         plaka: 11, bolge: "Marmara" },
  { ad: "Bingöl",          plaka: 12, bolge: "Doğu Anadolu" },
  { ad: "Bitlis",          plaka: 13, bolge: "Doğu Anadolu" },
  { ad: "Bolu",            plaka: 14, bolge: "Karadeniz" },
  { ad: "Burdur",          plaka: 15, bolge: "Akdeniz" },
  { ad: "Bursa",           plaka: 16, bolge: "Marmara" },
  { ad: "Çanakkale",       plaka: 17, bolge: "Marmara" },
  { ad: "Çankırı",         plaka: 18, bolge: "İç Anadolu" },
  { ad: "Çorum",           plaka: 19, bolge: "Karadeniz" },
  { ad: "Denizli",         plaka: 20, bolge: "Ege" },
  { ad: "Diyarbakır",      plaka: 21, bolge: "Güneydoğu Anadolu" },
  { ad: "Edirne",          plaka: 22, bolge: "Marmara" },
  { ad: "Elazığ",          plaka: 23, bolge: "Doğu Anadolu" },
  { ad: "Erzincan",        plaka: 24, bolge: "Doğu Anadolu" },
  { ad: "Erzurum",         plaka: 25, bolge: "Doğu Anadolu" },
  { ad: "Eskişehir",       plaka: 26, bolge: "İç Anadolu" },
  { ad: "Gaziantep",       plaka: 27, bolge: "Güneydoğu Anadolu" },
  { ad: "Giresun",         plaka: 28, bolge: "Karadeniz" },
  { ad: "Gümüşhane",       plaka: 29, bolge: "Karadeniz" },
  { ad: "Hakkâri",         plaka: 30, bolge: "Doğu Anadolu" },
  { ad: "Hatay",           plaka: 31, bolge: "Akdeniz" },
  { ad: "Isparta",         plaka: 32, bolge: "Akdeniz" },
  { ad: "Mersin",          plaka: 33, bolge: "Akdeniz" },
  { ad: "İstanbul",        plaka: 34, bolge: "Marmara" },
  { ad: "İzmir",           plaka: 35, bolge: "Ege" },
  { ad: "Kars",            plaka: 36, bolge: "Doğu Anadolu" },
  { ad: "Kastamonu",       plaka: 37, bolge: "Karadeniz" },
  { ad: "Kayseri",         plaka: 38, bolge: "İç Anadolu" },
  { ad: "Kırklareli",      plaka: 39, bolge: "Marmara" },
  { ad: "Kırşehir",        plaka: 40, bolge: "İç Anadolu" },
  { ad: "Kocaeli",         plaka: 41, bolge: "Marmara" },
  { ad: "Konya",           plaka: 42, bolge: "İç Anadolu" },
  { ad: "Kütahya",         plaka: 43, bolge: "Ege" },
  { ad: "Malatya",         plaka: 44, bolge: "Doğu Anadolu" },
  { ad: "Manisa",          plaka: 45, bolge: "Ege" },
  { ad: "Kahramanmaraş",   plaka: 46, bolge: "Akdeniz" },
  { ad: "Mardin",          plaka: 47, bolge: "Güneydoğu Anadolu" },
  { ad: "Muğla",           plaka: 48, bolge: "Ege" },
  { ad: "Muş",             plaka: 49, bolge: "Doğu Anadolu" },
  { ad: "Nevşehir",        plaka: 50, bolge: "İç Anadolu" },
  { ad: "Niğde",           plaka: 51, bolge: "İç Anadolu" },
  { ad: "Ordu",            plaka: 52, bolge: "Karadeniz" },
  { ad: "Rize",            plaka: 53, bolge: "Karadeniz" },
  { ad: "Sakarya",         plaka: 54, bolge: "Marmara" },
  { ad: "Samsun",          plaka: 55, bolge: "Karadeniz" },
  { ad: "Siirt",           plaka: 56, bolge: "Güneydoğu Anadolu" },
  { ad: "Sinop",           plaka: 57, bolge: "Karadeniz" },
  { ad: "Sivas",           plaka: 58, bolge: "İç Anadolu" },
  { ad: "Tekirdağ",        plaka: 59, bolge: "Marmara" },
  { ad: "Tokat",           plaka: 60, bolge: "Karadeniz" },
  { ad: "Trabzon",         plaka: 61, bolge: "Karadeniz" },
  { ad: "Tunceli",         plaka: 62, bolge: "Doğu Anadolu" },
  { ad: "Şanlıurfa",       plaka: 63, bolge: "Güneydoğu Anadolu" },
  { ad: "Uşak",            plaka: 64, bolge: "Ege" },
  { ad: "Van",             plaka: 65, bolge: "Doğu Anadolu" },
  { ad: "Yozgat",          plaka: 66, bolge: "İç Anadolu" },
  { ad: "Zonguldak",       plaka: 67, bolge: "Karadeniz" },
  { ad: "Aksaray",         plaka: 68, bolge: "İç Anadolu" },
  { ad: "Bayburt",         plaka: 69, bolge: "Karadeniz" },
  { ad: "Karaman",         plaka: 70, bolge: "İç Anadolu" },
  { ad: "Kırıkkale",       plaka: 71, bolge: "İç Anadolu" },
  { ad: "Batman",          plaka: 72, bolge: "Güneydoğu Anadolu" },
  { ad: "Şırnak",          plaka: 73, bolge: "Güneydoğu Anadolu" },
  { ad: "Bartın",          plaka: 74, bolge: "Karadeniz" },
  { ad: "Ardahan",         plaka: 75, bolge: "Doğu Anadolu" },
  { ad: "Iğdır",           plaka: 76, bolge: "Doğu Anadolu" },
  { ad: "Yalova",          plaka: 77, bolge: "Marmara" },
  { ad: "Karabük",         plaka: 78, bolge: "Karadeniz" },
  { ad: "Kilis",           plaka: 79, bolge: "Güneydoğu Anadolu" },
  { ad: "Osmaniye",        plaka: 80, bolge: "Akdeniz" },
  { ad: "Düzce",           plaka: 81, bolge: "Karadeniz" },
]

/** Alfabetik (Türkçe sıralama) — seçim listelerinde kullanılıyor. */
export const CITY_NAMES: string[] = CITIES
  .map((c) => c.ad)
  .sort((a, b) => a.localeCompare(b, "tr"))

/** Türkçe arama: "istanbul", "ISTANBUL", "İstanbul" hepsi eşleşsin. */
export function normalizeTr(s: string): string {
  return s
    .toLocaleLowerCase("tr")
    .replaceAll("ı", "i").replaceAll("İ", "i")
    .replaceAll("ş", "s").replaceAll("ğ", "g")
    .replaceAll("ü", "u").replaceAll("ö", "o")
    .replaceAll("ç", "c").replaceAll("â", "a")
    .trim()
}

export function citiesOfRegion(r: Region): string[] {
  return CITIES.filter((c) => c.bolge === r).map((c) => c.ad)
}
