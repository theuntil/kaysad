-- ═══════════════════════════════════════════════════════════════════════
-- MAİL ŞABLONU + MAĞAZA ADRESLERİ
--
-- ★ panel_v4_9'dan SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) MAĞAZA ADRESLERİ + LOGO                                        ║
-- ║                                                                    ║
-- ║  ★ Şablonda GÖMÜLÜ tutulmuyor. Adres değişince şablonu elle        ║
-- ║    düzenlemek yerine ayarlardan güncelleniyor.                     ║
-- ║                                                                    ║
-- ║  ★ Logo PATH değil URL — mail istemcisi sunucundaki dosya yoluna   ║
-- ║    erişemez, tam adres şart.                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

alter table mail_settings add column if not exists app_store_url  text;
alter table mail_settings add column if not exists play_store_url text;
alter table mail_settings add column if not exists logo_light_url text;
alter table mail_settings add column if not exists logo_dark_url  text;
alter table mail_settings add column if not exists site_url       text;
alter table mail_settings add column if not exists brand_name     text;

-- Varsayılanlar — kendi değerlerinle değiştirebilirsin
update mail_settings set
  logo_light_url = coalesce(nullif(logo_light_url, ''),
    'https://supabase.rovand.cloud/storage/v1/object/public/galeri/2026-08/kays-20260803-0nfgkh.png'),
  logo_dark_url  = coalesce(nullif(logo_dark_url,  ''),
    'https://supabase.rovand.cloud/storage/v1/object/public/galeri/2026-08/kays1-20260803-91s4m6.png'),
  site_url       = coalesce(nullif(site_url,       ''), 'https://kays.business'),
  brand_name     = coalesce(nullif(brand_name,     ''), 'Kays')
where true;

-- ★ Mağaza adreslerini KENDİ bağlantılarınla doldur.
--   Boş bırakırsan o düğme mailde hiç görünmüyor.
--
-- update mail_settings set
--   app_store_url  = 'https://apps.apple.com/tr/app/...',
--   play_store_url = 'https://play.google.com/store/apps/details?id=...'
-- where id = 1;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) TOPLU MAİL ALICI SORGUSU                                       ║
-- ║                                                                    ║
-- ║  ★ Filtreye uyan kullanıcıları döndürüyor. `security definer` —    ║
-- ║    panel service_role ile çağırıyor ama fonksiyon olarak durması   ║
-- ║    filtre mantığını tek yerde tutuyor.                             ║
-- ║                                                                    ║
-- ║  ★ E-postası olmayan ve banlı kullanıcılar ELENİYOR — banlı        ║
-- ║    kullanıcıya duyuru göndermek istenmiyor.                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_mail_alicilar(text, text, boolean, integer);

create or replace function admin_mail_alicilar(
  p_sehir     text    default null,
  p_rol       text    default null,
  p_dogrulu   boolean default null,
  p_limit     integer default 5000
) returns table (
  user_id  uuid,
  email    text,
  username text,
  name     text,
  sehir    text,
  role     text
) language sql stable security definer set search_path = public as $$
  select
    p.id, p.email, p.username, p.name, p.sehir, p.role
  from profiles p
  where p.email is not null
    and p.email <> ''
    and coalesce(p.is_banned, false) = false
    and (p_sehir   is null or p.sehir = p_sehir)
    and (p_rol     is null or p.role  = p_rol)
    and (p_dogrulu is null or coalesce(p.email_verified, false) = p_dogrulu)
  order by p.created_at desc
  limit greatest(1, least(p_limit, 20000));
$$;

grant execute on function admin_mail_alicilar(text, text, boolean, integer) to service_role;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) FİLTRE SAYIMI — göndermeden önce kaç kişi olduğunu göster      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_mail_alici_sayisi(text, text, boolean);

create or replace function admin_mail_alici_sayisi(
  p_sehir   text    default null,
  p_rol     text    default null,
  p_dogrulu boolean default null
) returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer
  from profiles p
  where p.email is not null
    and p.email <> ''
    and coalesce(p.is_banned, false) = false
    and (p_sehir   is null or p.sehir = p_sehir)
    and (p_rol     is null or p.role  = p_rol)
    and (p_dogrulu is null or coalesce(p.email_verified, false) = p_dogrulu);
$$;

grant execute on function admin_mail_alici_sayisi(text, text, boolean) to service_role;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) ŞEHİR LİSTESİ — filtre açılır kutusu için                      ║
-- ║                                                                    ║
-- ║  ★ Sabit liste yerine gerçek veriden geliyor: sadece kullanıcısı   ║
-- ║    olan şehirler çıkıyor, boş seçenek görünmüyor.                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_mail_sehirler();

create or replace function admin_mail_sehirler()
returns table (sehir text, adet integer)
language sql stable security definer set search_path = public as $$
  select p.sehir, count(*)::integer
  from profiles p
  where p.sehir is not null
    and p.sehir <> ''
    and p.email is not null
    and coalesce(p.is_banned, false) = false
  group by p.sehir
  order by count(*) desc, p.sehir;
$$;

grant execute on function admin_mail_sehirler() to service_role;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select column_name from information_schema.columns
where table_name = 'mail_settings'
  and column_name in ('app_store_url','play_store_url','logo_light_url','logo_dark_url','site_url','brand_name')
order by column_name;

select admin_mail_alici_sayisi(null, null, null) as toplam_alici;
select admin_mail_alici_sayisi(null, 'business', null) as isletme_sayisi;
select * from admin_mail_sehirler() limit 10;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) admin_save_mail_settings — YENİ KOLONLARI KABUL ETSİN          ║
-- ║                                                                    ║
-- ║  ★ Fonksiyon açıkça listelenen kolonları yazıyor; yeni alanlar     ║
-- ║    eklenmezse panelden kaydedilse bile sessizce yok sayılıyor.     ║
-- ║                                                                    ║
-- ║  ★ `case when p_patch ? 'x'` kullanılıyor, `coalesce` DEĞİL:       ║
-- ║    coalesce ile boş metin gönderip alanı TEMİZLEYEMİYORDUN.        ║
-- ║    Mağaza adresini silmek istersen bu şart.                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- ★ ÖNCE DROP: mevcut fonksiyon `mail_settings` döndürüyor.
--   `create or replace` dönüş tipini DEĞİŞTİREMİYOR:
--     ERROR 42P13: cannot change return type of existing function
--   Aynı tipi koruyoruz ama yine de drop ediyoruz — ileride tip
--   değişirse bu dosya tekrar çalıştırılabilir kalsın.
drop function if exists admin_save_mail_settings(jsonb);

create or replace function admin_save_mail_settings(p_patch jsonb)
returns mail_settings language plpgsql security definer set search_path = public as $$
declare
  v_row mail_settings;
begin
  update mail_settings set
    provider        = coalesce(p_patch->>'provider', provider),
    smtp_host       = coalesce(p_patch->>'smtp_host', smtp_host),
    smtp_port       = coalesce((p_patch->>'smtp_port')::integer, smtp_port),
    smtp_secure     = coalesce((p_patch->>'smtp_secure')::boolean, smtp_secure),
    smtp_user       = coalesce(p_patch->>'smtp_user', smtp_user),
    smtp_pass       = case when nullif(p_patch->>'smtp_pass','') is null
                           then smtp_pass else p_patch->>'smtp_pass' end,
    api_key         = case when nullif(p_patch->>'api_key','') is null
                           then api_key else p_patch->>'api_key' end,
    from_email      = coalesce(p_patch->>'from_email', from_email),
    from_name       = coalesce(p_patch->>'from_name', from_name),
    reply_to        = coalesce(p_patch->>'reply_to', reply_to),
    imap_host       = coalesce(p_patch->>'imap_host', imap_host),
    imap_port       = coalesce((p_patch->>'imap_port')::integer, imap_port),
    imap_secure     = coalesce((p_patch->>'imap_secure')::boolean, imap_secure),
    imap_user       = coalesce(p_patch->>'imap_user', imap_user),
    imap_pass       = case when nullif(p_patch->>'imap_pass','') is null
                           then imap_pass else p_patch->>'imap_pass' end,
    imap_folder     = coalesce(p_patch->>'imap_folder', imap_folder),
    imap_enabled    = coalesce((p_patch->>'imap_enabled')::boolean, imap_enabled),
    is_active       = coalesce((p_patch->>'is_active')::boolean, is_active),
    daily_limit     = coalesce((p_patch->>'daily_limit')::integer, daily_limit),
    default_template= coalesce(p_patch->>'default_template', default_template),
    signature_html  = coalesce(p_patch->>'signature_html', signature_html),
    inbound_secret  = case when nullif(p_patch->>'inbound_secret','') is null
                           then inbound_secret else p_patch->>'inbound_secret' end,
    inbound_enabled = coalesce((p_patch->>'inbound_enabled')::boolean, inbound_enabled),

    -- ★ YENİ: marka ve mağaza. Anahtar GÖNDERİLDİYSE yazılıyor —
    --   boş metin gönderip temizlemek mümkün.
    app_store_url   = case when p_patch ? 'app_store_url'
                           then nullif(p_patch->>'app_store_url','') else app_store_url end,
    play_store_url  = case when p_patch ? 'play_store_url'
                           then nullif(p_patch->>'play_store_url','') else play_store_url end,
    logo_light_url  = case when p_patch ? 'logo_light_url'
                           then nullif(p_patch->>'logo_light_url','') else logo_light_url end,
    logo_dark_url   = case when p_patch ? 'logo_dark_url'
                           then nullif(p_patch->>'logo_dark_url','') else logo_dark_url end,
    site_url        = case when p_patch ? 'site_url'
                           then nullif(p_patch->>'site_url','') else site_url end,
    brand_name      = case when p_patch ? 'brand_name'
                           then nullif(p_patch->>'brand_name','') else brand_name end,

    updated_at      = now()
  where id = 1
  returning * into v_row;

  -- ★ Güncellenen satır dönüyor — panel kaydettikten sonra
  --   sunucudan tekrar okumadan güncel değerleri gösterebiliyor
  return v_row;
end;
$$;

grant execute on function admin_save_mail_settings(jsonb) to service_role;
grant execute on function admin_save_mail_settings(jsonb) to authenticated;


-- ── Doğrulama ──
select app_store_url, play_store_url, logo_light_url, logo_dark_url,
       site_url, brand_name
from mail_settings where id = 1;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) ESKİ ŞABLONU TEMİZLE (isteğe bağlı)                            ║
-- ║                                                                    ║
-- ║  ★ Şablon seçimi kodda şöyle:                                      ║
-- ║      s.default_template?.trim() || varsayilanSablon(...)           ║
-- ║                                                                    ║
-- ║    Yani veritabanında ESKİ bir şablon kayıtlıysa YENİ varsayılan   ║
-- ║    hiç devreye girmiyor. "Değişiklik uygulanmamış" gibi görünmesi  ║
-- ║    bundan.                                                         ║
-- ║                                                                    ║
-- ║  ★ Panelden de yapılabilir:                                        ║
-- ║      Ayarlar → Mail → Şablon → "Varsayılana dön"                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Önce bak — özel şablon var mı?
select
  case when coalesce(trim(default_template), '') = ''
       then 'VARSAYILAN kullanılıyor'
       else 'ÖZEL şablon kayıtlı (' || length(default_template) || ' karakter)'
  end as sablon_durumu
from mail_settings where id = 1;

-- ★ Yeni tasarımı görmek için yorum satırını kaldır:
-- update mail_settings set default_template = null where id = 1;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) ESKİ ŞABLONU TEMİZLE  ← ÖNEMLİ                                 ║
-- ║                                                                    ║
-- ║  ┌─ SORUN ─────────────────────────────────────────────────────┐  ║
-- ║  │ Kod şöyle çalışıyor:                                         │  ║
-- ║  │                                                              │  ║
-- ║  │   default_template DOLU  → onu kullan                        │  ║
-- ║  │   default_template BOŞ   → yeni varsayılanı üret             │  ║
-- ║  │                                                              │  ║
-- ║  │ Veritabanında ESKİ şablon kayıtlı olduğu için yeni tasarım   │  ║
-- ║  │ hiç devreye girmiyordu. Kod değişti ama DB'deki değer        │  ║
-- ║  │ kazanıyordu.                                                  │  ║
-- ║  └─────────────────────────────────────────────────────────────┘  ║
-- ║                                                                    ║
-- ║  ★ Alanı NULL yapıyoruz. Bu "şablon yok" demek değil —            ║
-- ║    "koddaki güncel varsayılanı kullan" demek. Kendi şablonunu     ║
-- ║    yazmak istersen panelden girebilirsin.                          ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Önce mevcut şablonu yedekle (fikrini değiştirirsen geri alabilesin)
alter table mail_settings add column if not exists default_template_yedek text;

update mail_settings
set default_template_yedek = default_template
where default_template is not null
  and default_template <> ''
  and default_template_yedek is null;

-- ★ Şimdi temizle — kod artık güncel varsayılanı üretecek
update mail_settings set default_template = null where id = 1;


-- ── Doğrulama: boş olmalı ──
select
  case when default_template is null or default_template = ''
       then 'BOS — koddaki guncel varsayilan kullanilacak'
       else 'DOLU — hala eski sablon devrede'
  end as sablon_durumu,
  length(coalesce(default_template_yedek, '')) as yedek_uzunluk
from mail_settings where id = 1;

-- ★ Geri almak istersen:
-- update mail_settings set default_template = default_template_yedek where id = 1;
