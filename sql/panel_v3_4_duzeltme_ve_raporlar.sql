-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V3.4 — HATA DÜZELTMELERİ + BAN YAPISI + ŞİKÂYET YÖNETİMİ
--
-- ┌─ 1) "malformed array literal" HATASININ SEBEBİ ───────────────────┐
-- │ PostgreSQL'de `text[] || 'metin'` yazınca sağdaki literal TİPSİZ.  │
-- │ Planlayıcı `array || array` aşırı yüklemesini seçip 'username'     │
-- │ metnini DİZİ olarak ayrıştırmaya çalışıyor → malformed array       │
-- │ literal. Çözüm: literali `::text` ile tiplemek.                    │
-- │                                                                    │
-- │ Etkilenen fonksiyonlar: admin_update_identity (username/name/sehir)│
-- │ ve admin_update_content ("updated_at = now()").                    │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ 2) BAN ARTIK TEK KAYIT ──────────────────────────────────────────┐
-- │ 7 cihazlı kullanıcıyı banlayınca 7 satır oluşuyordu. Artık bans    │
-- │ tablosuna `device_ids text[]` ve `ips text[]` eklendi: bir ban      │
-- │ işlemi = BİR SATIR, cihazlar ve IP'ler dizide.                     │
-- │ Eski `device_id`/`ip` kolonları korunuyor (geriye dönük uyumluluk;  │
-- │ dizinin ilk elemanı oraya da yazılıyor) — mobil tarafta bu kolona   │
-- │ bakan kod varsa bozulmuyor.                                        │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v3_3_gelismis.sql'den SONRA çalıştır. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) DİZİ HATASI DÜZELTMESİ — admin_update_identity                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function admin_update_identity(
  p_user_id uuid,
  p_patch jsonb
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_email text;
  v_phone text;
  v_username text;
  v_degisen text[] := '{}';
  v_p profiles;
begin
  if p_patch is null or p_patch = '{}'::jsonb then
    raise exception 'Degisiklik yok';
  end if;

  select * into v_p from profiles where id = p_user_id;

  /* ── E-POSTA ── */
  if p_patch ? 'email' then
    v_email := nullif(trim(p_patch->>'email'), '');

    if v_email is not null then
      if v_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' then
        raise exception 'Gecersiz e-posta adresi: %', v_email;
      end if;
      if exists (select 1 from auth.users where lower(email) = lower(v_email) and id <> p_user_id) then
        raise exception 'Bu e-posta baska bir hesapta kullaniliyor: %', v_email;
      end if;
    end if;

    update auth.users
    set email = v_email,
        email_confirmed_at = case
          when lower(coalesce(v_email,'')) = lower(coalesce(email,'')) then email_confirmed_at
          else null end,
        updated_at = now()
    where id = p_user_id;

    update profiles set email = v_email, updated_at = now() where id = p_user_id;

    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='profiles' and column_name='email_verified') then
      update profiles set email_verified = false where id = p_user_id;
    end if;

    -- ★ ::text ŞART — yoksa "malformed array literal" hatası
    v_degisen := v_degisen || 'email'::text;
  end if;

  /* ── TELEFON ── */
  if p_patch ? 'phone' then
    v_phone := nullif(regexp_replace(coalesce(p_patch->>'phone',''), '[^0-9+]', '', 'g'), '');

    if v_phone is not null then
      if v_phone !~ '^\+90[0-9]{10}$' then
        raise exception 'Telefon +90 ve 10 hane olmali (ornek: +905551234567). Gelen: %', v_phone;
      end if;
      if exists (select 1 from auth.users where phone = v_phone and id <> p_user_id) then
        raise exception 'Bu telefon baska bir hesapta kullaniliyor: %', v_phone;
      end if;
    end if;

    update auth.users
    set phone = v_phone,
        phone_confirmed_at = case
          when coalesce(v_phone,'') = coalesce(phone,'') then phone_confirmed_at
          else null end,
        updated_at = now()
    where id = p_user_id;

    update profiles set phone = v_phone, updated_at = now() where id = p_user_id;

    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='profiles' and column_name='phone_verify') then
      update profiles set phone_verify = false where id = p_user_id;
    end if;

    v_degisen := v_degisen || 'phone'::text;
  end if;

  /* ── KULLANICI ADI ── */
  if p_patch ? 'username' then
    v_username := nullif(trim(p_patch->>'username'), '');
    if v_username is null then raise exception 'Kullanici adi bos olamaz'; end if;
    if v_username !~ '^[A-Za-z0-9._]{3,30}$' then
      raise exception 'Kullanici adi 3-30 karakter olmali; harf, rakam, nokta ve alt cizgi kullanilabilir';
    end if;
    if exists (select 1 from profiles where lower(username) = lower(v_username) and id <> p_user_id) then
      raise exception 'Bu kullanici adi alinmis: %', v_username;
    end if;

    update profiles set username = v_username, updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'username'::text;
  end if;

  /* ── DİĞER ALANLAR ── */
  if p_patch ? 'name' then
    update profiles set name = nullif(trim(p_patch->>'name'), ''), updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'name'::text;
  end if;

  if p_patch ? 'sehir' then
    update profiles set sehir = nullif(trim(p_patch->>'sehir'), ''), updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'sehir'::text;
  end if;

  if p_patch ? 'bio' and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='bio') then
    update profiles set bio = nullif(trim(p_patch->>'bio'), ''), updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'bio'::text;
  end if;

  if p_patch ? 'website' and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='website') then
    update profiles set website = nullif(trim(p_patch->>'website'), ''), updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'website'::text;
  end if;

  if p_patch ? 'business_name' and exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='profiles' and column_name='business_name') then
    update profiles set business_name = nullif(trim(p_patch->>'business_name'), ''), updated_at = now()
    where id = p_user_id;
    v_degisen := v_degisen || 'business_name'::text;
  end if;

  if p_patch ? 'gizli' then
    update profiles set gizli = (p_patch->>'gizli')::boolean, updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'gizli'::text;
  end if;

  if p_patch ? 'verify' then
    update profiles set verify = (p_patch->>'verify')::boolean, updated_at = now() where id = p_user_id;
    v_degisen := v_degisen || 'verify'::text;
  end if;

  return json_build_object('degisen', v_degisen, 'adet', coalesce(array_length(v_degisen, 1), 0));
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) DİZİ HATASI DÜZELTMESİ — admin_update_content                  ║
-- ║     ("malformed array literal: updated_at = now()")                ║
-- ╚═══════════════════════════════════════════════════════════════════╝

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

    -- ★ format(...)::text — tipsiz metin dizi sanılıyordu
    v_sets := v_sets || format('%I = ($1->>%L)::%s', v_key, v_key, v_type)::text;
  end loop;

  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name=v_tbl and column_name='updated_at') then
    -- ★ ASIL HATA BURADAYDI
    v_sets := v_sets || 'updated_at = now()'::text;
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


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) BAN: TEK KAYIT (device_ids / ips dizileri)                     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

alter table bans add column if not exists device_ids text[];
alter table bans add column if not exists ips text[];

create index if not exists idx_bans_device_ids on bans using gin (device_ids);
create index if not exists idx_bans_ips on bans using gin (ips);

-- Eski tek-kolonlu kayıtları diziye taşı (bir kez çalışır)
update bans
set device_ids = array[device_id]
where device_id is not null and device_ids is null;

update bans
set ips = array[ip]
where ip is not null and ips is null;

-- ── Bir cihaz banlı mı? (dizi + eski kolon birlikte) ──
drop function if exists is_device_banned(text);

create or replace function is_device_banned(p_device_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bans b
    where coalesce(b.is_active, true)
      and (b.until_at is null or b.until_at > now())
      and (
        b.device_id = p_device_id
        or (b.device_ids is not null and p_device_id = any(b.device_ids))
      )
  );
$$;

drop function if exists is_ip_banned(text);

create or replace function is_ip_banned(p_ip text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from bans b
    where coalesce(b.is_active, true)
      and (b.until_at is null or b.until_at > now())
      and (
        b.ip = p_ip
        or (b.ips is not null and p_ip = any(b.ips))
      )
  );
$$;

-- Mobil tarafın çağırabileceği tek kapı: bu cihaz/IP girebilir mi?
drop function if exists check_access(text, text);

create or replace function check_access(p_device_id text default null, p_ip text default null)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'device_banned', coalesce(is_device_banned(p_device_id), false),
    'ip_banned',     coalesce(is_ip_banned(p_ip), false),
    'user_banned',   coalesce((select is_banned from profiles where id = auth.uid()), false)
  );
$$;

revoke all on function check_access(text, text) from public, anon;
grant execute on function check_access(text, text) to anon, authenticated, service_role;


-- ── ELLE BAN: her çağrı TEK satır ──
drop function if exists admin_create_ban(uuid, text, text, text, text, timestamptz, text);
drop function if exists admin_create_ban(uuid, text[], text[], text, text, timestamptz, text);

create or replace function admin_create_ban(
  p_user_id uuid default null,
  p_device_ids text[] default null,
  p_ips text[] default null,
  p_reason text default null,
  p_notes text default null,
  p_until timestamptz default null,
  p_banned_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_devs text[] := (select array_agg(distinct d) from unnest(coalesce(p_device_ids, '{}')) d
                    where nullif(trim(d), '') is not null);
  v_ips  text[] := (select array_agg(distinct i) from unnest(coalesce(p_ips, '{}')) i
                    where nullif(trim(i), '') is not null);
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_tip text;
  v_cihaz_hesap bigint := 0;
  v_ip_hesap bigint := 0;
begin
  if v_reason is null then raise exception 'Ban sebebi zorunlu'; end if;

  if p_user_id is null
     and coalesce(array_length(v_devs, 1), 0) = 0
     and coalesce(array_length(v_ips, 1), 0) = 0 then
    raise exception 'En az bir hedef gerekli: kullanici, cihaz ya da IP';
  end if;

  if p_user_id is not null then
    if not exists (select 1 from auth.users where id = p_user_id)
       and not exists (select 1 from profiles where id = p_user_id) then
      raise exception 'Kullanici bulunamadi: %', p_user_id;
    end if;
  end if;

  v_tip := case
    when p_user_id is not null then 'manual'
    when coalesce(array_length(v_devs,1),0) > 0 then 'device'
    else 'ip'
  end;

  -- ★ TEK SATIR: cihazlar ve IP'ler dizide.
  --   device_id / ip kolonlarına dizinin ilk elemanı yazılıyor —
  --   bu kolonlara bakan eski kod (mobil, tetikleyici) bozulmasın.
  insert into bans (
    user_id, device_id, device_ids, ip, ips, platform,
    reason, type, notes, until_at, is_active, banned_by
  ) values (
    p_user_id,
    v_devs[1], nullif(v_devs, '{}'),
    v_ips[1],  nullif(v_ips, '{}'),
    (select platform from devices where device_id = v_devs[1]
       order by last_login_at desc nulls last limit 1),
    v_reason, v_tip, p_notes, p_until, true, p_banned_by
  )
  returning id into v_id;

  if p_user_id is not null then
    update profiles set is_banned = true, updated_at = now() where id = p_user_id;
  end if;

  if coalesce(array_length(v_devs,1),0) > 0 then
    select count(distinct user_id) into v_cihaz_hesap
    from devices where device_id = any(v_devs) and user_id is not null;
  end if;

  if coalesce(array_length(v_ips,1),0) > 0 then
    select count(distinct user_id) into v_ip_hesap
    from devices where ip = any(v_ips) and user_id is not null;
  end if;

  return json_build_object(
    'ban_id', v_id,
    'tip', v_tip,
    'kullanici', p_user_id,
    'cihaz_adet', coalesce(array_length(v_devs,1),0),
    'ip_adet', coalesce(array_length(v_ips,1),0),
    'cihazi_kullanan_hesap', v_cihaz_hesap,
    'ipyi_kullanan_hesap', v_ip_hesap
  );
end;
$$;


-- ── HESAP BANI: tek satır, cihaz/IP dizileriyle ──
drop function if exists admin_ban_user_full(uuid, text, text, text, timestamptz, boolean, boolean, text);

create or replace function admin_ban_user_full(
  p_user_id uuid,
  p_reason text,
  p_type text default 'manual',
  p_notes text default null,
  p_until timestamptz default null,
  p_ban_devices boolean default true,
  p_ban_ips boolean default false,
  p_banned_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_username text;
  v_devs text[] := '{}';
  v_ips text[] := '{}';
  v_res json;
begin
  select username into v_username from profiles where id = p_user_id;
  if v_username is null and not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Kullanici bulunamadi: %', p_user_id;
  end if;

  if p_ban_devices then
    select coalesce(array_agg(distinct device_id), '{}') into v_devs
    from devices where user_id = p_user_id and device_id is not null;
  end if;

  if p_ban_ips then
    select coalesce(array_agg(distinct ip), '{}') into v_ips
    from devices where user_id = p_user_id and ip is not null and ip <> '';
  end if;

  v_res := admin_create_ban(
    p_user_id, nullif(v_devs,'{}'), nullif(v_ips,'{}'),
    p_reason, p_notes, p_until, p_banned_by
  );

  return json_build_object(
    'ban_id', v_res->>'ban_id',
    'username', v_username,
    'cihaz_bani', coalesce((v_res->>'cihaz_adet')::int, 0),
    'ip_bani', coalesce((v_res->>'ip_adet')::int, 0)
  );
end;
$$;


-- ── Tek cihaz banı (Cihazlar sayfasından) ──
drop function if exists admin_ban_device(text, text, text, timestamptz, text);

create or replace function admin_ban_device(
  p_device_id text,
  p_reason text,
  p_notes text default null,
  p_until timestamptz default null,
  p_banned_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
begin
  if p_device_id is null or trim(p_device_id) = '' then
    raise exception 'device_id bos olamaz';
  end if;

  -- Aynı cihaz için aktif ban varsa yenisini açmıyoruz
  if exists (
    select 1 from bans
    where coalesce(is_active, true)
      and (device_id = p_device_id or (device_ids is not null and p_device_id = any(device_ids)))
  ) then
    update bans set reason = p_reason, notes = p_notes, until_at = p_until,
                    banned_by = p_banned_by, created_at = now()
    where coalesce(is_active, true)
      and (device_id = p_device_id or (device_ids is not null and p_device_id = any(device_ids)));

    return json_build_object('guncellendi', true, 'device_id', p_device_id);
  end if;

  return admin_create_ban(null, array[p_device_id], null, p_reason, p_notes, p_until, p_banned_by);
end;
$$;


-- ── IP banı ──
drop function if exists admin_ban_ip(text, text, text, timestamptz, text);

create or replace function admin_ban_ip(
  p_ip text,
  p_reason text,
  p_notes text default null,
  p_until timestamptz default null,
  p_banned_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
begin
  if p_ip is null or trim(p_ip) = '' then raise exception 'IP bos olamaz'; end if;

  if exists (
    select 1 from bans
    where coalesce(is_active, true)
      and (ip = trim(p_ip) or (ips is not null and trim(p_ip) = any(ips)))
  ) then
    update bans set reason = p_reason, notes = p_notes, until_at = p_until,
                    banned_by = p_banned_by, created_at = now()
    where coalesce(is_active, true)
      and (ip = trim(p_ip) or (ips is not null and trim(p_ip) = any(ips)));
    return json_build_object('guncellendi', true, 'ip', trim(p_ip));
  end if;

  return admin_create_ban(null, null, array[trim(p_ip)], p_reason, p_notes, p_until, p_banned_by);
end;
$$;


-- ── BAN LİSTESİ: dizi bilgisiyle, işe yarar filtrelerle ──
drop function if exists admin_list_bans(text, integer);

create or replace function admin_list_bans(
  -- active | expired | cancelled | all
  p_scope text default 'active',
  p_limit integer default 200
) returns table (
  id uuid, user_id uuid, username text, name text, avatar_url text, email text,
  device_id text, device_ids text[], device_adet integer,
  ip text, ips text[], ip_adet integer,
  platform text, reason text, type text, notes text,
  until_at timestamptz, is_active boolean, created_at timestamptz, banned_by text,
  etkilenen_hesap bigint,
  suresi_gecti boolean,
  durum text
)
language sql security definer set search_path = public as $$
  select
    b.id, b.user_id, p.username::text, p.name::text, p.avatar_url, p.email,
    b.device_id, b.device_ids,
    coalesce(array_length(b.device_ids, 1), case when b.device_id is not null then 1 else 0 end),
    b.ip, b.ips,
    coalesce(array_length(b.ips, 1), case when b.ip is not null then 1 else 0 end),
    b.platform, b.reason, b.type, b.notes,
    b.until_at, b.is_active, b.created_at, b.banned_by::text,
    (select count(distinct d.user_id) from devices d
       where d.user_id is not null
         and (d.device_id = any(coalesce(b.device_ids, array[b.device_id]))
              or d.ip = any(coalesce(b.ips, array[b.ip])))),
    (b.until_at is not null and b.until_at < now()) as suresi_gecti,
    case
      when coalesce(b.is_active, true) = false then 'cancelled'
      when b.until_at is not null and b.until_at < now() then 'expired'
      else 'active'
    end as durum
  from bans b
  left join profiles p on p.id = b.user_id
  where case coalesce(p_scope, 'active')
    -- ★ Filtreler artık HEDEF TİPİNE göre değil DURUMA göre:
    --   hangi banın hâlâ etkili olduğu asıl sorulan şey.
    when 'active'    then coalesce(b.is_active, true) and (b.until_at is null or b.until_at > now())
    when 'expired'   then coalesce(b.is_active, true) and b.until_at is not null and b.until_at < now()
    when 'cancelled' then coalesce(b.is_active, true) = false
    when 'all'       then true
    else true
  end
  order by b.created_at desc
  limit greatest(1, least(500, coalesce(p_limit, 200)));
$$;


-- ── Cihaz listesi: dizi kontrolüyle ──
drop function if exists admin_list_devices(text, text, integer);

create or replace function admin_list_devices(
  p_query text default null,
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
  select distinct on (d.device_id)
    d.device_id, d.user_id, p.username::text, p.avatar_url,
    d.platform, d.model, d.ip, d.push_enabled,
    (d.push_token is not null and d.push_token <> '') as has_push_token,
    d.last_login_at, d.created_at,
    is_device_banned(d.device_id) as is_banned,
    coalesce(is_ip_banned(d.ip), false) as ip_banned,
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
      when 'banned'   then is_device_banned(d.device_id)
      when 'unbanned' then not is_device_banned(d.device_id)
      when 'orphan'   then d.user_id is null
      else true
    end
  order by d.device_id, d.last_login_at desc nulls last
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;


-- ── CİHAZ DETAYI: bu cihazla giren tüm kullanıcılar ──
drop function if exists admin_device_detail(text);

create or replace function admin_device_detail(p_device_id text)
returns json language plpgsql security definer set search_path = public as $$
declare v_out json;
begin
  select json_build_object(
    'device_id', p_device_id,
    'kayit_adet', (select count(*) from devices where device_id = p_device_id),
    'platform', (select platform from devices where device_id = p_device_id
                   order by last_login_at desc nulls last limit 1),
    'model', (select model from devices where device_id = p_device_id
                order by last_login_at desc nulls last limit 1),
    'ip', (select ip from devices where device_id = p_device_id
             order by ip_updated_at desc nulls last limit 1),
    'ilk_gorulme', (select min(created_at) from devices where device_id = p_device_id),
    'son_giris', (select max(last_login_at) from devices where device_id = p_device_id),
    'push_token_var', (select bool_or(push_token is not null and push_token <> '')
                         from devices where device_id = p_device_id),
    'push_acik', (select bool_or(coalesce(push_enabled, true)) from devices where device_id = p_device_id),
    'is_banned', is_device_banned(p_device_id),
    'ip_banned', coalesce(is_ip_banned((select ip from devices where device_id = p_device_id
                                          order by ip_updated_at desc nulls last limit 1)), false),
    -- ★ Bu cihazla giriş yapan TÜM kullanıcılar
    'kullanicilar', (
      select coalesce(json_agg(x order by x.son_giris desc nulls last), '[]'::json) from (
        select
          d.user_id,
          p.username::text as username,
          p.name::text as name,
          p.avatar_url,
          p.email,
          p.sehir,
          p.role::text as role,
          coalesce(p.is_banned, false) as is_banned,
          max(d.last_login_at) as son_giris,
          min(d.created_at) as ilk_giris,
          (select count(*) from devices d3 where d3.user_id = d.user_id) as cihaz_adet
        from devices d
        left join profiles p on p.id = d.user_id
        where d.device_id = p_device_id and d.user_id is not null
        group by d.user_id, p.username, p.name, p.avatar_url, p.email, p.sehir, p.role, p.is_banned
      ) x
    ),
    -- Bu cihazı kapsayan ban kayıtları
    'banlar', (
      select coalesce(json_agg(y order by y.created_at desc), '[]'::json) from (
        select b.id, b.reason, b.type, b.notes, b.until_at, b.is_active,
               b.created_at, b.banned_by::text as banned_by, b.user_id
        from bans b
        where coalesce(b.is_active, true)
          and (b.device_id = p_device_id
               or (b.device_ids is not null and p_device_id = any(b.device_ids)))
      ) y
    ),
    -- Aynı IP'yi paylaşan diğer cihazlar
    'ayni_ip_cihaz', (
      select coalesce(count(distinct d2.device_id), 0) from devices d2
      where d2.ip is not null
        and d2.ip = (select ip from devices where device_id = p_device_id
                       order by ip_updated_at desc nulls last limit 1)
        and d2.device_id <> p_device_id
    )
  ) into v_out;

  return v_out;
end;
$$;


-- ── IP listesi: dizi kontrolüyle ──
drop function if exists admin_list_ips(text, text, integer);

create or replace function admin_list_ips(
  p_query text default null,
  p_filter text default 'all',
  p_limit integer default 100
) returns table (
  ip text, kullanici bigint, cihaz bigint, son_gorulme timestamptz,
  is_banned boolean, ornek_kullanici text
)
language sql security definer set search_path = public as $$
  with grup as (
    select d.ip,
      count(distinct d.user_id) as kullanici,
      count(distinct d.device_id) as cihaz,
      max(d.ip_updated_at) as son_gorulme,
      (array_agg(p.username::text order by d.ip_updated_at desc nulls last))[1] as ornek
    from devices d
    left join profiles p on p.id = d.user_id
    where d.ip is not null and d.ip <> ''
    group by d.ip
  )
  select g.ip, g.kullanici, g.cihaz, g.son_gorulme,
         coalesce(is_ip_banned(g.ip), false), g.ornek
  from grup g
  where (p_query is null or trim(p_query) = '' or g.ip ilike '%' || p_query || '%')
    and case coalesce(p_filter, 'all')
      when 'all'      then true
      when 'banned'   then is_ip_banned(g.ip)
      when 'unbanned' then not is_ip_banned(g.ip)
      when 'shared'   then g.kullanici > 1
      else true
    end
  order by g.kullanici desc, g.son_gorulme desc nulls last
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) ŞİKÂYET (REPORT) YÖNETİMİ                                      ║
-- ║                                                                    ║
-- ║  status: pending | reviewing | resolved | dismissed                ║
-- ║  Panel iki karar veriyor:                                          ║
-- ║    KABUL  → resolved  (şikâyet haklı, işlem yapıldı)               ║
-- ║    REDDET → dismissed (şikâyet yersiz)                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_report_counts();

create or replace function admin_report_counts()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'toplam',     (select count(*) from reports),
    'bekleyen',   (select count(*) from reports where status = 'pending'),
    'inceleniyor',(select count(*) from reports where status = 'reviewing'),
    'cozuldu',    (select count(*) from reports where status = 'resolved'),
    'reddedildi', (select count(*) from reports where status = 'dismissed'),
    -- ★ "Cevaplanmamış" = pending + reviewing
    'cevaplanmamis', (select count(*) from reports where status in ('pending','reviewing')),
    'son_24_saat', (select count(*) from reports where created_at > now() - interval '24 hours'),
    'son_7_gun',   (select count(*) from reports where created_at > now() - interval '7 days'),
    'sebep_dagilimi', (
      select coalesce(json_agg(x order by x.adet desc), '[]'::json) from (
        select coalesce(reason, 'belirtilmemis') as sebep, count(*) as adet
        from reports group by coalesce(reason, 'belirtilmemis') limit 12
      ) x
    )
  );
$$;


drop function if exists admin_list_reports_v2(text, text, integer, integer);

create or replace function admin_list_reports_v2(
  p_status text default null,        -- null = hepsi
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  id uuid,
  reporter_id uuid, reporter_username text, reporter_avatar text,
  reported_user_id uuid, reported_username text, reported_avatar text,
  reason text, description text,
  content_type text, content_id uuid,
  status text, admin_note text,
  created_at timestamptz, updated_at timestamptz,
  -- Şikâyet edilen kişi hakkındaki toplam şikâyet sayısı
  hedef_toplam_sikayet bigint,
  hedef_banli boolean
)
language sql security definer set search_path = public as $$
  select
    r.id,
    r.reporter_id, rp.username::text, rp.avatar_url,
    r.reported_user_id, tp.username::text, tp.avatar_url,
    r.reason, r.description,
    r.content_type::text, r.content_id,
    r.status::text, r.admin_note,
    r.created_at,
    case when exists (select 1 from information_schema.columns
                      where table_schema='public' and table_name='reports' and column_name='updated_at')
         then r.created_at else r.created_at end,
    (select count(*) from reports r2 where r2.reported_user_id = r.reported_user_id),
    coalesce(tp.is_banned, false)
  from reports r
  left join profiles rp on rp.id = r.reporter_id
  left join profiles tp on tp.id = r.reported_user_id
  where (p_status is null or trim(p_status) = '' or r.status = p_status)
    and (p_query is null or trim(p_query) = ''
         or rp.username ilike '%' || p_query || '%'
         or tp.username ilike '%' || p_query || '%'
         or r.reason ilike '%' || p_query || '%'
         or r.description ilike '%' || p_query || '%'
         or r.id::text = p_query)
  order by
    -- Cevaplanmamışlar önce
    case when r.status in ('pending','reviewing') then 0 else 1 end,
    r.created_at desc
  limit greatest(1, least(200, coalesce(p_limit, 50)))
  offset greatest(0, coalesce(p_offset, 0));
$$;


drop function if exists admin_report_detail(uuid);

create or replace function admin_report_detail(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_r record;
  v_icerik json := null;
  v_tbl text;
begin
  select * into v_r from reports where id = p_id;
  if v_r.id is null then return null; end if;

  -- Şikâyet edilen içeriği çekmeye çalış (tipi tabloya eşle)
  v_tbl := case lower(coalesce(v_r.content_type, ''))
    when 'post' then 'posts'
    when 'gonderi' then 'posts'
    when 'listing' then 'listings'
    when 'ilan' then 'listings'
    when 'discount' then 'indirimler'
    when 'indirim' then 'indirimler'
    when 'event' then 'etkinlikler'
    when 'etkinlik' then 'etkinlikler'
    when 'comment' then 'comments'
    when 'yorum' then 'comments'
    else null
  end;

  if v_tbl is not null and v_r.content_id is not null
     and exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name=v_tbl) then
    begin
      execute format('select to_jsonb(t) from %I t where t.id = $1', v_tbl)
        into v_icerik using v_r.content_id;
    exception when others then
      v_icerik := null;
    end;
  end if;

  return json_build_object(
    'id', v_r.id,
    'reason', v_r.reason,
    'description', v_r.description,
    'content_type', v_r.content_type,
    'content_id', v_r.content_id,
    'status', v_r.status,
    'admin_note', v_r.admin_note,
    'created_at', v_r.created_at,
    'reporter', (
      select json_build_object('id', p.id, 'username', p.username, 'name', p.name,
                              'avatar_url', p.avatar_url, 'email', p.email,
                              'sehir', p.sehir, 'is_banned', coalesce(p.is_banned,false),
                              'toplam_sikayet', (select count(*) from reports r2 where r2.reporter_id = p.id))
      from profiles p where p.id = v_r.reporter_id
    ),
    'reported', (
      select json_build_object('id', p.id, 'username', p.username, 'name', p.name,
                              'avatar_url', p.avatar_url, 'email', p.email,
                              'sehir', p.sehir, 'role', p.role,
                              'is_banned', coalesce(p.is_banned,false),
                              'hakkinda_sikayet', (select count(*) from reports r3 where r3.reported_user_id = p.id),
                              'cozulen', (select count(*) from reports r4
                                          where r4.reported_user_id = p.id and r4.status = 'resolved'))
      from profiles p where p.id = v_r.reported_user_id
    ),
    'icerik', v_icerik,
    'icerik_tablo', v_tbl,
    -- Aynı içerik hakkındaki diğer şikâyetler
    'ayni_icerik_sikayet', (
      select coalesce(json_agg(z order by z.created_at desc), '[]'::json) from (
        select r5.id, r5.reason, r5.status, r5.created_at,
               pp.username::text as reporter_username
        from reports r5 left join profiles pp on pp.id = r5.reporter_id
        where r5.content_id = v_r.content_id and v_r.content_id is not null and r5.id <> p_id
      ) z
    )
  );
end;
$$;


drop function if exists admin_set_report_status(uuid, text, text);

create or replace function admin_set_report_status(
  p_id uuid,
  p_status text,          -- pending | reviewing | resolved | dismissed
  p_note text default null
) returns json language plpgsql security definer set search_path = public as $$
declare v_row reports;
begin
  if p_status not in ('pending','reviewing','resolved','dismissed') then
    raise exception 'Gecersiz durum: %. Sadece pending, reviewing, resolved, dismissed', p_status;
  end if;

  update reports
  set status = p_status,
      admin_note = coalesce(nullif(trim(coalesce(p_note,'')), ''), admin_note)
  where id = p_id
  returning * into v_row;

  if v_row.id is null then raise exception 'Sikayet bulunamadi: %', p_id; end if;

  return json_build_object('id', v_row.id, 'status', v_row.status, 'admin_note', v_row.admin_note);
end;
$$;


drop function if exists admin_delete_report(uuid);

create or replace function admin_delete_report(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from reports where id = p_id;
  get diagnostics v_n = row_count;
  return json_build_object('silinen', v_n);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) PROFİL MEDYASI — avatar ve arka plan görseli                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Arka plan kolonu yoksa ekle (varsa dokunulmaz)
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='profiles'
                   and column_name in ('background_url','cover_url','banner_url')) then
    alter table profiles add column background_url text;
    raise notice 'profiles.background_url eklendi';
  end if;
end $$;

-- Hangi kolonun arka plan olduğunu panel bilsin
drop function if exists admin_profile_media_columns();

create or replace function admin_profile_media_columns()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'avatar', (select column_name from information_schema.columns
               where table_schema='public' and table_name='profiles'
                 and column_name in ('avatar_url','avatar','profile_image') limit 1),
    'background', (select column_name from information_schema.columns
               where table_schema='public' and table_name='profiles'
                 and column_name in ('background_url','cover_url','banner_url','kapak_url') limit 1)
  );
$$;

drop function if exists admin_set_profile_media(uuid, text, text);

create or replace function admin_set_profile_media(
  p_user_id uuid,
  p_field text,          -- 'avatar' | 'background'
  p_url text             -- null = kaldır
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_col text;
  v_old text;
begin
  select case p_field
    when 'avatar' then (admin_profile_media_columns()->>'avatar')
    when 'background' then (admin_profile_media_columns()->>'background')
    else null end
  into v_col;

  if v_col is null then
    raise exception 'Bu alan icin profiles tablosunda kolon bulunamadi: %', p_field;
  end if;

  execute format('select %I from profiles where id = $1', v_col) into v_old using p_user_id;

  execute format('update profiles set %I = $1, updated_at = now() where id = $2', v_col)
    using nullif(trim(coalesce(p_url,'')), ''), p_user_id;

  return json_build_object('kolon', v_col, 'eski', v_old, 'yeni', p_url);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) ANA SAYFA SAYAÇLARI                                            ║
-- ║                                                                    ║
-- ║  ★ İki fonksiyon: biri tam (sayfa açılışı), biri HAFİF (5 saniyede  ║
-- ║    bir çağrılan canlı sayaç). Hafif olan sadece count(*) yapıyor —  ║
-- ║    her 5 saniyede ağır sorgu atmak veritabanını yorardı.            ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_dashboard_counts();

create or replace function admin_dashboard_counts()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_post bigint := null;
  v_listing bigint := null;
  v_discount bigint := null;
  v_event bigint := null;
begin
  -- Tablo yoksa null döner; panel "—" gösterir
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='posts') then
    execute 'select count(*) from posts' into v_post;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='listings') then
    execute 'select count(*) from listings' into v_listing;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='indirimler') then
    execute 'select count(*) from indirimler' into v_discount;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='etkinlikler') then
    execute 'select count(*) from etkinlikler' into v_event;
  end if;

  return json_build_object(
    'kullanici', (select count(*) from auth.users),
    'post', v_post,
    'ilan', v_listing,
    'indirim', v_discount,
    'etkinlik', v_event,
    'bekleyen_isletme', (select count(*) from profiles where business_durum = 'pending'),
    'bekleyen_ogrenci', (select count(*) from profiles where ogrenci_durum = 'pending'),
    'sikayet', (select count(*) from reports where status in ('pending','reviewing')),
    'sikayet_toplam', (select count(*) from reports),
    'tutarsiz', (select count(*) from (
        select u.id
        from auth.users u
        left join profiles p on p.id = u.id
        where p.id is null
          or (u.email is not null and p.email is not null and lower(u.email::text) <> lower(p.email))
          or (u.phone is not null and p.phone is not null and u.phone::text <> p.phone::text)
          or (p.username is null or trim(p.username) = '')
          or (coalesce(p.is_banned,false) and not exists
                (select 1 from bans b where b.user_id = u.id and coalesce(b.is_active,true)))
          or (not coalesce(p.is_banned,false) and exists
                (select 1 from bans b where b.user_id = u.id and coalesce(b.is_active,true)))
      ) t),
    'banli', (select count(*) from profiles where coalesce(is_banned,false)),
    'yeni_7g', (select count(*) from auth.users where created_at > now() - interval '7 days')
  );
end;
$$;

-- ── HAFİF canlı sayaç (5 saniyede bir) ──
drop function if exists admin_live_counts();

create or replace function admin_live_counts()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_post bigint := null; v_listing bigint := null;
  v_discount bigint := null; v_event bigint := null;
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='posts') then
    execute 'select count(*) from posts' into v_post;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='listings') then
    execute 'select count(*) from listings' into v_listing;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='indirimler') then
    execute 'select count(*) from indirimler' into v_discount;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='etkinlikler') then
    execute 'select count(*) from etkinlikler' into v_event;
  end if;

  return json_build_object(
    'kullanici', (select count(*) from auth.users),
    'post', v_post, 'ilan', v_listing, 'indirim', v_discount, 'etkinlik', v_event,
    'sikayet', (select count(*) from reports where status in ('pending','reviewing'))
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  7) YETKİLER                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin_%' or p.proname in ('is_device_banned','is_ip_banned'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Mobil tarafın ihtiyacı olanlar
grant execute on function check_access(text, text) to anon, authenticated;
grant execute on function is_device_banned(text) to authenticated, anon;
grant execute on function is_ip_banned(text) to authenticated, anon;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- 1) Dizi hatası düzeldi mi? (hata vermezse düzeldi)
do $$
declare v text[] := '{}';
begin
  v := v || 'test'::text;
  raise notice 'DIZI TESTI: OK (%)', v;
end $$;

-- 2) Ban kolonları
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='bans'
  and column_name in ('device_id','device_ids','ip','ips')
order by column_name;

-- 3) Profil medya kolonları
select admin_profile_media_columns() as medya_kolonlari;

-- 4) Yeni fonksiyonlar
select p.proname, has_function_privilege('service_role', p.oid, 'execute') as yetki
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in
  ('admin_create_ban','admin_device_detail','admin_report_counts','admin_list_reports_v2',
   'admin_report_detail','admin_set_report_status','admin_delete_report',
   'admin_set_profile_media','admin_profile_media_columns',
   'admin_dashboard_counts','admin_live_counts','is_device_banned','is_ip_banned')
order by 1;
