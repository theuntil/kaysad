-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V3 — BİRLEŞİK GÖNDERİM (Bildirim + Push tek yerde)
--
-- ┌─ NEDEN ────────────────────────────────────────────────────────────┐
-- │ Eskiden iki ayrı sayfa vardı:                                      │
-- │   • /notifications → notifications tablosuna satır atıyordu        │
-- │   • /push          → doğrudan Expo'ya push atıyordu                │
-- │ Aynı işin iki yüzü. Artık tek fonksiyon, tek "kanal" anahtarı:     │
-- │   'both'  → uygulama içi bildirim + push  (varsayılan)            │
-- │   'inapp' → SADECE uygulama içi (push_status = 'skipped')          │
-- │   'push'  → SADECE push (notifications'a HİÇ satır atılmaz;        │
-- │             panel admin_push_targets ile doğrudan gönderir)        │
-- └────────────────────────────────────────────────────────────────────┘
--
-- ┌─ ÖNEMLİ ───────────────────────────────────────────────────────────┐
-- │ 'inapp' kanalında satır push_status='skipped' olarak açılır.        │
-- │ Böylece ne trg_notifications_push dispatch'i, ne push_sweep_tick    │
-- │ onu alır — telefonda hiçbir şey çalmaz, sadece zil ikonunda görünür.│
-- └────────────────────────────────────────────────────────────────────┘
--
-- ★ Tek seferde çalıştır. İdempotent. panel_v3_veritabani.sql'den SONRA.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) ALICI SAYIMI (işletme filtresi dahil)                          ║
-- ║                                                                    ║
-- ║  Tek çağrıda hem uygulama içi hem push alıcı sayısı. Panel bunu     ║
-- ║  "Gönder" butonunu açmadan önce göstermek zorunda.                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_send_preview(text[], boolean, boolean, boolean, text[], integer);

create or replace function admin_send_preview(
  p_cities text[] default null,
  p_students_only boolean default false,
  p_business_only boolean default false,
  p_only_active boolean default true,
  p_platforms text[] default null,
  p_active_days integer default null
) returns json
language sql security definer set search_path = public as $$
  with kitle as (
    select p.id
    from profiles p
    where (p_only_active = false or (
            coalesce(p.is_active, true) = true
            and coalesce(p.is_banned, false) = false))
      and (p_cities is null or p.sehir = any(p_cities))
      and (p_students_only = false or coalesce(p.ogrenci, false) = true)
      and (p_business_only = false or p.role = 'business')
  ),
  cihaz as (
    select d.user_id, d.device_id
    from devices d
    join kitle k on k.id = d.user_id
    where d.push_token is not null and d.push_token <> ''
      and coalesce(d.push_enabled, true) = true
      and (p_platforms is null or d.platform = any(p_platforms))
      and (p_active_days is null
           or d.last_login_at > now() - make_interval(days => p_active_days))
  )
  select json_build_object(
    -- Uygulama içi bildirim kaç kişiye düşer
    'kullanici',        (select count(*) from kitle),
    -- Bu kitlenin kaçının push alabilen cihazı var
    'push_kullanici',   (select count(distinct user_id) from cihaz),
    'push_cihaz',       (select count(*) from cihaz),
    -- Push açık mı, sessiz saatte miyiz (panelde uyarı göstermek için)
    'push_acik',        (coalesce(app_setting('push_enabled'), 'true') = 'true'),
    'sessiz_saat',      push_in_quiet_hours()
  );
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) BİRLEŞİK GÖNDERİM                                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_send_v3(text, text, text, uuid, text[], boolean, boolean, boolean);

create or replace function admin_send_v3(
  p_type text,                            -- promo | earthquake | popup
  p_message text,
  p_channel text default 'both',          -- both | inapp | push
  p_popup_id uuid default null,
  p_cities text[] default null,
  p_students_only boolean default false,
  p_business_only boolean default false,
  p_only_active boolean default true
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_entity_type text;
  v_entity_id   uuid;
  v_message     text;
  v_count       integer := 0;
  v_push_status text;
  v_batch       uuid := gen_random_uuid();
begin
  if p_type not in ('promo', 'earthquake', 'popup') then
    raise exception 'Gecersiz gonderim tipi: %. Sadece promo, earthquake veya popup.', p_type;
  end if;

  if coalesce(p_channel, 'both') not in ('both', 'inapp', 'push') then
    raise exception 'Gecersiz kanal: %. Sadece both, inapp veya push.', p_channel;
  end if;

  -- ── Mesaj / hedef içerik çözümlemesi ──
  if p_type = 'popup' then
    if p_popup_id is null then
      raise exception 'popup tipinde p_popup_id zorunludur.';
    end if;
    if not exists (select 1 from popups where id = p_popup_id) then
      raise exception 'Popup bulunamadi: %', p_popup_id;
    end if;
    v_entity_type := 'popup';
    v_entity_id   := p_popup_id;
    select coalesce(nullif(trim(coalesce(p_message, '')), ''), title)
      into v_message from popups where id = p_popup_id;
  else
    v_entity_type := case when p_type = 'promo' then 'promotion' else 'system' end;
    v_entity_id   := null;
    v_message     := nullif(trim(coalesce(p_message, '')), '');
    if v_message is null then
      raise exception 'Mesaj bos olamaz.';
    end if;
  end if;

  -- ── SADECE PUSH: notifications'a dokunmuyoruz ──
  --    Panel bu sonucu görüp admin_push_targets ile kendi gönderir.
  if p_channel = 'push' then
    return json_build_object(
      'kanal',        'push',
      'gonderilen',   0,
      'tip',          p_type,
      'mesaj',        v_message,
      'popup_id',     v_entity_id,
      'batch_id',     v_batch,
      'not',          'Uygulama ici bildirim olusturulmadi; push panel tarafindan gonderilir.'
    );
  end if;

  -- 'both'  → pending  (dispatch/sweep push'u gönderir)
  -- 'inapp' → skipped  (hiçbir push mekanizması dokunmaz)
  v_push_status := case when p_channel = 'inapp' then 'skipped' else 'pending' end;

  insert into notifications (
    recipient_id, actor_id, type, entity_type, entity_id, message, is_read,
    push_status, push_error
  )
  select p.id, null, p_type, v_entity_type, v_entity_id, v_message, false,
         v_push_status,
         case when p_channel = 'inapp' then 'panel: sadece uygulama ici' else null end
  from profiles p
  where (p_only_active = false or (
          coalesce(p.is_active, true) = true
          and coalesce(p.is_banned, false) = false))
    and (p_cities is null or p.sehir = any(p_cities))
    and (p_students_only = false or coalesce(p.ogrenci, false) = true)
    and (p_business_only = false or p.role = 'business');

  get diagnostics v_count = row_count;

  return json_build_object(
    'kanal',      p_channel,
    'gonderilen', v_count,
    'tip',        p_type,
    'mesaj',      v_message,
    'popup_id',   v_entity_id,
    'batch_id',   v_batch
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) GERİ AL — kanal farkını da temizler                            ║
-- ║                                                                    ║
-- ║  Eski admin_undo_broadcast duruyor; bu sürüm 'skipped' satırları    ║
-- ║  da siliyor ve kaç tanesinin push'unun çıktığını söylüyor.          ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_undo_send_v3(text, text, integer);

create or replace function admin_undo_send_v3(
  p_type text,
  p_message text,
  p_within_minutes integer default 60
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_pushed  integer := 0;
  v_deleted integer := 0;
begin
  if p_type not in ('promo', 'earthquake', 'popup') then
    raise exception 'Gecersiz tip: %', p_type;
  end if;

  -- Kaç tanesinin push'u çıkmış? (Geri alsak da telefonda göründü.)
  select count(*) into v_pushed
  from notifications
  where type = p_type and message = p_message
    and push_status = 'sent'
    and created_at > now() - make_interval(mins => greatest(1, p_within_minutes));

  delete from notifications
  where type = p_type and message = p_message
    and created_at > now() - make_interval(mins => greatest(1, p_within_minutes));

  get diagnostics v_deleted = row_count;

  return json_build_object(
    'silinen',      v_deleted,
    -- ★ Bu sayı > 0 ise panel kullanıcıyı uyarmalı: push telefonda göründü,
    --   silmek onu geri almıyor — sadece uygulama içindeki satır gitti.
    'push_cikmis',  v_pushed
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) GÖNDERİM GEÇMİŞİ — kanal bilgisiyle                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_list_sends(integer);

create or replace function admin_list_sends(p_limit integer default 50)
returns table (
  type        text,
  message     text,
  entity_type text,
  entity_id   uuid,
  adet        bigint,
  okunan      bigint,
  push_sent   bigint,
  push_failed bigint,
  push_skip   bigint,
  kanal       text,
  ilk         timestamptz,
  son         timestamptz
)
language sql security definer set search_path = public as $$
  select
    n.type::text,
    n.message,
    n.entity_type::text,
    n.entity_id,
    count(*)                                                      as adet,
    count(*) filter (where n.is_read)                             as okunan,
    count(*) filter (where n.push_status = 'sent')                 as push_sent,
    count(*) filter (where n.push_status = 'failed')               as push_failed,
    count(*) filter (where n.push_status = 'skipped')              as push_skip,
    case
      when count(*) filter (where n.push_status in ('sent','pending','failed')) = 0
        then 'inapp'
      else 'both'
    end                                                           as kanal,
    min(n.created_at)                                             as ilk,
    max(n.created_at)                                             as son
  from notifications n
  where n.type in ('promo', 'earthquake', 'popup')
  group by n.type, n.message, n.entity_type, n.entity_id
  order by max(n.created_at) desc
  limit greatest(1, least(200, coalesce(p_limit, 50)));
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) YETKİLER — SADECE service_role                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

revoke all on function admin_send_preview(text[], boolean, boolean, boolean, text[], integer) from public, anon, authenticated;
revoke all on function admin_send_v3(text, text, text, uuid, text[], boolean, boolean, boolean) from public, anon, authenticated;
revoke all on function admin_undo_send_v3(text, text, integer) from public, anon, authenticated;
revoke all on function admin_list_sends(integer) from public, anon, authenticated;

grant execute on function admin_send_preview(text[], boolean, boolean, boolean, text[], integer) to service_role;
grant execute on function admin_send_v3(text, text, text, uuid, text[], boolean, boolean, boolean) to service_role;
grant execute on function admin_undo_send_v3(text, text, integer) to service_role;
grant execute on function admin_list_sends(integer) to service_role;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select
  p.proname as fonksiyon,
  case when has_function_privilege('service_role', p.oid, 'execute')
       then 'service_role: OK' else 'YETKI YOK' end as yetki
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('admin_send_preview', 'admin_send_v3',
                    'admin_undo_send_v3', 'admin_list_sends')
order by p.proname;
