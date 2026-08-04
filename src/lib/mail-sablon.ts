// src/lib/mail-sablon.ts
//
// ═══════════════════════════════════════════════════════════════════════
// VARSAYILAN MAİL ŞABLONU
//
// ┌─ TASARIM KARARLARI ───────────────────────────────────────────────┐
// │ · Sade, bol boşluklu, tek sütun — Apple'ın bildirim mailleri gibi │
// │ · Karanlık mod uyumlu: `prefers-color-scheme` + `color-scheme`    │
// │ · Logo URL ile geliyor (gömülü dosya değil) — iki tema için iki   │
// │   ayrı görsel, `<picture>` ile otomatik seçiliyor                  │
// │ · Alt kısımda App Store / Play Store düğmeleri                     │
// └───────────────────────────────────────────────────────────────────┘
//
// ┌─ MAİL HTML'İ NEDEN BÖYLE YAZILIYOR ───────────────────────────────┐
// │ Mail istemcileri 1998 tarayıcısı gibi davranıyor:                  │
// │                                                                    │
// │  · Düzen `<table>` ile — Outlook flexbox/grid desteklemiyor       │
// │  · Stiller satır içi — Gmail `<style>` bloğunu atıyor             │
// │  · `<style>` yine de var, çünkü medya sorgusu SADECE orada        │
// │    yazılabiliyor (karanlık mod için şart)                          │
// │  · Genişlik 600px — neredeyse tüm istemcilerde güvenli             │
// │                                                                    │
// │ Yani "modern CSS yaz" seçeneği yok; kural bu.                     │
// └───────────────────────────────────────────────────────────────────┘
//
// ★ Yer tutucular: {{icerik}} {{konu}} {{logo}} {{imza}}
//   `wrapTemplate()` bunları dolduruyor.
// ═══════════════════════════════════════════════════════════════════════

export interface SablonAyar {
  /** Aydınlık temada gösterilecek logo */
  logoAcik: string
  /** Karanlık temada gösterilecek logo */
  logoKoyu: string
  /** app_config.ios_store_url */
  appStoreUrl: string | null
  /** app_config.android_store_url */
  playStoreUrl: string | null
  /** "Yükle" düğmesinin hedefi — mağaza değil, indirme sayfası */
  indirUrl: string
  siteUrl: string
  marka: string
}

const DEPO = "https://supabase.rovand.cloud/storage/v1/object/public/galeri/2026-08"

/**
 * ★ Mağaza rozet ikonları — beyaz sürüm.
 *   Düğme zemini koyu (#1c1c1e) olduğu için beyaz logo her iki temada
 *   da okunuyor; tema başına ayrı ikon gerekmiyor.
 */
export const MAGAZA_IKON = {
  apple: `${DEPO}/aplle-logo-20260803-aomaxx.png`,
  play:  `${DEPO}/playstore-logo-20260803-6hb9lc.webp`,
  /** Uygulama simgesi — tanıtım kartında kullanılıyor */
  uygulama: `${DEPO}/ddd-20260803-kj80hl.png`,
} as const

export const VARSAYILAN_SABLON_AYAR: SablonAyar = {
  logoAcik: `${DEPO}/kays-20260803-0nfgkh.png`,
  logoKoyu: `${DEPO}/kays1-20260803-91s4m6.png`,
  appStoreUrl: null,
  playStoreUrl: null,
  indirUrl: "https://kays.com.tr/indir",
  siteUrl: "https://kays.business",
  marka: "Kays",
}

/* ── Mağaza rozetleri ──
   ★ Resmi rozet görselleri yerine SVG kullanılamıyor (Outlook SVG
     desteklemiyor). Bu yüzden düğmeler CSS ile çiziliyor: koyu zemin,
     yuvarlak köşe, iki satır yazı. Her istemcide aynı görünüyor. */

/**
 * MAĞAZA ROZETİ
 *
 * ★ Logo bir `<img>` — SVG değil. Outlook SVG'yi hiç çizmiyor, PNG
 *   her istemcide çalışıyor.
 *
 * ★ Beyaz logo + koyu zemin: tek görsel iki temada da okunuyor.
 *
 * ★ EZİLME DÜZELTMESİ: eskiden width="22" height="22" ile KARE'ye
 *   zorlanıyordu. Apple ve Play logolarının en-boy oranı kare değil,
 *   bu yüzden basık görünüyorlardı.
 *
 *   Artık sadece YÜKSEKLİK sabit, genişlik oranı koruyor:
 *     height özniteliği → Outlook için
 *     width:auto        → diğer istemciler için
 */
function magazaDugmesi(
  url: string,
  ikonUrl: string,
  ustYazi: string,
  altYazi: string
): string {
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-block;margin:0 5px 8px;">
  <tr><td style="border-radius:11px;background:#1c1c1e;" bgcolor="#1c1c1e">
    <a href="${url}" target="_blank"
       style="display:block;padding:10px 18px;text-decoration:none;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="padding-right:11px;vertical-align:middle;">
          <img src="${ikonUrl}" alt="" height="24" class="ki-gorsel"
               style="display:block;height:24px;width:auto;max-width:30px;border:0;outline:none;">
        </td>
        <td style="text-align:left;vertical-align:middle;">
          <div style="font-size:9px;line-height:11px;color:#a0a0a5;letter-spacing:0.4px;text-transform:uppercase;">${ustYazi}</div>
          <div style="font-size:13.5px;line-height:17px;color:#ffffff;font-weight:600;">${altYazi}</div>
        </td>
      </tr></table>
    </a>
  </td></tr>
</table>`.trim()
}

/**
 * UYGULAMA TANITIM KARTI
 *
 * ★ App Store liste satırı görünümü: simge · ad · alt başlık · puan
 *   ve sağda düğme. Mağaza rozetlerinin ÜSTÜNDE duruyor.
 *
 * ★ Yıldızlar Unicode karakter — görsel değil. Mail istemcileri
 *   yıldız görselini bazen engelliyor; karakter her yerde çiziliyor.
 *
 * ★ Simge 60×60 ve `border-radius:14px` — iOS uygulama simgesi oranı.
 *   Outlook yuvarlak köşeyi çizmiyor, kare gösteriyor; kabul edilebilir
 *   bir gerileme.
 */
function uygulamaKarti(a: SablonAyar): string {
  /* ★ "Yükle" mağazaya DEĞİL indirme sayfasına gidiyor.
     Kullanıcının cihazı bilinmiyor; indirme sayfası doğru mağazaya
     kendisi yönlendiriyor. */
  const href = a.indirUrl?.trim() || a.siteUrl

  return `
<tr><td class="ki-ic" style="padding:0 32px 4px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
         class="ki-ickart" style="background:#f7f7fa;border-radius:18px;">
    <tr><td style="padding:16px 18px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>

        <!-- Simge -->
        <td width="60" style="width:60px;vertical-align:middle;">
          <img src="${MAGAZA_IKON.uygulama}" alt="${a.marka}" width="60" height="60" class="ki-gorsel"
               style="display:block;width:60px;height:60px;border-radius:14px;border:0;outline:none;">
        </td>

        <!-- Bilgi -->
        <td style="padding-left:14px;vertical-align:middle;">
          <div class="ki-metin" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#1c1c1e;line-height:19px;">
            ${a.marka}
          </div>
          <div class="ki-sonuk" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#8a8a8f;line-height:16px;margin-top:2px;">
            Alışveriş &amp; Yerel Fırsatlar
          </div>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11.5px;color:#8a8a8f;line-height:16px;margin-top:5px;">
            <span style="color:#f5a623;letter-spacing:0.5px;">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
            <span style="color:#8a8a8f;">&nbsp;4.8</span>
          </div>
        </td>

        <!-- Düğme -->
        <td width="86" style="width:86px;vertical-align:middle;text-align:right;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right">
            <tr><td class="ki-dugme" style="border-radius:999px;background:#e8e8ed;" bgcolor="#e8e8ed">
              <a href="${href}" target="_blank"
                 class="ki-dugmeyazi"
                 style="display:block;padding:7px 20px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#0a84ff;text-decoration:none;white-space:nowrap;">
                Yükle
              </a>
            </td></tr>
          </table>
        </td>

      </tr></table>
    </td></tr>
  </table>
</td></tr>`.trim()
}

/**
 * Varsayılan şablonu üretir.
 *
 * ★ Ayarlar panelden geliyor; mağaza adresi boşsa o düğme hiç
 *   basılmıyor — çalışmayan bir bağlantı göstermek kötü.
 */
export function varsayilanSablon(a: SablonAyar = VARSAYILAN_SABLON_AYAR): string {
  /* ★ HER MAİLDE görünüyor — koşulsuz.
     Adres ayarlanmamışsa site adresine düşüyor; düğme yine de
     basılıyor. Eskiden adres boşsa düğme hiç çıkmıyordu ve
     "mağaza kısmı yok" sorunu bundandı. */
  /* ★ Adresler `app_config` tablosundan geliyor:
       ios_store_url     → App Store rozeti
       android_store_url → Google Play rozeti

     Tanımlı değilse indirme sayfasına düşüyor — site anasayfasına
     değil. Mağaza rozetine basıp anasayfaya düşmek kafa karıştırıcı. */
  const appHref = a.appStoreUrl?.trim() || a.indirUrl || a.siteUrl
  const playHref = a.playStoreUrl?.trim() || a.indirUrl || a.siteUrl

  const dugmeler: string[] = [
    magazaDugmesi(appHref, MAGAZA_IKON.apple, "İndir", "App Store"),
    magazaDugmesi(playHref, MAGAZA_IKON.play, "İndir", "Google Play"),
  ]

  const magazaBolumu = `
        <tr><td align="center" style="padding:10px 32px 18px;">
          <div class="ki-cizgi" style="border-top:1px solid #e8e8ed;line-height:1px;font-size:0;">&nbsp;</div>
        </td></tr>

        ${uygulamaKarti(a)}
        <tr><td align="center" style="padding:22px 24px 6px;">
          <div class="ki-sonuk" style="font-size:12px;color:#8a8a8f;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;margin-bottom:12px;">
            Uygulamayı indir
          </div>
          ${dugmeler.join("\n")}
        </td></tr>`

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>{{konu}}</title>
<style>
  /* Medya sorgusu SADECE style bloğunda yazılabiliyor - satir ici
     stille karanlik mod yapilamaz. Gmail bu blogu atsa bile satir ici
     stiller ayakta kaliyor, sadece aydinlik tema gorunuyor. */
  @media (prefers-color-scheme: dark) {
    .ki-zemin    { background:#000000 !important; }
    .ki-kart     { background:#1c1c1e !important; border-color:#2c2c2e !important; }
    .ki-ickart   { background:#2c2c2e !important; }
    .ki-metin    { color:#f2f2f7 !important; }
    .ki-sonuk    { color:#8e8e93 !important; }
    .ki-cizgi    { border-color:#2c2c2e !important; }
    .ki-dugme    { background:#3a3a3c !important; }
    .ki-dugmeyazi{ color:#0a84ff !important; }
    /* Logo degisimi
       Her iki kural da gerekli: gizlenen taraf YER KAPLAMAMALI
       (height ve max-height sifirlaniyor), acilan tarafta bu
       sinirlar kalkmali. Sadece display yeterli degil - bazi
       istemciler max-height:0 degerini korumaya devam ediyor. */
    .ki-acik     { display:none !important; height:0 !important;
                   max-height:0 !important; overflow:hidden !important;
                   mso-hide:all; }
    .ki-koyu     { display:block !important; height:auto !important;
                   max-height:none !important; overflow:visible !important; }
    .ki-koyu img { display:block !important; }

    /* Uygulama simgesi ve magaza rozetleri koyu zeminde otomatik
       ters cevrilmesin - Apple Mail bazi gorselleri kendiliginden
       ceviriyor ve logolar bozuluyor. */
    .ki-gorsel   { -webkit-filter:none !important; filter:none !important; }
  }

  @media (max-width:620px) {
    .ki-govde  { width:100% !important; }
    .ki-ic     { padding-left:22px !important; padding-right:22px !important; }
  }

  a { color:#0a84ff; }
</style>
</head>

<!--
  ★ ZEMİN BEYAZ, gri değil.
    Eskiden #f2f2f7 idi — kartla arasındaki fark çok azdı ve mail
    istemcisinin kendi beyaz zemininde gri bir dikdörtgen gibi
    duruyordu. Beyaz zemin istemciyle kaynaşıyor.

    Karanlık modda #000 oluyor (ki-zemin sınıfı).
-->
<body class="ki-zemin" style="margin:0;padding:0;background:#ffffff;-webkit-font-smoothing:antialiased;">
<!-- Önizleme metni: gelen kutusunda konu satırının yanında çıkıyor -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">{{konu}}</div>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="ki-zemin" style="background:#ffffff;">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="ki-govde" style="width:600px;max-width:600px;">

    <!-- ── LOGO ──
         ★ İki ayrı görsel: aydınlıkta koyu logo, karanlıkta açık logo.
           picture etiketi mail istemcilerinde güvenilmez olduğu için
           display none/block ile değiştiriliyor. -->
    <tr><td align="center" style="padding:0 24px 26px;">

      <!-- Aydınlık tema logosu -->
      <div class="ki-acik">
        <img src="${a.logoAcik}" alt="${a.marka}" width="112"
             style="display:block;width:112px;max-width:112px;height:auto;border:0;outline:none;margin:0 auto;">
      </div>

      <!-- Karanlık tema logosu -->
      <!--[if !mso]><! -->
      <div class="ki-koyu" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
        <img src="${a.logoKoyu}" alt="${a.marka}" width="112"
             style="display:block;width:112px;max-width:112px;height:auto;border:0;outline:none;margin:0 auto;">
      </div>
      <!--<![endif]-->

    </td></tr>

    <!-- ── KART ── -->
    <tr><td>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
             class="ki-kart" style="background:#ffffff;border:1px solid #e8e8ed;border-radius:26px;">

        <tr><td class="ki-ic" style="padding:38px 40px 34px;">
          <div class="ki-metin" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15.5px;line-height:1.65;color:#1c1c1e;">
            {{icerik}}
          </div>
        </td></tr>

        {{imza}}

        ${magazaBolumu}

        <tr><td style="padding:8px 24px 30px;"></td></tr>

      </table>
    </td></tr>

    <!-- ── ALT NOT ── -->
    <tr><td align="center" style="padding:22px 24px 0;">
      <div class="ki-sonuk" style="font-size:11px;line-height:1.6;color:#a0a0a5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
        Bu e-posta ${a.marka} tarafından gönderildi.
      </div>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`
}

/**
 * İmza bloğu — şablondaki {{imza}} yerine geçiyor.
 * ★ Tablo satırı olarak dönüyor; şablonun içinde `<tr>` bekleniyor.
 */
export function imzaBlogu(imza: string | null | undefined): string {
  if (!imza?.trim()) return ""

  return `
<tr><td class="ki-ic" style="padding:0 40px 30px;">
  <div class="ki-cizgi" style="border-top:1px solid #e8e8ed;padding-top:20px;">
    <div class="ki-sonuk" style="font-size:13px;line-height:1.6;color:#6c6c70;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      ${imza.trim().replace(/\n/g, "<br>")}
    </div>
  </div>
</td></tr>`.trim()
}

/* ═══════════════════════════════════════════════════════════════
   TEK ŞABLON ÜRETİCİSİ

   ┌─ NEDEN GEREKLİ ─────────────────────────────────────────────┐
   │ Şablon DÖRT ayrı yerde üretiliyordu:                        │
   │   · sendMailAction        (tekil gönderim)                   │
   │   · sendBulkMailAction    (toplu gönderim)                   │
   │   · drainMailQueue        (kuyruk işçisi)  ← ATLANMIŞTI      │
   │   · sendTestMailAction    (test)                             │
   │                                                              │
   │ Kuyruk işçisi `s.default_template` değerini HAM kullanıyordu.│
   │ Normal mailler kuyruktan gittiği için yeni tasarım hiç       │
   │ devreye girmiyordu — "mağaza kısmı yok" sorunu bundandı.    │
   │                                                              │
   │ Artık dördü de burayı çağırıyor. Tek yer, tek davranış.     │
   └─────────────────────────────────────────────────────────────┘
═══════════════════════════════════════════════════════════════ */

/** `mail_settings` satırından ihtiyaç duyulan alanlar */
export interface SablonKaynak {
  default_template?: string | null
  logo_light_url?: string | null
  logo_dark_url?: string | null
  site_url?: string | null
  brand_name?: string | null
  /* ★ Bu üçü `app_config` tablosundan geliyor, mail_settings'ten değil.
     Mağaza adresleri uygulamanın kendi ayarı — mail ayarlarında ikinci
     bir kopya tutmak ikisinin birbirinden ayrılmasına yol açar. */
  ios_store_url?: string | null
  android_store_url?: string | null
  indir_url?: string | null
}

/**
 * Kullanılacak şablonu döndürür.
 *
 * ★ Ayarlarda özel şablon varsa o, yoksa güncel varsayılan.
 * ★ Mağaza adresleri ve logolar ayarlardan geçiriliyor.
 */
export function sablonHazirla(s: SablonKaynak | null | undefined): string {
  const ozel = s?.default_template?.trim()
  if (ozel) return ozel

  return varsayilanSablon({
    logoAcik: s?.logo_light_url?.trim() || VARSAYILAN_SABLON_AYAR.logoAcik,
    logoKoyu: s?.logo_dark_url?.trim() || VARSAYILAN_SABLON_AYAR.logoKoyu,
    appStoreUrl: s?.ios_store_url?.trim() || null,
    playStoreUrl: s?.android_store_url?.trim() || null,
    indirUrl: s?.indir_url?.trim() || VARSAYILAN_SABLON_AYAR.indirUrl,
    siteUrl: s?.site_url?.trim() || VARSAYILAN_SABLON_AYAR.siteUrl,
    marka: s?.brand_name?.trim() || VARSAYILAN_SABLON_AYAR.marka,
  })
}
