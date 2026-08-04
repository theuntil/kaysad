-- ═══════════════════════════════════════════════════════════════════════
-- KAYS ADMIN PANEL — VERİTABANI KURULUMU
--
-- Panelin çalışması için gereken EK yapılar. Popup sistemi ve bildirim
-- sistemi zaten kurulu olmalı (popups, popup_views, notifications).
--
-- Supabase → SQL Editor'de TEK SEFERDE çalıştır. İdempotent.
--
-- ★ GÜVENLİK: Buradaki tüm fonksiyonlar SADECE service_role'a açık.
--   Panel service_role key'i sunucu tarafında kullanıyor; mobil uygulama
--   bu fonksiyonlara ERİŞEMEZ.
-- ═══════════════════════════════════════════════════════════════════════


/* ═══════════════════════════════════════════════════════════════
   1) AUDIT LOG — kim ne zaman ne yaptı
═══════════════════════════════════════════════════════════════ */

create table if not exists admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,                  -- panel kullanıcı adı
  action text not null,                 -- login | popup_create | broadcast_send ...
  target_type text,                     -- popup | notification | ...
  target_id text,
  detail jsonb,                         -- işleme özgü ek bilgi
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_created on admin_audit_log (created_at desc);
create index if not exists idx_audit_action  on admin_audit_log (action, created_at desc);

-- Client (mobil uygulama) bu tabloya HİÇ erişmemeli
alter table admin_audit_log enable row level security;
-- Politika YOK → RLS altında hiçbir client okuyamaz/yazamaz.
-- service_role RLS'i bypass ettiği için panel sorunsuz çalışır.
revoke all on admin_audit_log from anon;
revoke all on admin_audit_log from authenticated;


/* ═══════════════════════════════════════════════════════════════
   2) BROADCAST ALICI SAYIMI (kuru çalıştırma / dry-run)
   ★ "Bu bildirimi gönderirsem kaç kişiye gidecek?" — göndermeden önce
     panelde göstermek için. Yanlışlıkla 50.000 kişiye spam atmayı
     önleyen en önemli güvenlik önlemi.
═══════════════════════════════════════════════════════════════ */

drop function if exists admin_count_broadcast_recipients(text[], boolean, boolean);

create or replace function admin_count_broadcast_recipients(
  p_cities text[] default null,
  p_students_only boolean default false,
  p_only_active boolean default true
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  select count(*) into v_count
  from profiles p
  where
    (p_only_active = false or (
      coalesce(p.is_active, true) = true
      and coalesce(p.is_banned, false) = false
    ))
    and (p_cities is null or p.sehir = any(p_cities))
    and (p_students_only = false or coalesce(p.ogrenci, false) = true);

  return coalesce(v_count, 0);
end;
$$;

revoke all on function admin_count_broadcast_recipients(text[], boolean, boolean) from public;
revoke all on function admin_count_broadcast_recipients(text[], boolean, boolean) from anon;
revoke all on function admin_count_broadcast_recipients(text[], boolean, boolean) from authenticated;
grant execute on function admin_count_broadcast_recipients(text[], boolean, boolean) to service_role;


/* ═══════════════════════════════════════════════════════════════
   3) BROADCAST GÖNDER — promo / earthquake / popup
   ★ Tek fonksiyon üç tipi de yönetiyor. popup tipinde p_popup_id
     zorunlu; diğerlerinde kullanılmaz.
═══════════════════════════════════════════════════════════════ */

drop function if exists admin_send_broadcast(text, text, uuid, text[], boolean, boolean);

create or replace function admin_send_broadcast(
  p_type text,                           -- 'promo' | 'earthquake' | 'popup'
  p_message text,
  p_popup_id uuid default null,          -- sadece p_type='popup' için
  p_cities text[] default null,
  p_students_only boolean default false,
  p_only_active boolean default true
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_type text;
  v_entity_id uuid;
  v_message text;
  v_count integer;
begin
  if p_type not in ('promo', 'earthquake', 'popup') then
    raise exception 'Gecersiz broadcast tipi: %. Sadece promo, earthquake veya popup.', p_type;
  end if;

  -- popup tipinde popup kaydı doğrulanır
  if p_type = 'popup' then
    if p_popup_id is null then
      raise exception 'popup tipinde p_popup_id zorunludur.';
    end if;
    if not exists (select 1 from popups where id = p_popup_id) then
      raise exception 'Popup bulunamadi: %', p_popup_id;
    end if;
    v_entity_type := 'popup';
    v_entity_id := p_popup_id;
    -- Mesaj verilmemişse popup başlığını kullan
    select coalesce(nullif(trim(coalesce(p_message, '')), ''), title)
      into v_message from popups where id = p_popup_id;
  else
    v_entity_type := case when p_type = 'promo' then 'promotion' else 'system' end;
    v_entity_id := null;
    v_message := nullif(trim(coalesce(p_message, '')), '');
    if v_message is null then
      raise exception 'Mesaj bos olamaz.';
    end if;
  end if;

  insert into notifications (
    recipient_id, actor_id, type, entity_type, entity_id, message, is_read
  )
  select p.id, null, p_type, v_entity_type, v_entity_id, v_message, false
  from profiles p
  where
    (p_only_active = false or (
      coalesce(p.is_active, true) = true
      and coalesce(p.is_banned, false) = false
    ))
    and (p_cities is null or p.sehir = any(p_cities))
    and (p_students_only = false or coalesce(p.ogrenci, false) = true);

  get diagnostics v_count = row_count;

  return json_build_object(
    'gonderilen', v_count,
    'tip', p_type,
    'mesaj', v_message,
    'popup_id', v_entity_id
  );
end;
$$;

revoke all on function admin_send_broadcast(text, text, uuid, text[], boolean, boolean) from public;
revoke all on function admin_send_broadcast(text, text, uuid, text[], boolean, boolean) from anon;
revoke all on function admin_send_broadcast(text, text, uuid, text[], boolean, boolean) from authenticated;
grant execute on function admin_send_broadcast(text, text, uuid, text[], boolean, boolean) to service_role;


/* ═══════════════════════════════════════════════════════════════
   4) BROADCAST GERİ AL
   ★ Yanlış gönderilen duyuruyu, kullanıcılar görmeden silebilmek için.
═══════════════════════════════════════════════════════════════ */

drop function if exists admin_undo_broadcast(text, text, integer);

create or replace function admin_undo_broadcast(
  p_type text,
  p_message text,
  p_within_minutes integer default 60
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if p_type not in ('promo', 'earthquake', 'popup') then
    raise exception 'Gecersiz tip: %', p_type;
  end if;

  delete from notifications
  where type = p_type
    and message = p_message
    and created_at > now() - make_interval(mins => greatest(1, p_within_minutes));

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function admin_undo_broadcast(text, text, integer) from public;
revoke all on function admin_undo_broadcast(text, text, integer) from anon;
revoke all on function admin_undo_broadcast(text, text, integer) from authenticated;
grant execute on function admin_undo_broadcast(text, text, integer) to service_role;


/* ═══════════════════════════════════════════════════════════════
   5) GÖNDERİLMİŞ BROADCAST'LERİN ÖZETİ
   ★ Panelde "son gönderilenler" listesi için. Aynı mesaj binlerce
     satır oluşturduğu için gruplayıp tek satır gösteriyoruz.
═══════════════════════════════════════════════════════════════ */

drop function if exists admin_list_broadcasts(integer);

create or replace function admin_list_broadcasts(p_limit integer default 50)
returns table (
  type text,
  message text,
  entity_id uuid,
  gonderilen bigint,
  okunan bigint,
  ilk_gonderim timestamptz,
  son_gonderim timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    n.type,
    n.message,
    n.entity_id,
    count(*)                                   as gonderilen,
    count(*) filter (where n.is_read)          as okunan,
    min(n.created_at)                          as ilk_gonderim,
    max(n.created_at)                          as son_gonderim
  from notifications n
  where n.type in ('promo', 'earthquake', 'popup')
  group by n.type, n.message, n.entity_id
  order by max(n.created_at) desc
  limit greatest(1, coalesce(p_limit, 50));
$$;

revoke all on function admin_list_broadcasts(integer) from public;
revoke all on function admin_list_broadcasts(integer) from anon;
revoke all on function admin_list_broadcasts(integer) from authenticated;
grant execute on function admin_list_broadcasts(integer) to service_role;


/* ═══════════════════════════════════════════════════════════════
   6) BİLDİRİM İSTATİSTİKLERİ — dashboard için
═══════════════════════════════════════════════════════════════ */

drop function if exists admin_notification_stats();

create or replace function admin_notification_stats()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'toplam',            (select count(*) from notifications),
    'okunmamis',         (select count(*) from notifications where is_read = false),
    'son_24_saat',       (select count(*) from notifications where created_at > now() - interval '24 hours'),
    'son_7_gun',         (select count(*) from notifications where created_at > now() - interval '7 days'),
    'tip_dagilimi',      (
      select coalesce(json_agg(t), '[]'::json) from (
        select type, count(*) as adet
        from notifications
        group by type
        order by count(*) desc
        limit 20
      ) t
    ),
    'kullanici_sayisi',  (select count(*) from profiles where coalesce(is_active, true) = true and coalesce(is_banned,false) = false)
  );
$$;

revoke all on function admin_notification_stats() from public;
revoke all on function admin_notification_stats() from anon;
revoke all on function admin_notification_stats() from authenticated;
grant execute on function admin_notification_stats() to service_role;


/* ═══════════════════════════════════════════════════════════════
   7) POPUP GÖSTERİM GEÇMİŞİNİ SIFIRLA (yeniden yayın / test)
═══════════════════════════════════════════════════════════════ */

drop function if exists admin_reset_popup_views(uuid);

create or replace function admin_reset_popup_views(p_popup_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  delete from popup_views where popup_id = p_popup_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function admin_reset_popup_views(uuid) from public;
revoke all on function admin_reset_popup_views(uuid) from anon;
revoke all on function admin_reset_popup_views(uuid) from authenticated;
grant execute on function admin_reset_popup_views(uuid) to service_role;


/* ═══════════════════════════════════════════════════════════════
   8) ŞEHİR LİSTESİ — hedefleme formunda gerçek verilerle çalışmak için
   ★ Elle yazılmış 81 il listesi yerine, VERİTABANINDA GERÇEKTEN
     bulunan şehirleri ve kullanıcı sayılarını döndürür. Böylece
     "Kayseri" yazıp da eşleşmeme hatası yapmazsın.
═══════════════════════════════════════════════════════════════ */

drop function if exists admin_city_distribution();

create or replace function admin_city_distribution()
returns table (sehir text, kullanici_sayisi bigint)
language sql
security definer
set search_path = public
as $$
  select p.sehir, count(*) as kullanici_sayisi
  from profiles p
  where p.sehir is not null
    and coalesce(p.is_active, true) = true
    and coalesce(p.is_banned, false) = false
  group by p.sehir
  order by count(*) desc, p.sehir asc;
$$;

revoke all on function admin_city_distribution() from public;
revoke all on function admin_city_distribution() from anon;
revoke all on function admin_city_distribution() from authenticated;
grant execute on function admin_city_distribution() to service_role;


/* ═══════════════════════════════════════════════════════════════
   ✅ KURULUM BİTTİ — DOĞRULAMA
═══════════════════════════════════════════════════════════════ */

-- Fonksiyonlar tek sürüm mü? (her isimden 1 satır olmalı)
select
  p.proname as fonksiyon,
  pg_get_function_identity_arguments(p.oid) as parametreler
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'admin_count_broadcast_recipients',
    'admin_send_broadcast',
    'admin_undo_broadcast',
    'admin_list_broadcasts',
    'admin_notification_stats',
    'admin_reset_popup_views',
    'admin_city_distribution'
  )
order by p.proname;

-- Audit tablosu var mı?
select count(*) as audit_kayit_sayisi from admin_audit_log;
