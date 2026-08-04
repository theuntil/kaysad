-- ═══════════════════════════════════════════════════════════════════════
-- KAYITLI ADRESLERİ DÜZELT
--
-- ┌─ SORUN ───────────────────────────────────────────────────────────┐
-- │ Yükleme sırasında görsel adresi `SUPABASE_URL`'den üretiliyordu.   │
-- │ Kendi sunucunda barındırdığın için bu değişken İÇ AĞ adresi:      │
-- │                                                                    │
-- │   http://kong:8000/storage/v1/object/public/reklam/...             │
-- │                                                                    │
-- │ Bu adres veritabanına böyle KAYDEDİLDİ. Panel sunucusu erişiyor    │
-- │ ama tarayıcı ve telefon erişemiyor.                                │
-- │                                                                    │
-- │ Panel artık gösterim anında düzeltiyor (`adresiDuzelt`), ama       │
-- │ MOBİL UYGULAMA kayıtlı adresi olduğu gibi kullanıyor. Bu yüzden   │
-- │ veritabanını da düzeltmek gerekiyor.                               │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ ÖNCE 1. ADIMI ÇALIŞTIR, çıktıya bak, sonra 3. adımı çalıştır.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) HANGİ ADRESLER KAYITLI? — önce bak                             ║
-- ║                                                                    ║
-- ║  Çıktıdaki "kok" sütununa bak. Dış adresinden farklıysa            ║
-- ║  (örn. http://kong:8000) düzeltilmesi gereken kayıtlar bunlar.     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

with adresler as (
  select image_url as u from ad_campaigns where image_url is not null
  union all
  select logo_url  from ad_campaigns where logo_url  is not null
)
select
  substring(u from '^https?://[^/]+') as kok,
  count(*)                            as adet
from adresler
group by 1
order by 2 desc;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) DEĞERLERİ AYARLA                                               ║
-- ║                                                                    ║
-- ║  ★ ESKI_KOK  → 1. adımda gördüğün yanlış kök                       ║
-- ║  ★ YENI_KOK  → dışarıdan erişilen adres                            ║
-- ║                                                                    ║
-- ║  İkisini de kendi değerlerinle değiştir.                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Örnek (kendi değerlerin farklı olacak):
--   v_eski = 'http://kong:8000'          ← 1. adımın çıktısından
--   v_yeni = 'https://db.siteniz.com'    ← dışarıdan erişilen adres


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) DÜZELT — üstteki değerleri yazdıktan sonra çalıştır            ║
-- ║                                                                    ║
-- ║  ★ `where ... like` koşulu şart: sadece yanlış kökle başlayanlar   ║
-- ║    değişiyor, doğru olanlara dokunulmuyor.                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare
  -- ★★★ BU İKİ SATIRI KENDİ DEĞERLERİNLE DEĞİŞTİR ★★★
  --
  --   v_eski → 1. adımda gördüğün YANLIŞ kök
  --   v_yeni → Supabase'inin DIŞARIDAN erişilen adresi
  --
  -- ★ v_yeni MUTLAKA https:// olmalı. Panel https://kays.business
  --   üzerinde; https bir sayfada http görsel tarayıcı tarafından
  --   "karışık içerik" sayılıp engellenir. Bu kural kapatılamaz.
  v_eski text := 'http://ESKI-ADRES';
  v_yeni text := 'https://SUPABASE-ADRESIN';

  v_sayi integer;
begin
  if v_eski = v_yeni then
    raise notice 'Eski ve yeni kok ayni — degisiklik yapilmadi.';
    return;
  end if;

  -- ── Reklam kampanyaları ──
  update ad_campaigns
  set image_url = v_yeni || substring(image_url from length(v_eski) + 1)
  where image_url like v_eski || '%';
  get diagnostics v_sayi = row_count;
  raise notice 'ad_campaigns.image_url: % kayit', v_sayi;

  update ad_campaigns
  set logo_url = v_yeni || substring(logo_url from length(v_eski) + 1)
  where logo_url like v_eski || '%';
  get diagnostics v_sayi = row_count;
  raise notice 'ad_campaigns.logo_url: % kayit', v_sayi;

  -- ── Popup ──
  begin
    update popups
    set image_url = v_yeni || substring(image_url from length(v_eski) + 1)
    where image_url like v_eski || '%';
    get diagnostics v_sayi = row_count;
    raise notice 'popups.image_url: % kayit', v_sayi;

    update popups
    set logo_url = v_yeni || substring(logo_url from length(v_eski) + 1)
    where logo_url like v_eski || '%';
    get diagnostics v_sayi = row_count;
    raise notice 'popups.logo_url: % kayit', v_sayi;
  exception when undefined_table or undefined_column then
    raise notice 'popups atlandi (tablo/kolon yok)';
  end;

  -- ── Medya kütüphanesi ──
  begin
    update media_library
    set url = v_yeni || substring(url from length(v_eski) + 1)
    where url like v_eski || '%';
    get diagnostics v_sayi = row_count;
    raise notice 'media_library.url: % kayit', v_sayi;
  exception when undefined_table or undefined_column then
    raise notice 'media_library atlandi';
  end;

  -- ── Profil görselleri ──
  begin
    update profiles
    set avatar_url = v_yeni || substring(avatar_url from length(v_eski) + 1)
    where avatar_url like v_eski || '%';
    get diagnostics v_sayi = row_count;
    raise notice 'profiles.avatar_url: % kayit', v_sayi;
  exception when undefined_table or undefined_column then
    raise notice 'profiles atlandi';
  end;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) DOĞRULAMA — 1. adımı tekrar çalıştır                           ║
-- ║     Artık tek bir kök görmelisin: dış adresin.                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

with adresler as (
  select image_url as u from ad_campaigns where image_url is not null
  union all
  select logo_url  from ad_campaigns where logo_url  is not null
)
select
  substring(u from '^https?://[^/]+') as kok,
  count(*)                            as adet
from adresler
group by 1
order by 2 desc;
