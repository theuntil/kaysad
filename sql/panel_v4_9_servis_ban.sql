-- ═══════════════════════════════════════════════════════════════════════
-- SERVİSLER İÇİN BAN KONTROLÜ
--
-- ┌─ NEDEN AYRI FONKSİYON ────────────────────────────────────────────┐
-- │ Mevcut check_access() auth.uid() kullanıyor — yani çağıranın       │
-- │ oturumuna bakıyor. Mail/telefon servisleri service_role ile        │
-- │ bağlanıyor ve auth.uid() NULL dönüyor; kullanıcı kimliğini kendi   │
-- │ doğruladıkları token'dan biliyorlar.                               │
-- │                                                                    │
-- │ Bu yüzden üç parametreyi de DIŞARIDAN alan bir fonksiyon gerekli.  │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v4_8_reklam_anahtari.sql'den SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  BAN DURUMU — kullanıcı + cihaz + IP birlikte                      ║
-- ║                                                                    ║
-- ║  Üçünden HERHANGİ BİRİ banlıysa erişim reddediliyor.                ║
-- ║  Hangisinin banlı olduğu ayrı ayrı dönüyor ki servis loga           ║
-- ║  düzgün sebep yazabilsin.                                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists check_ban_status(uuid, text, text);

create or replace function check_ban_status(
  p_user_id uuid default null,
  p_device_id text default null,
  p_ip text default null
) returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_user_banned boolean := false;
  v_device_banned boolean := false;
  v_ip_banned boolean := false;
  v_reason text;
  v_until timestamptz;
begin
  /* ── KULLANICI ── */
  if p_user_id is not null then
    -- Hem profil bayrağı hem aktif ban kaydı kontrol ediliyor:
    -- ikisi ayrı düşmüş olabilir, güvenli taraf "banlı" kabul etmek.
    select
      coalesce(p.is_banned, false)
      or exists (
        select 1 from bans b
        where b.user_id = p_user_id
          and coalesce(b.is_active, true)
          and (b.until_at is null or b.until_at > now())
      )
    into v_user_banned
    from profiles p where p.id = p_user_id;

    v_user_banned := coalesce(v_user_banned, false);

    if v_user_banned then
      select b.reason, b.until_at into v_reason, v_until
      from bans b
      where b.user_id = p_user_id
        and coalesce(b.is_active, true)
        and (b.until_at is null or b.until_at > now())
      order by b.created_at desc limit 1;
    end if;
  end if;

  /* ── CİHAZ ── */
  if nullif(trim(coalesce(p_device_id, '')), '') is not null then
    v_device_banned := coalesce(is_device_banned(trim(p_device_id)), false);

    if v_device_banned and v_reason is null then
      select b.reason, b.until_at into v_reason, v_until
      from bans b
      where coalesce(b.is_active, true)
        and (b.until_at is null or b.until_at > now())
        and (b.device_id = trim(p_device_id)
             or (b.device_ids is not null and trim(p_device_id) = any(b.device_ids)))
      order by b.created_at desc limit 1;
    end if;
  end if;

  /* ── IP ── */
  if nullif(trim(coalesce(p_ip, '')), '') is not null then
    v_ip_banned := coalesce(is_ip_banned(trim(p_ip)), false);

    if v_ip_banned and v_reason is null then
      select b.reason, b.until_at into v_reason, v_until
      from bans b
      where coalesce(b.is_active, true)
        and (b.until_at is null or b.until_at > now())
        and (b.ip = trim(p_ip)
             or (b.ips is not null and trim(p_ip) = any(b.ips)))
      order by b.created_at desc limit 1;
    end if;
  end if;

  return json_build_object(
    'banned', (v_user_banned or v_device_banned or v_ip_banned),
    'user_banned', v_user_banned,
    'device_banned', v_device_banned,
    'ip_banned', v_ip_banned,
    'reason', v_reason,
    'until', v_until,
    -- Servisin kullanıcıya göstereceği mesaj
    'message', case
      when v_user_banned then 'Hesabınız askıya alınmıştır.'
      when v_device_banned then 'Bu cihazdan işlem yapılamaz.'
      when v_ip_banned then 'Bu ağdan işlem yapılamaz.'
      else null end
  );
end;
$$;

revoke all on function check_ban_status(uuid, text, text) from public, anon;
grant execute on function check_ban_status(uuid, text, text) to service_role, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  CİHAZ/IP KAYDI — servis gördüğü IP'yi bildirsin                   ║
-- ║                                                                    ║
-- ║  ★ Böylece bir kullanıcı banlandığında hangi IP'lerden geldiği      ║
-- ║    panelde görünüyor ve IP banı verilebiliyor.                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists service_record_ip(uuid, text, text);

create or replace function service_record_ip(
  p_user_id uuid,
  p_device_id text default null,
  p_ip text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id is null then return; end if;
  if nullif(trim(coalesce(p_ip, '')), '') is null then return; end if;

  -- Cihaz kimliği varsa o satırı güncelle
  if nullif(trim(coalesce(p_device_id, '')), '') is not null then
    update devices
    set ip = trim(p_ip), ip_updated_at = now()
    where device_id = trim(p_device_id) and user_id = p_user_id;

    if found then return; end if;
  end if;

  -- Cihaz kimliği yoksa kullanıcının en son cihazını güncelle
  update devices
  set ip = trim(p_ip), ip_updated_at = now()
  where device_id = (
    select d.device_id from devices d
    where d.user_id = p_user_id
    order by d.last_login_at desc nulls last limit 1
  );
exception when others then
  -- IP kaydı kritik değil; hata doğrulama akışını bozmasın
  null;
end;
$$;

revoke all on function service_record_ip(uuid, text, text) from public, anon;
grant execute on function service_record_ip(uuid, text, text) to service_role;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Banlı olmayan biri
select check_ban_status(null, 'test-cihaz', '1.2.3.4') as temiz;

-- Gerçek banlı kayıt varsa test et
select check_ban_status(
  (select user_id from bans where user_id is not null
     and coalesce(is_active,true) limit 1),
  null, null
) as banli_ornek;
