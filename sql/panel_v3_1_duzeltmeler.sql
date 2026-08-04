-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V3.1 — DÜZELTMELER VE EKLER
--
-- ┌─ BU DOSYA NE YAPIYOR ─────────────────────────────────────────────┐
-- │ 1. bans.banned_by TİP HATASI — uuid → text                        │
-- │    Hata: "column banned_by is of type uuid but expression is of    │
-- │    type text". Panel admini bir auth kullanıcısı DEĞİL, sadece bir │
-- │    kullanıcı adı ("admin"). uuid'ye yazılamaz.                     │
-- │ 2. IP BANI — devices.ip + bans.ip + admin_ban_ip()                │
-- │ 3. KULLANICI İÇERİĞİ — gönderi/ilan/indirim/etkinlik listeleme,    │
-- │    detay, düzenleme, silme (şema-bağımsız, dinamik)               │
-- │ 4. is_active KULLANILMIYOR — filtrelerden ve sayımlardan çıkarıldı │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v3_veritabani.sql ve panel_v3_gonderim.sql'den SONRA çalıştır.
-- ★ İdempotent, tek seferde çalıştırılır.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) bans.banned_by → text                                          ║
-- ║                                                                    ║
-- ║  Kolon uuid'ydi ve muhtemelen profiles(id)'e FK'lıydı. Panel admini ║
-- ║  veritabanında bir satır değil; "kim banladı" bilgisi serbest metin ║
-- ║  olmalı. Mevcut uuid değerleri metne çevrilirken kaybolmuyor.       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare
  v_type text;
  v_con  text;
begin
  select data_type into v_type
  from information_schema.columns
  where table_schema = 'public' and table_name = 'bans' and column_name = 'banned_by';

  if v_type is null then
    alter table bans add column banned_by text;
    raise notice 'bans.banned_by eklendi (text)';
    return;
  end if;

  if v_type = 'uuid' then
    -- Varsa FK'yı düşür (uuid olmayan değer yazılabilsin)
    for v_con in
      select tc.constraint_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
      where tc.table_schema = 'public' and tc.table_name = 'bans'
        and tc.constraint_type = 'FOREIGN KEY' and kcu.column_name = 'banned_by'
    loop
      execute format('alter table bans drop constraint %I', v_con);
      raise notice 'FK düşürüldü: %', v_con;
    end loop;

    alter table bans alter column banned_by type text using banned_by::text;
    raise notice 'bans.banned_by uuid -> text';
  else
    raise notice 'bans.banned_by zaten % — dokunulmadı', v_type;
  end if;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) IP BANI                                                        ║
-- ║                                                                    ║
-- ║  devices.ip  → mobil uygulama her girişte son IP'yi yazar          ║
-- ║  bans.ip     → IP banı kaydı                                       ║
-- ║                                                                    ║
-- ║  ★ IP banı tek başına zayıf bir önlemdir: mobil operatör IP'leri    ║
-- ║    paylaşımlıdır (CGNAT), aynı IP'yi binlerce abone kullanabilir.   ║
-- ║    Bu yüzden fonksiyon banlamadan ÖNCE o IP'yi kaç farklı kullanıcı ║
-- ║    kullanmış diye sayıyor ve paneli uyarıyor.                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

alter table devices add column if not exists ip text;
alter table devices add column if not exists ip_updated_at timestamptz;
alter table bans    add column if not exists ip text;

create index if not exists idx_devices_ip on devices (ip) where ip is not null;
create index if not exists idx_bans_ip     on bans (ip)    where ip is not null;

-- ── Mobil uygulamanın çağıracağı kayıt fonksiyonu ──
--    Cihaz kaydında IP'yi güncelle. Kullanıcı kendi cihazını
--    güncelleyebilir (authenticated), başkasının satırına dokunamaz.
drop function if exists set_my_device_ip(text, text);

create or replace function set_my_device_ip(p_device_id text, p_ip text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli';
  end if;

  update devices
  set ip = nullif(trim(p_ip), ''), ip_updated_at = now()
  where device_id = p_device_id and user_id = auth.uid();
end;
$$;

revoke all on function set_my_device_ip(text, text) from public, anon;
grant execute on function set_my_device_ip(text, text) to authenticated, service_role;


-- ── IP banla ──
drop function if exists admin_ban_ip(text, text, text, timestamptz, text);

create or replace function admin_ban_ip(
  p_ip text,
  p_reason text,
  p_notes text default null,
  p_until timestamptz default null,
  p_banned_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_ban_id uuid;
  v_users  bigint;
  v_devices bigint;
begin
  if p_ip is null or trim(p_ip) = '' then
    raise exception 'IP bos olamaz';
  end if;

  select count(distinct user_id), count(*)
    into v_users, v_devices
  from devices where ip = trim(p_ip);

  -- Aynı IP için aktif ban varsa tekrar açmıyoruz, güncelliyoruz
  select id into v_ban_id
  from bans
  where ip = trim(p_ip) and device_id is null and user_id is null
    and coalesce(is_active, true)
  limit 1;

  if v_ban_id is not null then
    update bans
    set reason = p_reason, notes = p_notes, until_at = p_until,
        banned_by = p_banned_by, created_at = now()
    where id = v_ban_id;
  else
    insert into bans (ip, reason, type, notes, until_at, is_active, banned_by)
    values (trim(p_ip), p_reason, 'ip', p_notes, p_until, true, p_banned_by)
    returning id into v_ban_id;
  end if;

  return json_build_object(
    'ban_id', v_ban_id,
    'ip', trim(p_ip),
    'kullanici', coalesce(v_users, 0),
    'cihaz', coalesce(v_devices, 0)
  );
end;
$$;


-- ── IP listesi (ban için arama) ──
drop function if exists admin_list_ips(text, text, integer);

create or replace function admin_list_ips(
  p_query text default null,
  -- all | banned | unbanned | shared (birden fazla kullanıcı)
  p_filter text default 'all',
  p_limit integer default 100
) returns table (
  ip text,
  kullanici bigint,
  cihaz bigint,
  son_gorulme timestamptz,
  is_banned boolean,
  ornek_kullanici text
)
language sql security definer set search_path = public as $$
  with grup as (
    select
      d.ip,
      count(distinct d.user_id) as kullanici,
      count(*)                  as cihaz,
      max(d.ip_updated_at)      as son_gorulme,
      (array_agg(p.username::text order by d.ip_updated_at desc nulls last))[1] as ornek
    from devices d
    left join profiles p on p.id = d.user_id
    where d.ip is not null and d.ip <> ''
    group by d.ip
  )
  select
    g.ip, g.kullanici, g.cihaz, g.son_gorulme,
    exists (select 1 from bans b where b.ip = g.ip and coalesce(b.is_active, true)) as is_banned,
    g.ornek
  from grup g
  where (p_query is null or trim(p_query) = '' or g.ip ilike '%' || p_query || '%')
    and case coalesce(p_filter, 'all')
      when 'all'      then true
      when 'banned'   then exists (select 1 from bans b where b.ip = g.ip and coalesce(b.is_active,true))
      when 'unbanned' then not exists (select 1 from bans b where b.ip = g.ip and coalesce(b.is_active,true))
      when 'shared'   then g.kullanici > 1
      else true
    end
  order by g.kullanici desc, g.son_gorulme desc nulls last
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;


-- ── Ban listesi: IP banlarını da kapsayan sürüm ──
drop function if exists admin_list_bans(text, integer);

create or replace function admin_list_bans(
  -- all | user | device | ip | expired | inactive
  p_scope text default 'all',
  p_limit integer default 100
) returns table (
  id uuid, user_id uuid, username text, name text, avatar_url text, email text,
  device_id text, platform text, model text, ip text,
  reason text, type text, notes text,
  until_at timestamptz, is_active boolean, created_at timestamptz, banned_by text,
  device_user_count bigint,
  ip_user_count bigint,
  suresi_gecti boolean
)
language sql security definer set search_path = public as $$
  select
    b.id, b.user_id, p.username::text, p.name::text, p.avatar_url, p.email,
    b.device_id, b.platform,
    (select d.model from devices d where d.device_id = b.device_id
       order by d.last_login_at desc nulls last limit 1) as model,
    b.ip,
    b.reason, b.type, b.notes, b.until_at, b.is_active, b.created_at, b.banned_by::text,
    (select count(distinct d2.user_id) from devices d2
       where d2.device_id = b.device_id and d2.user_id is not null) as device_user_count,
    (select count(distinct d3.user_id) from devices d3
       where b.ip is not null and d3.ip = b.ip and d3.user_id is not null) as ip_user_count,
    (b.until_at is not null and b.until_at < now()) as suresi_gecti
  from bans b
  left join profiles p on p.id = b.user_id
  where case coalesce(p_scope, 'all')
    when 'all'      then coalesce(b.is_active, true)
    when 'user'     then coalesce(b.is_active, true) and b.user_id is not null and b.device_id is null and b.ip is null
    when 'device'   then coalesce(b.is_active, true) and b.device_id is not null
    when 'ip'       then coalesce(b.is_active, true) and b.ip is not null and b.device_id is null
    when 'expired'  then b.until_at is not null and b.until_at < now() and coalesce(b.is_active, true)
    when 'inactive' then coalesce(b.is_active, true) = false
    else true
  end
  order by b.created_at desc
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;


-- ── Cihaz listesi: IP kolonu eklendi ──
drop function if exists admin_list_devices(text, text, integer);

create or replace function admin_list_devices(
  p_query text default null,
  -- all | banned | unbanned | orphan
  p_filter text default 'all',
  p_limit integer default 100
) returns table (
  device_id text, user_id uuid, username text, avatar_url text,
  platform text, model text, ip text,
  push_enabled boolean, has_push_token boolean,
  last_login_at timestamptz, created_at timestamptz,
  is_banned boolean, ip_banned boolean, user_count bigint
)
language sql security definer set search_path = public as $$
  select
    d.device_id, d.user_id, p.username::text, p.avatar_url,
    d.platform, d.model, d.ip, d.push_enabled,
    (d.push_token is not null and d.push_token <> '') as has_push_token,
    d.last_login_at, d.created_at,
    exists (select 1 from bans b where b.device_id = d.device_id and coalesce(b.is_active, true)) as is_banned,
    exists (select 1 from bans b2 where d.ip is not null and b2.ip = d.ip and coalesce(b2.is_active, true)) as ip_banned,
    (select count(distinct d2.user_id) from devices d2
       where d2.device_id = d.device_id and d2.user_id is not null) as user_count
  from devices d
  left join profiles p on p.id = d.user_id
  where
    (p_query is null or trim(p_query) = ''
      or d.device_id ilike '%' || p_query || '%'
      or d.model     ilike '%' || p_query || '%'
      or d.ip        ilike '%' || p_query || '%'
      or p.username  ilike '%' || p_query || '%')
    and case coalesce(p_filter, 'all')
      when 'all'      then true
      when 'banned'   then exists (select 1 from bans b where b.device_id = d.device_id and coalesce(b.is_active,true))
      when 'unbanned' then not exists (select 1 from bans b where b.device_id = d.device_id and coalesce(b.is_active,true))
      when 'orphan'   then d.user_id is null
      else true
    end
  order by d.last_login_at desc nulls last
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;


-- ── Hesap banı: banned_by artık text, istenirse IP de banlanır ──
drop function if exists admin_ban_user_full(uuid, text, text, text, timestamptz, boolean, text);
drop function if exists admin_ban_user_full(uuid, text, text, text, timestamptz, boolean, boolean, text);

create or replace function admin_ban_user_full(
  p_user_id uuid,
  p_reason text,
  p_type text default 'manual',
  p_notes text default null,
  p_until timestamptz default null,
  p_ban_devices boolean default true,
  -- ★ Cihazların son bilinen IP'lerini de banla
  p_ban_ips boolean default false,
  p_banned_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_username text;
  v_user_ban_id uuid;
  v_device_bans int := 0;
  v_ip_bans int := 0;
  d record;
begin
  select username into v_username from profiles where id = p_user_id;
  if v_username is null and not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Kullanici bulunamadi: %', p_user_id;
  end if;

  insert into bans (user_id, reason, type, notes, until_at, is_active, banned_by)
  values (p_user_id, p_reason, coalesce(p_type, 'manual'), p_notes, p_until, true, p_banned_by)
  returning id into v_user_ban_id;

  update profiles set is_banned = true, updated_at = now() where id = p_user_id;

  if p_ban_devices then
    for d in
      select distinct device_id, platform, ip from devices where user_id = p_user_id
    loop
      if d.device_id is not null and not exists (
        select 1 from bans b where b.device_id = d.device_id and coalesce(b.is_active, true)
      ) then
        insert into bans (user_id, device_id, platform, reason, type, notes, until_at, is_active, banned_by)
        values (p_user_id, d.device_id, d.platform,
                p_reason, 'device', p_notes, p_until, true, p_banned_by);
        v_device_bans := v_device_bans + 1;
      end if;

      if p_ban_ips and d.ip is not null and d.ip <> '' and not exists (
        select 1 from bans b where b.ip = d.ip and coalesce(b.is_active, true)
      ) then
        insert into bans (ip, reason, type, notes, until_at, is_active, banned_by)
        values (d.ip, p_reason, 'ip', p_notes, p_until, true, p_banned_by);
        v_ip_bans := v_ip_bans + 1;
      end if;
    end loop;
  end if;

  return json_build_object(
    'ban_id', v_user_ban_id,
    'username', v_username,
    'cihaz_bani', v_device_bans,
    'ip_bani', v_ip_bans
  );
end;
$$;


-- ── Cihaz banı: banned_by text ──
drop function if exists admin_ban_device(text, text, text, timestamptz, text);

create or replace function admin_ban_device(
  p_device_id text,
  p_reason text,
  p_notes text default null,
  p_until timestamptz default null,
  p_banned_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_ban_id uuid;
  v_platform text;
  v_users bigint;
  v_ip text;
begin
  if p_device_id is null or trim(p_device_id) = '' then
    raise exception 'device_id bos olamaz';
  end if;

  select platform, ip into v_platform, v_ip
  from devices where device_id = p_device_id
  order by last_login_at desc nulls last limit 1;

  select count(distinct user_id) into v_users
  from devices where device_id = p_device_id and user_id is not null;

  select id into v_ban_id
  from bans where device_id = p_device_id and coalesce(is_active, true) limit 1;

  if v_ban_id is not null then
    update bans
    set reason = p_reason, notes = p_notes, until_at = p_until,
        banned_by = p_banned_by, created_at = now()
    where id = v_ban_id;
  else
    insert into bans (device_id, platform, reason, type, notes, until_at, is_active, banned_by)
    values (p_device_id, v_platform, p_reason, 'device', p_notes, p_until, true, p_banned_by)
    returning id into v_ban_id;
  end if;

  return json_build_object(
    'ban_id', v_ban_id,
    'device_id', p_device_id,
    'kullanici', coalesce(v_users, 0),
    'ip', v_ip
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) is_active KULLANILMIYOR                                        ║
-- ║                                                                    ║
-- ║  profiles.is_active alanı uygulamada kullanılmıyor. Filtrelerde ve  ║
-- ║  sayımlarda ona bakmak yanlış sonuç veriyordu (null olan hesaplar   ║
-- ║  "pasif" görünüyordu). Artık tek ölçüt BAN.                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_user_counts();

create or replace function admin_user_counts()
returns json language sql security definer set search_path = public as $$
  with base as (
    select
      u.id,
      (p.id is not null) as has_profile,
      p.role::text, p.is_banned, p.ogrenci,
      p.ogrenci_durum, p.business_durum, p.username,
      p.email as pe, p.phone::text as pp,
      u.email::text as ae, u.phone::text as ap,
      (select count(*) from bans b where b.user_id = u.id and coalesce(b.is_active,true)) as bans
    from auth.users u
    left join profiles p on p.id = u.id
  )
  select json_build_object(
    'toplam',           (select count(*) from base),
    -- ★ "aktif" = banlı olmayan. is_active'e bakılmıyor.
    'aktif',            (select count(*) from base where not coalesce(is_banned,false) and bans = 0),
    'banli',            (select count(*) from base where coalesce(is_banned,false) or bans > 0),
    'isletme',          (select count(*) from base where role = 'business'),
    'ogrenci',          (select count(*) from base where coalesce(ogrenci,false)),
    'bekleyen_isletme', (select count(*) from base where business_durum = 'pending'),
    'bekleyen_ogrenci', (select count(*) from base where ogrenci_durum = 'pending'),
    'profilsiz',        (select count(*) from base where has_profile = false),
    'tutarsiz',         (select count(*) from base where
                           has_profile = false
                           or (ae is not null and pe is not null and lower(ae) <> lower(pe))
                           or (ap is not null and pp is not null and ap <> pp)
                           or (has_profile and (username is null or trim(username) = ''))
                           or (coalesce(is_banned,false) and bans = 0)
                           or (not coalesce(is_banned,false) and bans > 0)),
    'son_7_gun',        (select count(*) from auth.users where created_at > now() - interval '7 days'),
    'son_30_gun',       (select count(*) from auth.users where created_at > now() - interval '30 days')
  );
$$;


-- ── Kullanıcı listesinde 'active' filtresi de ban bazlı ──
drop function if exists admin_list_users(text, text, integer, integer);

create or replace function admin_list_users(
  p_query text default null,
  -- all | active | banned | business | student | pending_business |
  -- pending_student | no_profile | mismatch
  p_filter text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  auth_id uuid, email text, phone text,
  email_confirmed boolean, phone_confirmed boolean,
  last_sign_in timestamptz, auth_created timestamptz,
  has_profile boolean, username text, name text, avatar_url text,
  role text, sehir text,
  is_active boolean, is_banned boolean, verify boolean,
  ogrenci boolean, ogrenci_durum text, business_durum text, gizli boolean,
  follower_count integer, post_count integer, profile_created timestamptz,
  device_count bigint, push_device_count bigint, active_ban_count bigint,
  has_mismatch boolean
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with base as (
    select
      u.id as auth_id,
      u.email::text as email, u.phone::text as phone,
      (u.email_confirmed_at is not null) as email_confirmed,
      (u.phone_confirmed_at is not null) as phone_confirmed,
      u.last_sign_in_at as last_sign_in, u.created_at as auth_created,
      (p.id is not null) as has_profile,
      p.username::text, p.name::text, p.avatar_url,
      p.role::text, p.sehir,
      p.is_active, p.is_banned, p.verify,
      p.ogrenci, p.ogrenci_durum, p.business_durum, p.gizli,
      p.follower_count, p.post_count,
      p.created_at as profile_created,
      p.email as profile_email, p.phone::text as profile_phone,
      (select count(*) from devices d where d.user_id = u.id) as device_count,
      (select count(*) from devices d where d.user_id = u.id
         and d.push_token is not null and d.push_token <> '') as push_device_count,
      (select count(*) from bans b where b.user_id = u.id
         and coalesce(b.is_active, true)) as active_ban_count
    from auth.users u
    left join profiles p on p.id = u.id
  ),
  flagged as (
    select b.*,
      (
        b.has_profile = false
        or (b.email is not null and b.profile_email is not null
            and lower(b.email) <> lower(b.profile_email))
        or (b.phone is not null and b.profile_phone is not null
            and b.phone <> b.profile_phone)
        or (b.has_profile and (b.username is null or trim(b.username) = ''))
        or (coalesce(b.is_banned,false) = true and b.active_ban_count = 0)
        or (coalesce(b.is_banned,false) = false and b.active_ban_count > 0)
      ) as has_mismatch
    from base b
  )
  select
    f.auth_id, f.email, f.phone, f.email_confirmed, f.phone_confirmed,
    f.last_sign_in, f.auth_created,
    f.has_profile, f.username, f.name, f.avatar_url, f.role, f.sehir,
    f.is_active, f.is_banned, f.verify,
    f.ogrenci, f.ogrenci_durum, f.business_durum, f.gizli,
    f.follower_count, f.post_count, f.profile_created,
    f.device_count, f.push_device_count, f.active_ban_count,
    f.has_mismatch
  from flagged f
  where
    (
      p_query is null or trim(p_query) = ''
      or f.username ilike '%' || p_query || '%'
      or f.name     ilike '%' || p_query || '%'
      or f.email    ilike '%' || p_query || '%'
      or f.phone    ilike '%' || p_query || '%'
      or f.auth_id::text = p_query
    )
    and case coalesce(p_filter, 'all')
      -- ★ is_active'e BAKILMIYOR — tek ölçüt ban
      when 'all'              then true
      when 'active'           then not coalesce(f.is_banned, false) and f.active_ban_count = 0
      when 'banned'           then coalesce(f.is_banned, false) or f.active_ban_count > 0
      when 'business'         then f.role = 'business'
      when 'student'          then coalesce(f.ogrenci, false)
      when 'pending_business' then f.business_durum = 'pending'
      when 'pending_student'  then f.ogrenci_durum = 'pending'
      when 'no_profile'       then f.has_profile = false
      when 'mismatch'         then f.has_mismatch
      else true
    end
  order by f.auth_created desc
  limit greatest(1, least(200, coalesce(p_limit, 50)))
  offset greatest(0, coalesce(p_offset, 0));
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) KULLANICI İÇERİĞİ — gönderi / ilan / indirim / etkinlik        ║
-- ║                                                                    ║
-- ║  ★ ŞEMA-BAĞIMSIZ TASARIM: bu tabloların sahip kolonu projelerde     ║
-- ║    farklı adlanır (user_id, author_id, owner_id, kullanici_id…).    ║
-- ║    Fonksiyon information_schema'ya bakıp doğru kolonu KENDİSİ bulur.║
-- ║    Böylece kolon adı değişse bile panel çalışmaya devam eder.       ║
-- ║                                                                    ║
-- ║  Satırlar to_jsonb ile HAM döner — panel hangi alan varsa onu       ║
-- ║  gösterir. Yeni bir kolon eklediğinde SQL'e dokunmana gerek yok.    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Hangi tablo hangi anahtarla eşleşiyor
drop function if exists _admin_content_table(text);

create or replace function _admin_content_table(p_kind text)
returns text language sql immutable as $$
  select case p_kind
    when 'post'     then 'posts'
    when 'listing'  then 'listings'
    when 'discount' then 'indirimler'
    when 'event'    then 'etkinlikler'
    else null
  end;
$$;

-- Sahip kolonunu bul (ilk bulunan kazanır)
drop function if exists _admin_owner_column(text);

create or replace function _admin_owner_column(p_table text)
returns text language sql stable set search_path = public as $$
  select c.column_name
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = p_table
    and c.column_name in ('user_id','author_id','owner_id','profile_id',
                          'kullanici_id','created_by','sahip_id','isletme_id')
  order by array_position(
    array['user_id','author_id','owner_id','profile_id',
          'kullanici_id','created_by','sahip_id','isletme_id'],
    c.column_name)
  limit 1;
$$;

-- Sıralama kolonunu bul
drop function if exists _admin_date_column(text);

create or replace function _admin_date_column(p_table text)
returns text language sql stable set search_path = public as $$
  select coalesce(
    (select c.column_name from information_schema.columns c
      where c.table_schema='public' and c.table_name=p_table
        and c.column_name in ('created_at','olusturma_tarihi','tarih','inserted_at')
      order by array_position(array['created_at','olusturma_tarihi','tarih','inserted_at'], c.column_name)
      limit 1),
    'id'
  );
$$;


-- ── Kullanıcının içerik SAYILARI (sekme başlıkları için) ──
drop function if exists admin_user_content_counts(uuid);

create or replace function admin_user_content_counts(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_kind text;
  v_tbl text;
  v_col text;
  v_n bigint;
  v_out jsonb := '{}'::jsonb;
begin
  foreach v_kind in array array['post','listing','discount','event'] loop
    v_tbl := _admin_content_table(v_kind);

    -- Tablo yoksa (ör. projede indirimler kaldırılmışsa) sessizce atla
    if not exists (select 1 from information_schema.tables
                   where table_schema='public' and table_name=v_tbl) then
      v_out := v_out || jsonb_build_object(v_kind, null);
      continue;
    end if;

    v_col := _admin_owner_column(v_tbl);
    if v_col is null then
      v_out := v_out || jsonb_build_object(v_kind, null);
      continue;
    end if;

    execute format('select count(*) from %I where %I = $1', v_tbl, v_col)
      into v_n using p_user_id;

    v_out := v_out || jsonb_build_object(v_kind, v_n);
  end loop;

  return v_out::json;
end;
$$;


-- ── Kullanıcının içeriğini listele ──
drop function if exists admin_user_content(uuid, text, integer, integer);

create or replace function admin_user_content(
  p_user_id uuid,
  p_kind text,                       -- post | listing | discount | event
  p_limit integer default 20,
  p_offset integer default 0
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_tbl text := _admin_content_table(p_kind);
  v_owner text;
  v_date text;
  v_rows json;
begin
  if v_tbl is null then
    raise exception 'Gecersiz icerik tipi: %', p_kind;
  end if;

  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name=v_tbl) then
    return json_build_object('tablo', v_tbl, 'hata', 'tablo yok', 'satirlar', '[]'::json);
  end if;

  v_owner := _admin_owner_column(v_tbl);
  if v_owner is null then
    return json_build_object('tablo', v_tbl, 'hata',
      'sahip kolonu bulunamadi (user_id / author_id / owner_id ...)', 'satirlar', '[]'::json);
  end if;

  v_date := _admin_date_column(v_tbl);

  execute format(
    'select coalesce(json_agg(to_jsonb(t) order by t.%I desc), ''[]''::json)
       from (select * from %I where %I = $1 order by %I desc limit $2 offset $3) t',
    v_date, v_tbl, v_owner, v_date
  ) into v_rows using p_user_id,
                     greatest(1, least(100, coalesce(p_limit, 20))),
                     greatest(0, coalesce(p_offset, 0));

  return json_build_object(
    'tablo', v_tbl,
    'sahip_kolonu', v_owner,
    'tarih_kolonu', v_date,
    'satirlar', v_rows
  );
end;
$$;


-- ── Tek içerik kaydının tamamı ──
drop function if exists admin_content_detail(text, uuid);

create or replace function admin_content_detail(p_kind text, p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_tbl text := _admin_content_table(p_kind);
  v_row json;
begin
  if v_tbl is null then raise exception 'Gecersiz icerik tipi: %', p_kind; end if;

  execute format('select to_jsonb(t) from %I t where t.id = $1', v_tbl)
    into v_row using p_id;

  return v_row;
end;
$$;


-- ── İçerik DÜZENLE ──
--    ★ Sadece jsonb içinde gelen anahtarlar güncellenir ve her anahtar
--      information_schema'ya karşı doğrulanır. Böylece panelden
--      olmayan/korumalı bir kolona yazmak imkânsız.
drop function if exists admin_update_content(text, uuid, jsonb);

create or replace function admin_update_content(
  p_kind text,
  p_id uuid,
  p_patch jsonb
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_tbl text := _admin_content_table(p_kind);
  v_key text;
  v_type text;
  v_sets text[] := '{}';
  v_row json;
  -- Panelden ASLA değiştirilemeyecek kolonlar
  v_protected text[] := array['id','user_id','author_id','owner_id','profile_id',
                              'kullanici_id','created_by','created_at','isletme_id'];
begin
  if v_tbl is null then raise exception 'Gecersiz icerik tipi: %', p_kind; end if;
  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'Degisiklik yok';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key = any(v_protected) then
      raise exception 'Bu kolon panelden degistirilemez: %', v_key;
    end if;

    select c.data_type into v_type
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = v_tbl and c.column_name = v_key;

    if v_type is null then
      raise exception 'Kolon yok: %.%', v_tbl, v_key;
    end if;

    -- Tip dönüşümünü Postgres'e bırakıyoruz; hatalı değer gelirse
    -- update patlar ve panel hatayı gösterir (sessiz bozulma olmaz).
    v_sets := v_sets || format('%I = ($1->>%L)::%s', v_key, v_key, v_type);
  end loop;

  -- updated_at varsa tazele
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name=v_tbl and column_name='updated_at') then
    v_sets := v_sets || 'updated_at = now()';
  end if;

  execute format('update %I set %s where id = $2 returning to_jsonb(%I)',
                 v_tbl, array_to_string(v_sets, ', '), v_tbl)
    into v_row using p_patch, p_id;

  if v_row is null then
    raise exception 'Kayit bulunamadi: %', p_id;
  end if;

  return v_row;
end;
$$;


-- ── İçerik SİL ──
drop function if exists admin_delete_content(text, uuid);

create or replace function admin_delete_content(p_kind text, p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_tbl text := _admin_content_table(p_kind);
  v_n integer;
begin
  if v_tbl is null then raise exception 'Gecersiz icerik tipi: %', p_kind; end if;

  execute format('delete from %I where id = $1', v_tbl) using p_id;
  get diagnostics v_n = row_count;

  return json_build_object('silinen', v_n, 'tablo', v_tbl);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) ŞİKÂYETLER — panelde kart olarak göstermek için düz liste      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_user_reports(uuid, integer);

create or replace function admin_user_reports(p_user_id uuid, p_limit integer default 50)
returns table (
  id uuid,
  yon text,                       -- 'against' = hakkında, 'made' = yaptığı
  karsi_taraf_id uuid,
  karsi_taraf_username text,
  karsi_taraf_avatar text,
  reason text,
  description text,
  content_type text,
  content_id uuid,
  status text,
  admin_note text,
  created_at timestamptz
)
language sql security definer set search_path = public as $$
  select r.id, 'against'::text,
         r.reporter_id, rp.username::text, rp.avatar_url,
         r.reason, r.description, r.content_type::text, r.content_id,
         r.status::text, r.admin_note, r.created_at
  from reports r left join profiles rp on rp.id = r.reporter_id
  where r.reported_user_id = p_user_id
  union all
  select r.id, 'made'::text,
         r.reported_user_id, tp.username::text, tp.avatar_url,
         r.reason, r.description, r.content_type::text, r.content_id,
         r.status::text, r.admin_note, r.created_at
  from reports r left join profiles tp on tp.id = r.reported_user_id
  where r.reporter_id = p_user_id
  order by created_at desc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) YETKİLER — SADECE service_role                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin_%' or p.proname like '_admin_%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- 1) banned_by tipi text olmalı
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='bans' and column_name in ('banned_by','ip');

-- 2) IP kolonu devices'ta olmalı
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='devices' and column_name in ('ip','ip_updated_at');

-- 3) İçerik tablolarının sahip kolonları doğru bulunuyor mu?
select k.kind, _admin_content_table(k.kind) as tablo,
       _admin_owner_column(_admin_content_table(k.kind)) as sahip_kolonu,
       _admin_date_column(_admin_content_table(k.kind))  as tarih_kolonu
from (values ('post'),('listing'),('discount'),('event')) k(kind);

-- 4) Yeni fonksiyonlar yerinde mi?
select p.proname, has_function_privilege('service_role', p.oid, 'execute') as yetki
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in
  ('admin_ban_ip','admin_list_ips','admin_user_content','admin_user_content_counts',
   'admin_content_detail','admin_update_content','admin_delete_content','admin_user_reports')
order by 1;
