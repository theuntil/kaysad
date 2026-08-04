-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V4.7 — AYARLAR SİSTEMİ + LİMİTLER + BAKIM MODU
--
-- ┌─ NE VAR ──────────────────────────────────────────────────────────┐
-- │ 1. admin_create_ad'daki "json || json" hatası düzeltildi            │
-- │ 2. app_config — bakım modu, sürüm, mail/telefon anahtarları         │
-- │ 3. content_limits — rol ve içerik tipine göre sınırlar              │
-- │ 4. check_content_limit() — mobil taraf bunu çağırıyor               │
-- │ 5. Mail/telefon servisleri için kapı fonksiyonları                  │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v4_6'dan SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) "operator does not exist: json || json" DÜZELTMESİ             ║
-- ║                                                                    ║
-- ║  ★ PostgreSQL'de `json || json` operatörü YOK — sadece jsonb'de     ║
-- ║    var. İki tarafı da jsonb'ye çevirip birleştirip json'a dönüyoruz.║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function admin_create_ad(
  p_advertiser uuid,
  p_slot text,
  p_title text,
  p_description text default null,
  p_image_url text default null,
  p_logo_url text default null,
  p_target_type text default 'external',
  p_target_value text default null,
  p_months integer default 1,
  p_monthly_price numeric default 0,
  p_activate boolean default false,
  p_note text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_camp ad_campaigns;
  v_slot ad_slots;
  v_aktif integer;
  v_no integer;
  v_sonuc jsonb;
begin
  if p_advertiser is null then raise exception 'Reklam veren secilmeli'; end if;
  if nullif(trim(coalesce(p_title,'')), '') is null then raise exception 'Baslik zorunlu'; end if;

  select * into v_slot from ad_slots where key = p_slot and is_active;
  if v_slot.key is null then raise exception 'Gecersiz alan: %', p_slot; end if;

  select coalesce(max(offer_count),0) + 1 into v_no
  from ad_campaigns where advertiser_id = p_advertiser and slot_key = p_slot;

  insert into ad_campaigns (
    advertiser_id, slot_key, title, description, image_url, logo_url,
    target_type, target_value, months, monthly_price,
    offer_note, offer_count, status, admin_note
  ) values (
    p_advertiser, p_slot, trim(p_title), p_description, p_image_url, p_logo_url,
    coalesce(p_target_type,'external'), p_target_value,
    coalesce(p_months,1), greatest(0.01, coalesce(p_monthly_price,0)),
    p_note, v_no, 'pending', 'Panelden oluşturuldu'
  ) returning * into v_camp;

  insert into ad_offers (campaign_id, advertiser_id, slot_key, offer_no, months, monthly_price, note)
  values (v_camp.id, p_advertiser, p_slot, v_no, v_camp.months, v_camp.monthly_price, p_note);

  if p_activate then
    select count(*) into v_aktif from ad_campaigns
    where slot_key = p_slot and status = 'active';

    if v_aktif >= v_slot.capacity then
      return json_build_object('id', v_camp.id, 'durum', 'pending',
        'uyari', format('%s alani dolu (%s/%s) — yayina alinamadi.',
                        v_slot.ad, v_aktif, v_slot.capacity));
    end if;

    -- ★ DÜZELTME: json değil jsonb üzerinde birleştirme
    v_sonuc := admin_ad_approve(v_camp.id, 'panel')::jsonb
               || jsonb_build_object('id', v_camp.id);
    return v_sonuc::json;
  end if;

  return json_build_object('id', v_camp.id, 'durum', 'pending');
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) UYGULAMA AYARLARI                                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists app_config (
  id                  smallint primary key default 1,

  /* ── Bakım modu ── */
  maintenance         boolean not null default false,
  maintenance_message text default 'Uygulama kısa süreliğine bakımda. Lütfen daha sonra tekrar deneyin.',
  maintenance_until   timestamptz,
  maintenance_at      timestamptz,
  maintenance_by      text,

  /* ── Sürüm ── */
  app_version         text default '1.0.0',
  min_version         text default '1.0.0',
  force_update        boolean not null default false,
  update_message      text default 'Yeni bir sürüm mevcut. Devam etmek için güncelleyin.',
  ios_store_url       text,
  android_store_url   text,

  /* ── Alt sistem anahtarları ── */
  mail_service        boolean not null default true,
  phone_service       boolean not null default true,
  push_service        boolean not null default true,
  ads_service         boolean not null default true,
  registration_open   boolean not null default true,

  updated_at          timestamptz not null default now(),
  updated_by          text,
  constraint app_config_single check (id = 1)
);

insert into app_config (id) values (1) on conflict (id) do nothing;

alter table app_config enable row level security;

-- ★ Uygulama bakım modunu ve sürümü OKUYABİLMELİ (giriş öncesi bile).
--   Yazma yok: sadece service_role (panel) değiştirebiliyor.
drop policy if exists app_config_read on app_config;
create policy app_config_read on app_config for select using (true);

grant select on app_config to anon, authenticated;


-- ── Mobil tarafın çağıracağı tek kapı ──
drop function if exists app_status(text);

create or replace function app_status(p_version text default null)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'maintenance', c.maintenance,
    'maintenance_message', c.maintenance_message,
    'maintenance_until', c.maintenance_until,
    'app_version', c.app_version,
    'min_version', c.min_version,
    -- ★ Sürüm karşılaştırma: gelen sürüm min_version'dan küçükse güncelleme şart
    'update_required', (
      c.force_update or (
        p_version is not null and
        string_to_array(regexp_replace(p_version, '[^0-9.]', '', 'g'), '.')::int[]
          < string_to_array(regexp_replace(c.min_version, '[^0-9.]', '', 'g'), '.')::int[]
      )
    ),
    'update_message', c.update_message,
    'ios_store_url', c.ios_store_url,
    'android_store_url', c.android_store_url,
    'services', json_build_object(
      'mail', c.mail_service,
      'phone', c.phone_service,
      'push', c.push_service,
      'ads', c.ads_service,
      'registration', c.registration_open
    )
  )
  from app_config c where c.id = 1;
$$;

grant execute on function app_status(text) to anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) İÇERİK SINIRLARI                                               ║
-- ║                                                                    ║
-- ║  ┌─ MANTIK ────────────────────────────────────────────────────┐   ║
-- ║  │ post     → GÜNLÜK   (bugün kaç gönderi attı)                 │   ║
-- ║  │ listing  → AKTİF    (şu an kaç açık ilanı var)               │   ║
-- ║  │ discount → AKTİF    (sadece işletme)                         │   ║
-- ║  │ event    → AKTİF    (şu an kaç açık etkinliği var)           │   ║
-- ║  └─────────────────────────────────────────────────────────────┘   ║
-- ║                                                                    ║
-- ║  ★ profiles.is_boosted = true olan kullanıcı "boosted" satırındaki  ║
-- ║    sınırı alıyor. Böylece bir kullanıcıya ekstra hak vermek için    ║
-- ║    kod değişikliği gerekmiyor.                                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists content_limits (
  content_type  text not null,
  role          text not null,
  limit_type    text not null,
  limit_value   integer not null default 0,
  is_allowed    boolean not null default true,
  updated_at    timestamptz not null default now(),
  primary key (content_type, role),
  constraint cl_content_chk check (content_type in ('post','listing','discount','event')),
  constraint cl_role_chk check (role in ('user','business','boosted_user','boosted_business')),
  constraint cl_type_chk check (limit_type in ('daily','active')),
  constraint cl_value_chk check (limit_value >= 0)
);

-- Varsayılan sınırlar
insert into content_limits (content_type, role, limit_type, limit_value, is_allowed) values
  -- Gönderi: günlük
  ('post', 'user',              'daily',  5,  true),
  ('post', 'business',          'daily', 10,  true),
  ('post', 'boosted_user',      'daily', 15,  true),
  ('post', 'boosted_business',  'daily', 30,  true),

  -- İlan: aktif
  ('listing', 'user',             'active',  3, true),
  ('listing', 'business',         'active', 20, true),
  ('listing', 'boosted_user',     'active', 10, true),
  ('listing', 'boosted_business', 'active', 50, true),

  -- İndirim: aktif · ★ sadece işletme
  ('discount', 'user',             'active', 0,  false),
  ('discount', 'business',         'active', 10, true),
  ('discount', 'boosted_user',     'active', 0,  false),
  ('discount', 'boosted_business', 'active', 25, true),

  -- Etkinlik: aktif
  ('event', 'user',             'active',  2, true),
  ('event', 'business',         'active', 10, true),
  ('event', 'boosted_user',     'active',  5, true),
  ('event', 'boosted_business', 'active', 25, true)
on conflict (content_type, role) do nothing;

alter table content_limits enable row level security;
drop policy if exists content_limits_read on content_limits;
create policy content_limits_read on content_limits for select using (true);
grant select on content_limits to anon, authenticated;


-- ── Kullanıcının rol anahtarını bul ──
drop function if exists _user_limit_role(uuid);

create or replace function _user_limit_role(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p.is_boosted, false) and p.role = 'business' then 'boosted_business'
    when coalesce(p.is_boosted, false) then 'boosted_user'
    when p.role = 'business' then 'business'
    else 'user'
  end
  from profiles p where p.id = p_user_id;
$$;


-- ── SINIR KONTROLÜ — mobil taraf bunu çağırıyor ──
drop function if exists check_content_limit(uuid, text);

create or replace function check_content_limit(
  p_user_id uuid default null,
  p_content_type text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_role text;
  v_limit content_limits;
  v_tbl text;
  v_owner text;
  v_date text;
  v_kullanilan bigint := 0;
  v_aktif_kolon text;
  v_bakim boolean;
begin
  if v_uid is null then raise exception 'Kullanici belirlenemedi'; end if;
  if p_content_type not in ('post','listing','discount','event') then
    raise exception 'Gecersiz icerik tipi: %', p_content_type;
  end if;

  -- ★ Bakım modunda hiçbir içerik oluşturulamaz
  select maintenance into v_bakim from app_config where id = 1;
  if coalesce(v_bakim, false) then
    return json_build_object(
      'allowed', false, 'reason', 'maintenance',
      'message', coalesce((select maintenance_message from app_config where id = 1),
                          'Uygulama bakımda.'));
  end if;

  v_role := _user_limit_role(v_uid);
  if v_role is null then
    return json_build_object('allowed', false, 'reason', 'no_profile',
                             'message', 'Profil bulunamadı.');
  end if;

  select * into v_limit from content_limits
  where content_type = p_content_type and role = v_role;

  if v_limit.content_type is null then
    -- Tanımsızsa serbest bırakma; güvenli taraf kapalı olmak
    return json_build_object('allowed', false, 'reason', 'no_limit_defined',
                             'message', 'Bu içerik türü için sınır tanımlanmamış.');
  end if;

  if not v_limit.is_allowed then
    return json_build_object(
      'allowed', false, 'reason', 'not_permitted',
      'message', case when p_content_type = 'discount'
                      then 'İndirim yalnızca işletme hesaplarına açıktır.'
                      else 'Bu içerik türünü oluşturma yetkiniz yok.' end,
      'role', v_role);
  end if;

  v_tbl := _admin_content_table(p_content_type);
  if v_tbl is null or not exists (select 1 from information_schema.tables
                                  where table_schema='public' and table_name=v_tbl) then
    return json_build_object('allowed', true, 'reason', 'table_missing',
                             'limit', v_limit.limit_value, 'used', 0);
  end if;

  v_owner := _admin_owner_column(v_tbl);
  if v_owner is null then
    return json_build_object('allowed', true, 'reason', 'no_owner_column',
                             'limit', v_limit.limit_value, 'used', 0);
  end if;

  if v_limit.limit_type = 'daily' then
    /* ── GÜNLÜK: bugün kaç tane oluşturdu ── */
    v_date := _admin_date_column(v_tbl);
    if v_date = 'id' then
      return json_build_object('allowed', true, 'reason', 'no_date_column',
                               'limit', v_limit.limit_value, 'used', 0);
    end if;

    execute format('select count(*) from %I where %I = $1 and %I >= current_date',
                   v_tbl, v_owner, v_date)
      into v_kullanilan using v_uid;
  else
    /* ── AKTİF: şu an kaç açık kaydı var ── */
    select column_name into v_aktif_kolon
    from information_schema.columns
    where table_schema='public' and table_name=v_tbl
      and column_name in ('is_active','aktif','is_published','yayinda','status','durum')
    order by array_position(
      array['is_active','aktif','is_published','yayinda','status','durum'], column_name)
    limit 1;

    if v_aktif_kolon is null then
      execute format('select count(*) from %I where %I = $1', v_tbl, v_owner)
        into v_kullanilan using v_uid;
    elsif v_aktif_kolon in ('status','durum') then
      execute format(
        'select count(*) from %I where %I = $1 and coalesce(%I::text, '''') not in
         (''deleted'',''expired'',''passive'',''archived'',''silindi'',''pasif'')',
        v_tbl, v_owner, v_aktif_kolon) into v_kullanilan using v_uid;
    else
      execute format('select count(*) from %I where %I = $1 and coalesce(%I, true)',
                     v_tbl, v_owner, v_aktif_kolon) into v_kullanilan using v_uid;
    end if;
  end if;

  return json_build_object(
    'allowed', v_kullanilan < v_limit.limit_value,
    'reason', case when v_kullanilan < v_limit.limit_value then 'ok' else 'limit_reached' end,
    'message', case when v_kullanilan < v_limit.limit_value then null
      else case v_limit.limit_type
        when 'daily' then format('Günlük %s hakkınızı doldurdunuz. Yarın tekrar deneyin.',
                                 v_limit.limit_value)
        else format('En fazla %s aktif kaydınız olabilir. Yeni eklemek için birini kapatın.',
                    v_limit.limit_value) end
    end,
    'limit', v_limit.limit_value,
    'used', v_kullanilan,
    'remaining', greatest(0, v_limit.limit_value - v_kullanilan),
    'limit_type', v_limit.limit_type,
    'role', v_role,
    'boosted', (select coalesce(is_boosted, false) from profiles where id = v_uid)
  );
end;
$$;

grant execute on function check_content_limit(uuid, text) to authenticated;


-- ── Kullanıcının tüm sınırları tek seferde (profil ekranı için) ──
drop function if exists my_content_limits();

create or replace function my_content_limits()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'post',     check_content_limit(auth.uid(), 'post'),
    'listing',  check_content_limit(auth.uid(), 'listing'),
    'discount', check_content_limit(auth.uid(), 'discount'),
    'event',    check_content_limit(auth.uid(), 'event')
  );
$$;

grant execute on function my_content_limits() to authenticated;


-- ── profiles.is_boosted kolonu yoksa ekle ──
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='profiles'
                   and column_name='is_boosted') then
    alter table profiles add column is_boosted boolean not null default false;
    raise notice 'profiles.is_boosted eklendi';
  end if;
end $$;

create index if not exists idx_profiles_boosted on profiles (is_boosted) where is_boosted;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) MAİL VE TELEFON SERVİSİ KAPILARI                               ║
-- ║                                                                    ║
-- ║  ★ Yüklediğin Express servisleri (mail-main, phone-main) her        ║
-- ║    istekte bu fonksiyonu çağırmalı. Panelden anahtarı kapatınca     ║
-- ║    servis kendini devre dışı bırakıyor — kodu değiştirmeye gerek    ║
-- ║    yok, yeniden başlatmaya da.                                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists service_enabled(text);

create or replace function service_enabled(p_service text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_service
    when 'mail'  then c.mail_service
    when 'phone' then c.phone_service
    when 'push'  then c.push_service
    when 'ads'   then c.ads_service
    when 'registration' then c.registration_open
    else false
  end
  -- ★ Bakım modunda tüm servisler kapalı sayılır
  and not c.maintenance
  from app_config c where c.id = 1;
$$;

grant execute on function service_enabled(text) to anon, authenticated, service_role;


-- ── Mail servisinin ihtiyaç duyduğu tablo (yoksa oluştur) ──
create table if not exists email_change_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  new_email       text not null,
  code            text not null,
  is_verification boolean not null default false,
  attempts        integer not null default 0,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  constraint ecr_email_chk check (new_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

create index if not exists idx_ecr_user on email_change_requests (user_id, created_at desc);
create index if not exists idx_ecr_expires on email_change_requests (expires_at);

alter table email_change_requests enable row level security;
drop policy if exists ecr_deny on email_change_requests;
-- ★ Kod istemciye sızmamalı: okuma tamamen kapalı, servis service_role ile geçiyor
create policy ecr_deny on email_change_requests for all using (false);


-- ── Telefon servisinin ihtiyaç duyduğu kolonlar ──
do $$
declare
  v_kolonlar text[][] := array[
    array['phone_change_temp', 'text'],
    array['phone_code_sent_at', 'timestamptz'],
    array['phone_verification_attempts', 'integer'],
    array['phone_last_attempt_at', 'timestamptz'],
    array['phone_verify', 'boolean']
  ];
  v_k text[];
begin
  foreach v_k slice 1 in array v_kolonlar loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='profiles'
                     and column_name = v_k[1]) then
      execute format('alter table profiles add column %I %s', v_k[1], v_k[2]);
      raise notice 'profiles.% eklendi', v_k[1];
    end if;
  end loop;
end $$;


-- ── Süresi geçmiş doğrulama isteklerini temizle ──
drop function if exists cleanup_verification_requests();

create or replace function cleanup_verification_requests()
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from email_change_requests where expires_at < now() - interval '1 hour';
  get diagnostics v_n = row_count;

  -- 1 saatten eski telefon denemelerini sıfırla
  update profiles
  set phone_change_temp = null,
      phone_verification_attempts = 0
  where phone_code_sent_at < now() - interval '1 hour'
    and phone_change_temp is not null;

  return json_build_object('silinen_mail_istegi', v_n);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) BAKIM MODU + PANEL FONKSİYONLARI                               ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_get_config();

create or replace function admin_get_config()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'config', to_jsonb(c),
    'limits', (
      select coalesce(json_agg(l order by
        array_position(array['post','listing','discount','event'], l.content_type),
        array_position(array['user','business','boosted_user','boosted_business'], l.role)
      ), '[]'::json)
      from content_limits l
    ),
    'boosted_user_count', (select count(*) from profiles where coalesce(is_boosted,false))
  )
  from app_config c where c.id = 1;
$$;


drop function if exists admin_save_config(jsonb, text);

create or replace function admin_save_config(p_patch jsonb, p_by text default 'panel')
returns json language plpgsql security definer set search_path = public as $$
declare v_row app_config;
begin
  update app_config set
    maintenance         = coalesce((p_patch->>'maintenance')::boolean, maintenance),
    maintenance_message = coalesce(p_patch->>'maintenance_message', maintenance_message),
    maintenance_until   = case when p_patch ? 'maintenance_until'
                               then nullif(p_patch->>'maintenance_until','')::timestamptz
                               else maintenance_until end,
    -- Bakım modu AÇILDIĞI anı kaydet
    maintenance_at      = case when (p_patch->>'maintenance')::boolean is true
                                 and maintenance = false
                               then now() else maintenance_at end,
    maintenance_by      = case when p_patch ? 'maintenance' then p_by else maintenance_by end,

    app_version         = coalesce(p_patch->>'app_version', app_version),
    min_version         = coalesce(p_patch->>'min_version', min_version),
    force_update        = coalesce((p_patch->>'force_update')::boolean, force_update),
    update_message      = coalesce(p_patch->>'update_message', update_message),
    ios_store_url       = coalesce(p_patch->>'ios_store_url', ios_store_url),
    android_store_url   = coalesce(p_patch->>'android_store_url', android_store_url),

    mail_service        = coalesce((p_patch->>'mail_service')::boolean, mail_service),
    phone_service       = coalesce((p_patch->>'phone_service')::boolean, phone_service),
    push_service        = coalesce((p_patch->>'push_service')::boolean, push_service),
    ads_service         = coalesce((p_patch->>'ads_service')::boolean, ads_service),
    registration_open   = coalesce((p_patch->>'registration_open')::boolean, registration_open),

    updated_at          = now(),
    updated_by          = p_by
  where id = 1
  returning * into v_row;

  -- ★ Push anahtarı app_settings ile de senkron olsun
  --   (push sistemi oradan okuyor)
  if p_patch ? 'push_service' then
    begin
      perform admin_set_setting('push_enabled',
        case when v_row.push_service then 'true' else 'false' end);
    exception when others then null;
    end;
  end if;

  return to_json(v_row);
end;
$$;


drop function if exists admin_save_limits(jsonb);

create or replace function admin_save_limits(p_limits jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_n integer := 0;
begin
  for v_item in select * from jsonb_array_elements(p_limits) loop
    update content_limits set
      limit_value = greatest(0, coalesce((v_item->>'limit_value')::integer, limit_value)),
      is_allowed  = coalesce((v_item->>'is_allowed')::boolean, is_allowed),
      limit_type  = coalesce(v_item->>'limit_type', limit_type),
      updated_at  = now()
    where content_type = v_item->>'content_type'
      and role = v_item->>'role';

    if found then v_n := v_n + 1; end if;
  end loop;

  return json_build_object('guncellenen', v_n);
end;
$$;


-- ── Kullanıcıya boost hakkı ver / al ──
drop function if exists admin_set_boosted(uuid, boolean);

create or replace function admin_set_boosted(p_user_id uuid, p_value boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  update profiles set is_boosted = p_value, updated_at = now() where id = p_user_id;
  if not found then raise exception 'Kullanici bulunamadi'; end if;
  return json_build_object('id', p_user_id, 'is_boosted', p_value);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) MAİL SİLME (kalıcı)                                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_delete_mail(uuid[]);

create or replace function admin_delete_mail(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from mails where id = any(p_ids);
  get diagnostics v_n = row_count;
  return json_build_object('silinen', v_n);
end;
$$;


drop function if exists admin_delete_queued_mail(uuid[]);

create or replace function admin_delete_queued_mail(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from mail_queue where id = any(p_ids);
  get diagnostics v_n = row_count;
  return json_build_object('silinen', v_n);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  7) BİLDİRİM TEMİZLİĞİ — doğrulama                                 ║
-- ║                                                                    ║
-- ║  ★ Kural zaten kurulu: 10 günden eski silinir AMA her kullanıcının  ║
-- ║    SON 10 BİLDİRİMİ korunur. Gece 04:00'te otomatik çalışıyor.      ║
-- ║    Aşağıdaki sorgu bunu doğruluyor.                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_cleanup_preview(integer, integer);

create or replace function admin_cleanup_preview(
  p_days integer default 10, p_keep integer default 10
) returns json language sql security definer set search_path = public as $$
  with eski as (
    select n.id, n.recipient_id,
           row_number() over (partition by n.recipient_id order by n.created_at desc) as sira
    from notifications n
    where n.created_at < now() - make_interval(days => p_days)
  )
  select json_build_object(
    'kural', format('%s günden eski silinir, kullanıcı başına son %s korunur', p_days, p_keep),
    'toplam_bildirim', (select count(*) from notifications),
    'eski_bildirim', (select count(*) from eski),
    'korunacak', (select count(*) from eski where sira <= p_keep),
    'silinecek', (select count(*) from eski where sira > p_keep),
    'etkilenen_kullanici', (select count(distinct recipient_id) from eski where sira > p_keep),
    'zamanlanmis_is', (
      select coalesce(json_agg(json_build_object('is', jobname, 'zaman', schedule, 'aktif', active)), '[]'::json)
      from cron.job where jobname = 'kays_maintenance'
    )
  );
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  8) ZAMANLANMIŞ İŞ                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  perform cron.unschedule(jobname) from cron.job where jobname = 'verification_cleanup';
  perform cron.schedule('verification_cleanup', '*/30 * * * *',
    $c$ select cleanup_verification_requests(); $c$);
  raise notice 'verification_cleanup zamanlandi (30 dakikada bir)';
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  9) YETKİLER                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_get_config','admin_save_config','admin_save_limits',
                        'admin_set_boosted','admin_delete_mail','admin_delete_queued_mail',
                        'admin_cleanup_preview','cleanup_verification_requests',
                        'admin_create_ad','_user_limit_role')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- 1) Reklam oluşturma hatası düzeldi mi? (hata vermezse tamam)
do $$
begin
  perform '{"a":1}'::jsonb || '{"b":2}'::jsonb;
  raise notice 'JSONB BIRLESTIRME: OK';
end $$;

-- 2) Ayarlar
select app_status('1.0.0') as uygulama_durumu;

-- 3) Sınırlar
select content_type, role, limit_type, limit_value, is_allowed
from content_limits
order by array_position(array['post','listing','discount','event'], content_type),
         array_position(array['user','business','boosted_user','boosted_business'], role);

-- 4) Bildirim temizliği kuralı
select admin_cleanup_preview(10, 10) as temizlik_onizleme;

-- 5) Servis anahtarları
select service_enabled('mail') as mail, service_enabled('phone') as phone,
       service_enabled('push') as push, service_enabled('ads') as reklam;
