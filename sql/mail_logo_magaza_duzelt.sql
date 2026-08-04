-- ═══════════════════════════════════════════════════════════════════════
-- MAİL LOGO ADRESLERİ + MAĞAZA BAĞLANTILARI
--
-- ┌─ SORUN 1: KARANLIK MOD LOGOSU ────────────────────────────────────┐
-- │ İlk sürüm `logo_dark_url` alanına şunu yazmıştı:                  │
-- │   https://kays.business/kays1.png     ← böyle bir dosya YOK        │
-- │                                                                    │
-- │ Sonraki sürümde doğru adresi koydum ama `coalesce(nullif(...))`   │
-- │ kullanıyordu — alan zaten DOLU olduğu için üzerine yazmadı.        │
-- │ Karanlık modda logo kırık görünüyordu.                             │
-- │                                                                    │
-- │ ★ Bu dosya KOŞULSUZ yazıyor.                                       │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ SORUN 2: MAĞAZA BAĞLANTILARI ────────────────────────────────────┐
-- │ Rozetler `mail_settings.app_store_url` okuyordu; orası boştu ve    │
-- │ site adresine düşüyordu.                                           │
-- │                                                                    │
-- │ ★ Artık `app_config.ios_store_url` ve `android_store_url`         │
-- │   kullanılıyor — uygulamanın kendi ayarı. Aynı bilgiyi iki yerde  │
-- │   tutmak birbirinden ayrılmalarına yol açıyordu.                   │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ mail_sablon_magaza.sql'den SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) LOGO ADRESLERİNİ KOŞULSUZ YAZ                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

update mail_settings set
  logo_light_url =
    'https://supabase.rovand.cloud/storage/v1/object/public/galeri/2026-08/kays-20260803-0nfgkh.png',
  logo_dark_url  =
    'https://supabase.rovand.cloud/storage/v1/object/public/galeri/2026-08/kays1-20260803-91s4m6.png',
  brand_name     = coalesce(nullif(brand_name, ''), 'Kays'),
  updated_at     = now()
where id = 1;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) MAİL AYARLARINDAKİ MAĞAZA KOPYALARINI TEMİZLE                  ║
-- ║                                                                    ║
-- ║  ★ Kolonlar duruyor (eski kayıt bozulmasın) ama artık             ║
-- ║    okunmuyorlar. Boşaltmak "hangisi geçerli?" karışıklığını        ║
-- ║    ortadan kaldırıyor.                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝

update mail_settings set
  app_store_url  = null,
  play_store_url = null
where id = 1;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) MAĞAZA ADRESLERİNİ app_config'E YAZ                            ║
-- ║                                                                    ║
-- ║  ★★★ AŞAĞIDAKİ İKİ SATIRI KENDİ ADRESLERİNLE DEĞİŞTİR ★★★         ║
-- ║                                                                    ║
-- ║  Bunlar sadece maillerde değil, uygulamanın "güncelle" ekranında   ║
-- ║  da kullanılıyor — tek yerden yönetiliyor.                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

update app_config set
  ios_store_url     = 'https://apps.apple.com/tr/app/kays/idXXXXXXXXX',
  android_store_url = 'https://play.google.com/store/apps/details?id=com.kays.app'
where id = 1;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Logo adresleri doğru mu?
select
  case when logo_light_url like '%kays-20260803%'  then 'DOGRU' else 'HATALI' end as aydinlik_logo,
  case when logo_dark_url  like '%kays1-20260803%' then 'DOGRU' else 'HATALI' end as karanlik_logo,
  case when default_template is null or default_template = ''
       then 'BOS (guncel varsayilan kullanilacak)'
       else 'DOLU (eski sablon devrede!)' end as sablon
from mail_settings where id = 1;

-- Mağaza adresleri yazıldı mı?
select ios_store_url, android_store_url from app_config where id = 1;

-- ★ Logo adreslerini tarayıcıda aç ve gerçekten açıldığını gör:
select logo_light_url, logo_dark_url from mail_settings where id = 1;
