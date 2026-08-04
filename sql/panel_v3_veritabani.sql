-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V3 — VERİTABANI EKLERİ
--
-- ┌─ BU DOSYA NE EKLİYOR ─────────────────────────────────────────────┐
-- │  1. KULLANICI LİSTESİ — auth.users + profiles birleşik, tutarlılık │
-- │     bayraklarıyla                                                  │
-- │  2. TUTARLILIK KONTROLÜ — auth'ta var profiles'ta yok, e-posta     │
-- │     uyuşmuyor, mükerrer kayıt vb.                                  │
-- │  3. CİHAZ BANI — hesabı banlamadan sadece cihazı banlama           │
-- │  4. BAN LİSTELERİ — kullanıcı ve cihaz banları                     │
-- │  5. HEDEFLEME GENİŞLETMESİ — sadece işletme hesapları filtresi     │
-- │  6. ŞEHİR DAĞILIMI — 81 il, kayıtlı olmayanlar da dahil            │
-- └────────────────────────────────────────────────────────────────────┘
--
-- ┌─ DİKKAT ──────────────────────────────────────────────────────────┐
-- │ • `devices` tablosunda IP KOLONU YOK. Ban kaydında IP tutmak       │
-- │   istiyorsan önce devices'a `ip` kolonu eklemen ve mobil uygulamada │
-- │   doldurman gerekir. Şu an cihaz banı device_id + platform + model  │
-- │   üzerinden çalışıyor.                                              │
-- │ • auth.users'a erişim SADECE security definer fonksiyonlarla —      │
-- │   panel bile doğrudan sorgulamıyor.                                 │
-- └────────────────────────────────────────────────────────────────────┘
--
-- ★ Tek seferde çalıştır. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) KULLANICI LİSTESİ (auth.users ana kaynak)                       ║
-- ║                                                                    ║
-- ║  auth.users SOL, profiles SAĞ join — yani profili olmayan auth      ║
-- ║  kullanıcıları da listede görünüyor (tutarsızlık tespiti için).     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_list_users(text, text, integer, integer);

create or replace function admin_list_users(
  p_query text default null,
  -- all | active | banned | business | student | pending_business |
  -- pending_student | no_profile | mismatch
  p_filter text default 'all',
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  auth_id uuid,
  email text,
  phone text,
  email_confirmed boolean,
  phone_confirmed boolean,
  last_sign_in timestamptz,
  auth_created timestamptz,
  -- profiles
  has_profile boolean,
  username text,
  name text,
  avatar_url text,
  role text,
  sehir text,
  is_active boolean,
  is_banned boolean,
  verify boolean,
  ogrenci boolean,
  ogrenci_durum text,
  business_durum text,
  gizli boolean,
  follower_count integer,
  post_count integer,
  profile_created timestamptz,
  -- cihaz / ban özeti
  device_count bigint,
  push_device_count bigint,
  active_ban_count bigint,
  -- ★ tutarsızlık bayrağı
  has_mismatch boolean
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with base as (
    select
      u.id                                            as auth_id,
      u.email::text                                   as email,
      u.phone::text                                   as phone,
      (u.email_confirmed_at is not null)              as email_confirmed,
      (u.phone_confirmed_at is not null)              as phone_confirmed,
      u.last_sign_in_at                               as last_sign_in,
      u.created_at                                    as auth_created,
      (p.id is not null)                              as has_profile,
      p.username::text, p.name::text, p.avatar_url,
      p.role::text, p.sehir,
      p.is_active, p.is_banned, p.verify,
      p.ogrenci, p.ogrenci_durum, p.business_durum, p.gizli,
      p.follower_count, p.post_count,
      p.created_at                                    as profile_created,
      p.email                                         as profile_email,
      p.phone::text                                   as profile_phone,
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
      /* ★ TUTARSIZLIK KOŞULLARI
         • profil hiç yok
         • auth e-postası ile profil e-postası farklı
         • auth telefonu ile profil telefonu farklı
         • kullanıcı adı boş
         • profil banlı ama aktif ban kaydı yok (veya tersi) */
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
      when 'all'              then true
      when 'active'           then coalesce(f.is_active, true) and not coalesce(f.is_banned, false)
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


-- ── Kullanıcı sayıları (filtre sekmelerinde göstermek için) ──
drop function if exists admin_user_counts();

create or replace function admin_user_counts()
returns json language sql security definer set search_path = public as $$
  with base as (
    select
      u.id,
      (p.id is not null) as has_profile,
      p.role::text, p.is_active, p.is_banned, p.ogrenci,
      p.ogrenci_durum, p.business_durum, p.username, p.email as pe, p.phone::text as pp,
      u.email::text as ae, u.phone::text as ap,
      (select count(*) from bans b where b.user_id = u.id and coalesce(b.is_active,true)) as bans
    from auth.users u
    left join profiles p on p.id = u.id
  )
  select json_build_object(
    'toplam',           (select count(*) from base),
    'aktif',            (select count(*) from base where coalesce(is_active,true) and not coalesce(is_banned,false)),
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


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) KULLANICI DETAYI + TUTARLILIK RAPORU                           ║
-- ║                                                                    ║
-- ║  Panelde tek sayfada göstermek için her şey tek çağrıda:           ║
-- ║  auth kaydı, profil, cihazlar, banlar, şikayetler, tutarsızlıklar. ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_user_full(uuid);

create or replace function admin_user_full(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_auth record;
  v_profile profiles;
  v_devices json;
  v_bans json;
  v_reports_against json;
  v_reports_made json;
  v_issues json;
  v_dup_username json;
  v_dup_email json;
  v_issue_list jsonb := '[]'::jsonb;
begin
  -- ── auth kaydı ──
  select id, email::text as email, phone::text as phone,
         email_confirmed_at, phone_confirmed_at,
         last_sign_in_at, created_at, updated_at,
         raw_user_meta_data, banned_until
  into v_auth
  from auth.users where id = p_user_id;

  -- ── profil ──
  select * into v_profile from profiles where id = p_user_id;

  -- Hiçbiri yoksa null dön
  if v_auth.id is null and v_profile.id is null then
    return null;
  end if;

  /* ══════════════════════════════════════════════════════════════
     ★ TUTARSIZLIK TESPİTİ
     Her sorun bir nesne: { kod, seviye, baslik, detay }
     seviye: critical | warning | info
  ══════════════════════════════════════════════════════════════ */

  -- Auth'ta var, profil yok
  if v_auth.id is not null and v_profile.id is null then
    v_issue_list := v_issue_list || jsonb_build_object(
      'kod', 'no_profile', 'seviye', 'critical',
      'baslik', 'Profil kaydı yok',
      'detay', 'Kullanıcı auth sisteminde var ama profiles tablosunda kaydı bulunamadı. Uygulamaya giriş yapabilir ama profili görüntülenemez.'
    );
  end if;

  -- Profil var, auth yok (yetim profil)
  if v_auth.id is null and v_profile.id is not null then
    v_issue_list := v_issue_list || jsonb_build_object(
      'kod', 'no_auth', 'seviye', 'critical',
      'baslik', 'Auth kaydı yok',
      'detay', 'profiles tablosunda kayıt var ama auth.users''ta yok. Yetim kayıt — kullanıcı giriş yapamaz.'
    );
  end if;

  if v_auth.id is not null and v_profile.id is not null then
    -- E-posta uyuşmazlığı
    if v_auth.email is not null and v_profile.email is not null
       and lower(v_auth.email) <> lower(v_profile.email) then
      v_issue_list := v_issue_list || jsonb_build_object(
        'kod', 'email_mismatch', 'seviye', 'warning',
        'baslik', 'E-posta uyuşmuyor',
        'detay', format('auth: %s  ·  profiles: %s', v_auth.email, v_profile.email)
      );
    end if;

    -- Profilde e-posta boş
    if v_auth.email is not null and v_profile.email is null then
      v_issue_list := v_issue_list || jsonb_build_object(
        'kod', 'email_missing_profile', 'seviye', 'info',
        'baslik', 'Profilde e-posta boş',
        'detay', format('auth''ta var (%s) ama profiles.email null. Sync trigger çalışmamış olabilir.', v_auth.email)
      );
    end if;

    -- Telefon uyuşmazlığı
    if v_auth.phone is not null and v_profile.phone is not null
       and v_auth.phone <> v_profile.phone::text then
      v_issue_list := v_issue_list || jsonb_build_object(
        'kod', 'phone_mismatch', 'seviye', 'warning',
        'baslik', 'Telefon uyuşmuyor',
        'detay', format('auth: %s  ·  profiles: %s', v_auth.phone, v_profile.phone)
      );
    end if;

    -- Doğrulama bayrağı uyuşmazlığı
    if (v_auth.email_confirmed_at is not null) <> coalesce(v_profile.email_verified, false) then
      v_issue_list := v_issue_list || jsonb_build_object(
        'kod', 'email_verify_mismatch', 'seviye', 'warning',
        'baslik', 'E-posta doğrulama bayrağı uyuşmuyor',
        'detay', format('auth doğrulanmış: %s  ·  profiles.email_verified: %s',
                        (v_auth.email_confirmed_at is not null), coalesce(v_profile.email_verified,false))
      );
    end if;

    if (v_auth.phone_confirmed_at is not null) <> coalesce(v_profile.phone_verify, false) then
      v_issue_list := v_issue_list || jsonb_build_object(
        'kod', 'phone_verify_mismatch', 'seviye', 'warning',
        'baslik', 'Telefon doğrulama bayrağı uyuşmuyor',
        'detay', format('auth doğrulanmış: %s  ·  profiles.phone_verify: %s',
                        (v_auth.phone_confirmed_at is not null), coalesce(v_profile.phone_verify,false))
      );
    end if;

    -- Kullanıcı adı boş
    if v_profile.username is null or trim(v_profile.username) = '' then
      v_issue_list := v_issue_list || jsonb_build_object(
        'kod', 'username_empty', 'seviye', 'critical',
        'baslik', 'Kullanıcı adı boş',
        'detay', 'username alanı boş — profil sayfası ve mention''lar çalışmaz.'
      );
    end if;

    -- Ban bayrağı ile ban kaydı uyuşmazlığı
    if coalesce(v_profile.is_banned, false) = true
       and not exists (select 1 from bans b where b.user_id = p_user_id and coalesce(b.is_active,true)) then
      v_issue_list := v_issue_list || jsonb_build_object(
        'kod', 'ban_flag_no_record', 'seviye', 'warning',
        'baslik', 'Banlı işaretli ama ban kaydı yok',
        'detay', 'profiles.is_banned = true ama bans tablosunda aktif kayıt bulunamadı. Ban sebebi görünmez.'
      );
    end if;

    if coalesce(v_profile.is_banned, false) = false
       and exists (select 1 from bans b where b.user_id = p_user_id and coalesce(b.is_active,true)) then
      v_issue_list := v_issue_list || jsonb_build_object(
        'kod', 'ban_record_no_flag', 'seviye', 'critical',
        'baslik', 'Aktif ban var ama hesap banlı değil',
        'detay', 'bans tablosunda aktif kayıt var ama profiles.is_banned = false. Kullanıcı uygulamayı kullanmaya devam ediyor.'
      );
    end if;

    -- İşletme rolü ile başvuru durumu uyuşmazlığı
    if v_profile.role = 'business' and coalesce(v_profile.business_durum, '') <> 'approved' then
      v_issue_list := v_issue_list || jsonb_build_object(
        'kod', 'business_role_mismatch', 'seviye', 'info',
        'baslik', 'İşletme rolü ile başvuru durumu uyuşmuyor',
        'detay', format('role = business ama business_durum = %s', coalesce(v_profile.business_durum, 'null'))
      );
    end if;

    -- Öğrenci bayrağı ile durum uyuşmazlığı
    if coalesce(v_profile.ogrenci, false) = true and coalesce(v_profile.ogrenci_durum,'') <> 'approved' then
      v_issue_list := v_issue_list || jsonb_build_object(
        'kod', 'student_flag_mismatch', 'seviye', 'info',
        'baslik', 'Öğrenci işaretli ama durum onaylı değil',
        'detay', format('ogrenci = true ama ogrenci_durum = %s', coalesce(v_profile.ogrenci_durum,'null'))
      );
    end if;
  end if;

  -- ── Mükerrer kayıt kontrolü ──
  select coalesce(json_agg(t), '[]'::json) into v_dup_username
  from (
    select p2.id, p2.username::text, p2.created_at
    from profiles p2
    where v_profile.username is not null
      and lower(p2.username) = lower(v_profile.username)
      and p2.id <> p_user_id
  ) t;

  select coalesce(json_agg(t), '[]'::json) into v_dup_email
  from (
    select p2.id, p2.username::text, p2.email, p2.created_at
    from profiles p2
    where v_profile.email is not null
      and lower(p2.email) = lower(v_profile.email)
      and p2.id <> p_user_id
  ) t;

  if json_array_length(v_dup_username) > 0 then
    v_issue_list := v_issue_list || jsonb_build_object(
      'kod', 'duplicate_username', 'seviye', 'critical',
      'baslik', 'Aynı kullanıcı adı başka hesapta da var',
      'detay', format('%s adet mükerrer kayıt bulundu.', json_array_length(v_dup_username))
    );
  end if;

  if json_array_length(v_dup_email) > 0 then
    v_issue_list := v_issue_list || jsonb_build_object(
      'kod', 'duplicate_email', 'seviye', 'critical',
      'baslik', 'Aynı e-posta başka hesapta da var',
      'detay', format('%s adet mükerrer kayıt bulundu.', json_array_length(v_dup_email))
    );
  end if;

  v_issues := v_issue_list::json;

  -- ── Cihazlar (TÜM bilgiler) ──
  select coalesce(json_agg(d order by d.last_login_at desc nulls last), '[]'::json) into v_devices
  from (
    select
      dv.device_id, dv.platform, dv.model,
      dv.push_enabled,
      (dv.push_token is not null and dv.push_token <> '') as has_push_token,
      case when dv.push_token is null or dv.push_token = '' then null
           else left(dv.push_token, 26) || '…' end as push_token_masked,
      dv.push_token_updated_at, dv.last_login_at, dv.created_at,
      -- Bu cihaz banlı mı
      exists (select 1 from bans b where b.device_id = dv.device_id
                and coalesce(b.is_active, true)) as device_banned,
      -- Bu cihazı başka kullanıcılar da kullanmış mı (paylaşılan cihaz)
      (select count(distinct d2.user_id) from devices d2
        where d2.device_id = dv.device_id and d2.user_id is not null) as user_count
    from devices dv
    where dv.user_id = p_user_id
  ) d;

  -- ── Banlar ──
  select coalesce(json_agg(b order by b.created_at desc), '[]'::json) into v_bans
  from (
    select id, device_id, platform, reason, type, notes,
           until_at, is_active, created_at, banned_by
    from bans where user_id = p_user_id
  ) b;

  -- ── Şikayetler ──
  select coalesce(json_agg(r order by r.created_at desc), '[]'::json) into v_reports_against
  from (
    select r2.id, r2.reporter_id, rp.username::text as reporter_username,
           r2.reason, r2.description, r2.content_type, r2.content_id,
           r2.status, r2.admin_note, r2.created_at
    from reports r2 left join profiles rp on rp.id = r2.reporter_id
    where r2.reported_user_id = p_user_id
  ) r;

  select coalesce(json_agg(r order by r.created_at desc), '[]'::json) into v_reports_made
  from (
    select r2.id, r2.reported_user_id, tp.username::text as reported_username,
           r2.reason, r2.status, r2.created_at
    from reports r2 left join profiles tp on tp.id = r2.reported_user_id
    where r2.reporter_id = p_user_id
  ) r;

  return json_build_object(
    'auth', case when v_auth.id is null then null else json_build_object(
      'id', v_auth.id,
      'email', v_auth.email,
      'phone', v_auth.phone,
      'email_confirmed_at', v_auth.email_confirmed_at,
      'phone_confirmed_at', v_auth.phone_confirmed_at,
      'last_sign_in_at', v_auth.last_sign_in_at,
      'created_at', v_auth.created_at,
      'updated_at', v_auth.updated_at,
      'banned_until', v_auth.banned_until,
      'meta', v_auth.raw_user_meta_data
    ) end,
    'profile', case when v_profile.id is null then null else to_json(v_profile) end,
    'devices', v_devices,
    'bans', v_bans,
    'reports_against', v_reports_against,
    'reports_made', v_reports_made,
    'issues', v_issues,
    'duplicate_username', v_dup_username,
    'duplicate_email', v_dup_email
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) BAN İŞLEMLERİ                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- ── Kullanıcıyı banla (cihazlarıyla birlikte) ──
drop function if exists admin_ban_user(uuid, text, text, text, timestamptz, text);
drop function if exists admin_ban_user_full(uuid, text, text, text, timestamptz, boolean, text);

create or replace function admin_ban_user_full(
  p_user_id uuid,
  p_reason text,
  p_type text default 'manual',
  p_notes text default null,
  p_until timestamptz default null,      -- null = kalıcı
  -- ★ true ise kullanıcının TÜM cihazları da banlanır
  p_ban_devices boolean default true,
  p_banned_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_username text;
  v_user_ban_id uuid;
  v_device_bans int := 0;
  d record;
begin
  select username into v_username from profiles where id = p_user_id;
  if v_username is null and not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Kullanici bulunamadi: %', p_user_id;
  end if;

  -- Hesap banı
  insert into bans (user_id, reason, type, notes, until_at, is_active, banned_by)
  values (p_user_id,
          nullif(trim(coalesce(p_reason,'')), ''),
          coalesce(nullif(trim(p_type),''), 'manual'),
          nullif(trim(coalesce(p_notes,'')), ''),
          p_until, true, p_banned_by)
  returning id into v_user_ban_id;

  -- ★ Cihaz banları — kullanıcının TÜM cihazları
  if p_ban_devices then
    for d in
      select device_id, platform, model from devices where user_id = p_user_id
    loop
      -- Aynı cihaz için aktif ban varsa tekrar ekleme
      if not exists (
        select 1 from bans b
        where b.device_id = d.device_id and coalesce(b.is_active, true)
      ) then
        insert into bans (user_id, device_id, platform, reason, type, notes, until_at, is_active, banned_by)
        values (p_user_id, d.device_id, d.platform,
                nullif(trim(coalesce(p_reason,'')), ''),
                'device',
                coalesce(nullif(trim(coalesce(p_notes,'')), '') || ' · ', '')
                  || 'Hesap banı ile birlikte · model: ' || coalesce(d.model, '?'),
                p_until, true, p_banned_by);
        v_device_bans := v_device_bans + 1;
      end if;
    end loop;
  end if;

  -- profiles bayrağı
  update profiles set is_banned = true, updated_at = now() where id = p_user_id;

  return json_build_object(
    'ban_id', v_user_ban_id,
    'username', v_username,
    'cihaz_bani', v_device_bans,
    'until_at', p_until
  );
end;
$$;


-- ── Sadece CİHAZ banla (hesaba dokunmadan) ──
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
  v_model text;
  v_users bigint;
begin
  if p_device_id is null or trim(p_device_id) = '' then
    raise exception 'device_id bos olamaz';
  end if;

  -- Cihaz bilgisi (varsa)
  select platform, model into v_platform, v_model
  from devices where device_id = p_device_id
  order by last_login_at desc nulls last limit 1;

  select count(distinct user_id) into v_users
  from devices where device_id = p_device_id and user_id is not null;

  -- Aktif ban zaten varsa hata verme, bilgi dön
  if exists (select 1 from bans b where b.device_id = p_device_id and coalesce(b.is_active,true)) then
    return json_build_object('zaten_banli', true, 'device_id', p_device_id);
  end if;

  insert into bans (user_id, device_id, platform, reason, type, notes, until_at, is_active, banned_by)
  values (null, p_device_id, v_platform,
          nullif(trim(coalesce(p_reason,'')), ''),
          'device',
          nullif(trim(coalesce(p_notes,'')), ''),
          p_until, true, p_banned_by)
  returning id into v_ban_id;

  return json_build_object(
    'ban_id', v_ban_id,
    'device_id', p_device_id,
    'platform', v_platform,
    'model', v_model,
    'etkilenen_kullanici', v_users
  );
end;
$$;


-- ── Ban kaldır (kullanıcı) ──
drop function if exists admin_unban_user(uuid);

create or replace function admin_unban_user(p_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_count integer; v_username text;
begin
  select username into v_username from profiles where id = p_user_id;

  update bans set is_active = false
  where user_id = p_user_id and coalesce(is_active, true);
  get diagnostics v_count = row_count;

  update profiles set is_banned = false, updated_at = now() where id = p_user_id;

  return json_build_object('username', v_username, 'kaldirilan', v_count);
end;
$$;


-- ── Ban kaldır (tek ban kaydı) ──
drop function if exists admin_unban_record(uuid);

create or replace function admin_unban_record(p_ban_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_row bans; v_left int;
begin
  update bans set is_active = false where id = p_ban_id returning * into v_row;
  if v_row.id is null then raise exception 'Ban kaydi bulunamadi: %', p_ban_id; end if;

  -- Kullanıcının başka aktif banı kalmadıysa is_banned bayrağını da kaldır
  if v_row.user_id is not null then
    select count(*) into v_left from bans
    where user_id = v_row.user_id and coalesce(is_active, true);
    if v_left = 0 then
      update profiles set is_banned = false, updated_at = now() where id = v_row.user_id;
    end if;
  end if;

  return json_build_object('ban_id', v_row.id, 'device_id', v_row.device_id,
                           'user_id', v_row.user_id, 'kalan_aktif_ban', coalesce(v_left, 0));
end;
$$;


-- ── Ban listesi ──
drop function if exists admin_list_bans(text, integer);

create or replace function admin_list_bans(
  -- all | user | device | expired
  p_scope text default 'all',
  p_limit integer default 100
) returns table (
  id uuid,
  user_id uuid,
  username text,
  name text,
  avatar_url text,
  email text,
  device_id text,
  platform text,
  model text,
  reason text,
  type text,
  notes text,
  until_at timestamptz,
  is_active boolean,
  created_at timestamptz,
  banned_by text,
  -- Bu cihazı kaç kullanıcı kullanmış
  device_user_count bigint,
  suresi_gecti boolean
)
language sql security definer set search_path = public as $$
  select
    b.id, b.user_id, p.username::text, p.name::text, p.avatar_url, p.email,
    b.device_id, b.platform,
    (select d.model from devices d where d.device_id = b.device_id
       order by d.last_login_at desc nulls last limit 1) as model,
    b.reason, b.type, b.notes, b.until_at, b.is_active, b.created_at, b.banned_by,
    (select count(distinct d2.user_id) from devices d2
       where d2.device_id = b.device_id and d2.user_id is not null) as device_user_count,
    (b.until_at is not null and b.until_at < now()) as suresi_gecti
  from bans b
  left join profiles p on p.id = b.user_id
  where case coalesce(p_scope, 'all')
    when 'all'     then coalesce(b.is_active, true)
    when 'user'    then coalesce(b.is_active, true) and b.user_id is not null and b.device_id is null
    when 'device'  then coalesce(b.is_active, true) and b.device_id is not null
    when 'expired' then b.until_at is not null and b.until_at < now() and coalesce(b.is_active, true)
    when 'inactive' then coalesce(b.is_active, true) = false
    else true
  end
  order by b.created_at desc
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;


-- ── Cihaz listesi (cihaz banı için arama) ──
drop function if exists admin_list_devices(text, text, integer);

create or replace function admin_list_devices(
  p_query text default null,
  -- all | banned | unbanned | orphan (kullanıcısı olmayan)
  p_filter text default 'all',
  p_limit integer default 100
) returns table (
  device_id text,
  user_id uuid,
  username text,
  avatar_url text,
  platform text,
  model text,
  push_enabled boolean,
  has_push_token boolean,
  last_login_at timestamptz,
  created_at timestamptz,
  is_banned boolean,
  user_count bigint
)
language sql security definer set search_path = public as $$
  select
    d.device_id, d.user_id, p.username::text, p.avatar_url,
    d.platform, d.model, d.push_enabled,
    (d.push_token is not null and d.push_token <> '') as has_push_token,
    d.last_login_at, d.created_at,
    exists (select 1 from bans b where b.device_id = d.device_id
              and coalesce(b.is_active, true)) as is_banned,
    (select count(distinct d2.user_id) from devices d2
       where d2.device_id = d.device_id and d2.user_id is not null) as user_count
  from devices d
  left join profiles p on p.id = d.user_id
  where
    (p_query is null or trim(p_query) = ''
      or d.device_id ilike '%' || p_query || '%'
      or d.model     ilike '%' || p_query || '%'
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


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) HEDEFLEME GENİŞLETMESİ — sadece işletme hesapları              ║
-- ║                                                                    ║
-- ║  Eski fonksiyonlar korunuyor; yenileri `p_business_only`            ║
-- ║  parametresi ekliyor. Eski imzalar DROP ediliyor ki 42725           ║
-- ║  (ambiguous function) hatası çıkmasın.                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_count_push_targets(text[], boolean, text[], integer);
drop function if exists admin_count_push_targets(text[], boolean, boolean, text[], integer);

create or replace function admin_count_push_targets(
  p_cities text[] default null,
  p_students_only boolean default false,
  p_business_only boolean default false,
  p_platforms text[] default null,
  p_active_days integer default null
) returns json
language sql security definer set search_path = public as $$
  with hedef as (
    select d.user_id, d.device_id
    from devices d
    join profiles p on p.id = d.user_id
    where d.push_token is not null and d.push_token <> ''
      and coalesce(d.push_enabled, true) = true
      and coalesce(p.is_active, true) = true
      and coalesce(p.is_banned, false) = false
      and (p_cities is null or p.sehir = any(p_cities))
      and (p_students_only = false or coalesce(p.ogrenci, false) = true)
      and (p_business_only = false or p.role = 'business')
      and (p_platforms is null or d.platform = any(p_platforms))
      and (p_active_days is null
           or d.last_login_at > now() - make_interval(days => p_active_days))
  )
  select json_build_object(
    'kullanici', (select count(distinct user_id) from hedef),
    'cihaz',     (select count(*) from hedef)
  );
$$;

drop function if exists admin_push_targets(text[], boolean, text[], integer, integer);
drop function if exists admin_push_targets(text[], boolean, boolean, text[], integer, integer);

create or replace function admin_push_targets(
  p_cities text[] default null,
  p_students_only boolean default false,
  p_business_only boolean default false,
  p_platforms text[] default null,
  p_active_days integer default null,
  p_limit integer default 5000
) returns table (
  user_id uuid, device_id text, push_token text, platform text
)
language sql security definer set search_path = public as $$
  select d.user_id, d.device_id, d.push_token, d.platform
  from devices d
  join profiles p on p.id = d.user_id
  where d.push_token is not null and d.push_token <> ''
    and coalesce(d.push_enabled, true) = true
    and coalesce(p.is_active, true) = true
    and coalesce(p.is_banned, false) = false
    and (p_cities is null or p.sehir = any(p_cities))
    and (p_students_only = false or coalesce(p.ogrenci, false) = true)
    and (p_business_only = false or p.role = 'business')
    and (p_platforms is null or d.platform = any(p_platforms))
    and (p_active_days is null
         or d.last_login_at > now() - make_interval(days => p_active_days))
  order by d.last_login_at desc nulls last
  limit greatest(1, least(50000, coalesce(p_limit, 5000)));
$$;


-- ── Uygulama içi bildirim hedefleri (push'suz gönderim için) ──
drop function if exists admin_notify_targets(text[], boolean, boolean, integer);

create or replace function admin_notify_targets(
  p_cities text[] default null,
  p_students_only boolean default false,
  p_business_only boolean default false,
  p_limit integer default 50000
) returns table (user_id uuid)
language sql security definer set search_path = public as $$
  select p.id
  from profiles p
  where coalesce(p.is_active, true) = true
    and coalesce(p.is_banned, false) = false
    and (p_cities is null or p.sehir = any(p_cities))
    and (p_students_only = false or coalesce(p.ogrenci, false) = true)
    and (p_business_only = false or p.role = 'business')
  limit greatest(1, least(200000, coalesce(p_limit, 50000)));
$$;

drop function if exists admin_count_notify_targets(text[], boolean, boolean);

create or replace function admin_count_notify_targets(
  p_cities text[] default null,
  p_students_only boolean default false,
  p_business_only boolean default false
) returns integer
language sql security definer set search_path = public as $$
  select count(*)::integer
  from profiles p
  where coalesce(p.is_active, true) = true
    and coalesce(p.is_banned, false) = false
    and (p_cities is null or p.sehir = any(p_cities))
    and (p_students_only = false or coalesce(p.ogrenci, false) = true)
    and (p_business_only = false or p.role = 'business');
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) ŞEHİR DAĞILIMI (81 il — kayıtlı olmayanlar da)                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_city_stats();

create or replace function admin_city_stats()
returns table (sehir text, kullanici bigint, push_cihaz bigint)
language sql security definer set search_path = public as $$
  with iller(sehir) as (
    values ('Adana'),('Adıyaman'),('Afyonkarahisar'),('Ağrı'),('Aksaray'),('Amasya'),
    ('Ankara'),('Antalya'),('Ardahan'),('Artvin'),('Aydın'),('Balıkesir'),('Bartın'),
    ('Batman'),('Bayburt'),('Bilecik'),('Bingöl'),('Bitlis'),('Bolu'),('Burdur'),
    ('Bursa'),('Çanakkale'),('Çankırı'),('Çorum'),('Denizli'),('Diyarbakır'),('Düzce'),
    ('Edirne'),('Elazığ'),('Erzincan'),('Erzurum'),('Eskişehir'),('Gaziantep'),
    ('Giresun'),('Gümüşhane'),('Hakkâri'),('Hatay'),('Iğdır'),('Isparta'),('İstanbul'),
    ('İzmir'),('Kahramanmaraş'),('Karabük'),('Karaman'),('Kars'),('Kastamonu'),
    ('Kayseri'),('Kilis'),('Kırıkkale'),('Kırklareli'),('Kırşehir'),('Kocaeli'),
    ('Konya'),('Kütahya'),('Malatya'),('Manisa'),('Mardin'),('Mersin'),('Muğla'),
    ('Muş'),('Nevşehir'),('Niğde'),('Ordu'),('Osmaniye'),('Rize'),('Sakarya'),
    ('Samsun'),('Siirt'),('Sinop'),('Sivas'),('Şanlıurfa'),('Şırnak'),('Tekirdağ'),
    ('Tokat'),('Trabzon'),('Tunceli'),('Uşak'),('Van'),('Yalova'),('Yozgat'),('Zonguldak')
  )
  select
    i.sehir,
    coalesce(u.adet, 0)      as kullanici,
    coalesce(u.push_adet, 0) as push_cihaz
  from iller i
  left join (
    select p.sehir,
           count(*) as adet,
           (select count(*) from devices d
              where d.user_id in (select p2.id from profiles p2 where p2.sehir = p.sehir)
                and d.push_token is not null and d.push_token <> '') as push_adet
    from profiles p
    where coalesce(p.is_active, true) and not coalesce(p.is_banned, false)
    group by p.sehir
  ) u on u.sehir = i.sehir
  order by coalesce(u.adet,0) desc, i.sehir asc;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) YETKİLER — SADECE service_role                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

revoke all on function admin_list_users(text, text, integer, integer) from public, anon, authenticated;
revoke all on function admin_user_counts() from public, anon, authenticated;
revoke all on function admin_user_full(uuid) from public, anon, authenticated;
revoke all on function admin_ban_user_full(uuid, text, text, text, timestamptz, boolean, text) from public, anon, authenticated;
revoke all on function admin_ban_device(text, text, text, timestamptz, text) from public, anon, authenticated;
revoke all on function admin_unban_user(uuid) from public, anon, authenticated;
revoke all on function admin_unban_record(uuid) from public, anon, authenticated;
revoke all on function admin_list_bans(text, integer) from public, anon, authenticated;
revoke all on function admin_list_devices(text, text, integer) from public, anon, authenticated;
revoke all on function admin_count_push_targets(text[], boolean, boolean, text[], integer) from public, anon, authenticated;
revoke all on function admin_push_targets(text[], boolean, boolean, text[], integer, integer) from public, anon, authenticated;
revoke all on function admin_notify_targets(text[], boolean, boolean, integer) from public, anon, authenticated;
revoke all on function admin_count_notify_targets(text[], boolean, boolean) from public, anon, authenticated;
revoke all on function admin_city_stats() from public, anon, authenticated;

grant execute on function admin_list_users(text, text, integer, integer) to service_role;
grant execute on function admin_user_counts() to service_role;
grant execute on function admin_user_full(uuid) to service_role;
grant execute on function admin_ban_user_full(uuid, text, text, text, timestamptz, boolean, text) to service_role;
grant execute on function admin_ban_device(text, text, text, timestamptz, text) to service_role;
grant execute on function admin_unban_user(uuid) to service_role;
grant execute on function admin_unban_record(uuid) to service_role;
grant execute on function admin_list_bans(text, integer) to service_role;
grant execute on function admin_list_devices(text, text, integer) to service_role;
grant execute on function admin_count_push_targets(text[], boolean, boolean, text[], integer) to service_role;
grant execute on function admin_push_targets(text[], boolean, boolean, text[], integer, integer) to service_role;
grant execute on function admin_notify_targets(text[], boolean, boolean, integer) to service_role;
grant execute on function admin_count_notify_targets(text[], boolean, boolean) to service_role;
grant execute on function admin_city_stats() to service_role;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

with fn as (
  select count(*) as n from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace
  where nn.nspname='public' and p.proname in (
    'admin_list_users','admin_user_counts','admin_user_full',
    'admin_ban_user_full','admin_ban_device','admin_unban_user','admin_unban_record',
    'admin_list_bans','admin_list_devices',
    'admin_count_push_targets','admin_push_targets',
    'admin_notify_targets','admin_count_notify_targets','admin_city_stats')
),
cift as (
  -- ★ Aynı isimden birden fazla sürüm var mı (42725 hatası riski)
  select count(*) as n from (
    select p.proname from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace
    where nn.nspname='public'
      and p.proname in ('admin_count_push_targets','admin_push_targets','admin_ban_user','admin_ban_user_full')
    group by p.proname having count(*) > 1
  ) t
),
iller as (select count(*) as n from admin_city_stats()),
kullanici as (select (admin_user_counts()->>'toplam')::int as n)

select * from (
  select 1 as sira, 'Fonksiyonlar (14 bekleniyor)' as kontrol,
    case when n=14 then '✓ GECTI' else '✗ SORUN' end as sonuc, n::text||'/14' as detay from fn
  union all select 2, 'Cift fonksiyon (0 olmali)',
    case when n=0 then '✓ GECTI' else '✗ SORUN' end,
    case when n=0 then 'tek surum' else n::text||' isimde cift surum — 42725 riski' end from cift
  union all select 3, 'Sehir listesi (81 il)',
    case when n=81 then '✓ GECTI' else '! ' || n::text end, n::text||' il donuyor' from iller
  union all select 4, 'Kullanici sayisi', '✓ BILGI', n::text||' auth kullanicisi' from kullanici
) x order by sira;
