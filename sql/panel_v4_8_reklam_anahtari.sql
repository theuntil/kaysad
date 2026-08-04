-- ═══════════════════════════════════════════════════════════════════════
-- REKLAM ANAHTARI DÜZELTMESİ
--
-- ┌─ SORUN ───────────────────────────────────────────────────────────┐
-- │ Ayarlar → Alt sistemler → "Reklamlar" anahtarı sadece bayrak       │
-- │ yazıyordu. Hiçbir yer onu OKUMUYORDU:                              │
-- │                                                                    │
-- │   ad_campaigns RLS politikası → "status = 'active'"                │
-- │   (anahtara bakmıyor)                                              │
-- │                                                                    │
-- │ Yani anahtarı kapatsan bile mobil uygulama reklamları              │
-- │ görmeye devam ediyordu.                                            │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ ÇÖZÜM ───────────────────────────────────────────────────────────┐
-- │ 1. RLS politikası artık anahtarı KONTROL EDİYOR — kapalıyken       │
-- │    tablo boş görünüyor. Mobil tarafta kod değişikliği GEREKMİYOR.  │
-- │ 2. get_active_ads() — mobilin kullanması gereken düzgün fonksiyon  │
-- │ 3. ad_track() kapalıyken sayaç işlemiyor                           │
-- │ 4. Boost bayrakları da anahtara bağlandı                           │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ KAYS_GUNCELLEME_v45_v46_v47.sql'den SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) RLS: reklam anahtarı kapalıysa tablo BOŞ görünsün              ║
-- ║                                                                    ║
-- ║  ★ Bu en önemli kısım: mobil uygulama ne yaparsa yapsın            ║
-- ║    (doğrudan tablo sorgusu, RPC, view) reklam göremez.             ║
-- ║    Uygulamaya güncelleme göndermene gerek yok.                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop policy if exists ad_campaigns_public on ad_campaigns;

create policy ad_campaigns_public on ad_campaigns
  for select using (
    status = 'active'
    -- ★ Panel anahtarı + bakım modu kontrolü
    and coalesce((select c.ads_service and not c.maintenance
                  from app_config c where c.id = 1), true)
    -- Süresi dolmuşsa gösterme (cron gecikirse diye ek güvenlik)
    and (ends_at is null or ends_at > now())
  );


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) MOBİLİN KULLANACAĞI FONKSİYON                                  ║
-- ║                                                                    ║
-- ║  Doğrudan tablo sorgusu yerine bunu çağırmak daha iyi:             ║
-- ║    · Kapalıyken NEDEN boş döndüğünü söylüyor                        ║
-- ║    · Alan kapasitesine göre sıralı ve sınırlı dönüyor              ║
-- ║    · En yüksek fiyat verenler önce                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists get_active_ads(text);

create or replace function get_active_ads(p_slot text default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_acik boolean;
  v_bakim boolean;
begin
  select ads_service, maintenance into v_acik, v_bakim from app_config where id = 1;

  -- ★ Kapalıysa boş liste + sebep
  if coalesce(v_bakim, false) then
    return json_build_object('ads', '[]'::json, 'enabled', false, 'reason', 'maintenance');
  end if;

  if not coalesce(v_acik, true) then
    return json_build_object('ads', '[]'::json, 'enabled', false, 'reason', 'ads_disabled');
  end if;

  return json_build_object(
    'enabled', true,
    'reason', null,
    'ads', (
      select coalesce(json_agg(x order by x.monthly_price desc), '[]'::json)
      from (
        select c.id, c.slot_key, c.title, c.description,
               c.image_url, c.logo_url,
               c.target_type, c.target_value,
               c.monthly_price
        from ad_campaigns c
        join ad_slots s on s.key = c.slot_key
        where c.status = 'active'
          and (c.ends_at is null or c.ends_at > now())
          and (p_slot is null or c.slot_key = p_slot)
        -- ★ Alan kapasitesini aşan kayıt olmasın (veri tutarsızlığına karşı)
        order by c.monthly_price desc
        limit 50
      ) x
    )
  );
end;
$$;

grant execute on function get_active_ads(text) to anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) SAYAÇ: kapalıyken gösterim/tıklama işlenmesin                  ║
-- ║                                                                    ║
-- ║  ★ Reklamlar kapalıyken sayaç dönerse reklam verene yanlış rapor    ║
-- ║    vermiş oluruz — "gösterildi" diyoruz ama gösterilmedi.           ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function ad_track(p_campaign_id uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('view', 'click') then
    raise exception 'Gecersiz olay: %', p_event;
  end if;

  -- ★ Reklam sistemi kapalıysa sayma
  if not coalesce((select ads_service and not maintenance
                   from app_config where id = 1), true) then
    return;
  end if;

  -- Kampanya gerçekten aktif mi?
  if not exists (
    select 1 from ad_campaigns
    where id = p_campaign_id and status = 'active'
      and (ends_at is null or ends_at > now())
  ) then
    return;
  end if;

  insert into ad_stats_daily (campaign_id, gun, gosterim, tiklama)
  values (
    p_campaign_id, current_date,
    case when p_event = 'view' then 1 else 0 end,
    case when p_event = 'click' then 1 else 0 end
  )
  on conflict (campaign_id, gun) do update set
    gosterim = ad_stats_daily.gosterim + case when p_event = 'view' then 1 else 0 end,
    tiklama  = ad_stats_daily.tiklama  + case when p_event = 'click' then 1 else 0 end;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) BOOST DA ANAHTARA BAĞLI                                        ║
-- ║                                                                    ║
-- ║  Boost bir reklam türü — reklamlar kapalıyken öne çıkarma da        ║
-- ║  durmalı. Bayraklar iniyor, anahtar açılınca geri geliyor.          ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function boost_apply_flags()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_map record;
  v_acik boolean;
begin
  -- ★ Reklamlar kapalıysa TÜM boost bayraklarını indir
  select ads_service and not maintenance into v_acik from app_config where id = 1;
  v_acik := coalesce(v_acik, true);

  for v_map in
    select * from (values
      ('listing',  'listings'),
      ('discount', 'indirimler'),
      ('event',    'etkinlikler')
    ) as t(tip, tablo)
  loop
    continue when not exists (
      select 1 from information_schema.tables
      where table_schema='public' and table_name=v_map.tablo);
    continue when not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=v_map.tablo and column_name='boost');

    -- Önce hepsini kapat
    execute format(
      'update %I set boost = false, super_boost = false
       where coalesce(boost,false) or coalesce(super_boost,false)', v_map.tablo);

    -- Reklam sistemi kapalıysa burada dur — bayraklar inik kalsın
    continue when not v_acik;

    execute format(
      'update %I t set boost = true
       from boost_requests b
       where b.content_id = t.id and b.content_type = $1
         and b.status = ''active'' and b.boost_type = ''boost''
         and (b.ends_at is null or b.ends_at > now())', v_map.tablo)
    using v_map.tip;

    execute format(
      'update %I t set boost = true, super_boost = true
       from boost_requests b
       where b.content_id = t.id and b.content_type = $1
         and b.status = ''active'' and b.boost_type = ''super_boost''
         and (b.ends_at is null or b.ends_at > now())', v_map.tablo)
    using v_map.tip;
  end loop;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) ANAHTAR DEĞİŞİNCE BOOST BAYRAKLARINI TAZELE                    ║
-- ║                                                                    ║
-- ║  ★ Panelden anahtarı kapattığın anda boost bayrakları inmeli;       ║
-- ║    açtığında geri gelmeli. Tetikleyici bunu yapıyor.                ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function trg_fn_config_ads_changed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ads_service is distinct from old.ads_service
     or new.maintenance is distinct from old.maintenance then
    begin
      perform boost_apply_flags();
    exception when others then
      raise notice 'boost bayraklari guncellenemedi: %', sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_config_ads_changed on app_config;
create trigger trg_config_ads_changed
after update on app_config
for each row execute function trg_fn_config_ads_changed();


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) PANEL: anahtarın gerçek etkisini göster                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_ads_impact();

create or replace function admin_ads_impact()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'enabled', (select ads_service and not maintenance from app_config where id = 1),
    'maintenance', (select maintenance from app_config where id = 1),
    -- Anahtar kapanırsa kaç şey gizlenecek
    'aktif_reklam', (select count(*) from ad_campaigns
                       where status = 'active' and (ends_at is null or ends_at > now())),
    'aktif_boost', (select count(*) from boost_requests where status = 'active'),
    'bugun_gosterim', (select coalesce(sum(gosterim),0) from ad_stats_daily
                         where gun = current_date),
    'aylik_gelir', (select coalesce(sum(monthly_price),0) from ad_campaigns
                      where status = 'active')
  );
$$;

revoke all on function admin_ads_impact() from public, anon, authenticated;
grant execute on function admin_ads_impact() to service_role;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA — anahtarın gerçekten çalıştığını test et                ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- ── ADIM 1: Şu anki durum ──
select
  (select ads_service from app_config where id=1) as anahtar,
  (select count(*) from ad_campaigns where status='active') as aktif_reklam,
  json_array_length(get_active_ads(null)->'ads') as gorunen_reklam;

-- ── ADIM 2: Anahtarı KAPAT ve tekrar bak ──
update app_config set ads_service = false where id = 1;

select
  'KAPALI' as durum,
  json_array_length(get_active_ads(null)->'ads') as gorunen_reklam,   -- 0 olmalı
  get_active_ads(null)->>'reason' as sebep,                           -- ads_disabled
  (select count(*) from listings where coalesce(boost,false)) as boostlu_ilan;  -- 0 olmalı

-- ── ADIM 3: Anahtarı GERİ AÇ ──
update app_config set ads_service = true where id = 1;

select
  'ACIK' as durum,
  json_array_length(get_active_ads(null)->'ads') as gorunen_reklam,   -- eski sayıya döner
  (select count(*) from listings where coalesce(boost,false)) as boostlu_ilan;

-- ── ADIM 4: Etki özeti ──
select admin_ads_impact() as reklam_etkisi;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  7) "YENİ KAYIT" ANAHTARI — gerçekten çalışsın                     ║
-- ║                                                                    ║
-- ║  ★ Bu da reklam anahtarıyla aynı durumdaydı: bayrak yazılıyordu    ║
-- ║    ama kimse okumuyordu. Artık auth.users'a tetikleyici koyuyoruz. ║
-- ║                                                                    ║
-- ║  ★ Kapalıyken yeni kayıt engelleniyor, MEVCUT kullanıcılar         ║
-- ║    etkilenmiyor — giriş yapmaya devam ediyorlar.                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function trg_fn_block_registration()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_acik boolean;
  v_bakim boolean;
begin
  select registration_open, maintenance into v_acik, v_bakim
  from app_config where id = 1;

  if coalesce(v_bakim, false) then
    raise exception 'Uygulama bakimda. Yeni kayit alinamiyor.'
      using errcode = 'P0001', hint = 'maintenance';
  end if;

  if not coalesce(v_acik, true) then
    raise exception 'Yeni kayitlar gecici olarak kapali.'
      using errcode = 'P0001', hint = 'registration_closed';
  end if;

  return new;
end;
$$;

do $$
begin
  begin
    drop trigger if exists trg_block_registration on auth.users;
    create trigger trg_block_registration
    before insert on auth.users
    for each row execute function trg_fn_block_registration();
    raise notice 'Yeni kayit anahtari auth.users uzerinde aktif';
  exception when insufficient_privilege then
    raise notice 'auth.users uzerinde trigger yetkisi yok — kayit engeli mobil tarafta kontrol edilmeli';
  when others then
    raise notice 'Kayit tetikleyicisi kurulamadi: %', sqlerrm;
  end;
end $$;


-- ── Mobil tarafın kayıt öncesi soracağı fonksiyon ──
--    (Tetikleyici zaten engelliyor ama kullanıcıya düzgün mesaj
--     göstermek için önceden sormak daha iyi.)
drop function if exists can_register();

create or replace function can_register()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'allowed', c.registration_open and not c.maintenance,
    'reason', case
      when c.maintenance then 'maintenance'
      when not c.registration_open then 'registration_closed'
      else null end,
    'message', case
      when c.maintenance then coalesce(c.maintenance_message, 'Uygulama bakımda.')
      when not c.registration_open then 'Yeni kayıtlar geçici olarak kapalı.'
      else null end
  )
  from app_config c where c.id = 1;
$$;

grant execute on function can_register() to anon, authenticated;


-- ── Doğrulama: kayıt anahtarı ──
select can_register() as kayit_durumu;
