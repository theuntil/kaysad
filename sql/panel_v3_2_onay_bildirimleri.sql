-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V3.2 — ONAY BİLDİRİMLERİ
--
-- ┌─ NE YAPIYOR ──────────────────────────────────────────────────────┐
-- │ 1. notifications.type kısıtını GENİŞLETİR (silmez) — yeni onay      │
-- │    tipleri eklenebilsin                                            │
-- │ 2. push_settings'e onay tipleri eklenir (başlıklarıyla)            │
-- │ 3. admin_notify_user() — panelden tek kullanıcıya bildirim          │
-- │ 4. admin_set_student / admin_set_business artık karar verildiğinde  │
-- │    OTOMATİK bildirim düşürüyor (onay ve red, sebebiyle)            │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v3_1_duzeltmeler.sql'den SONRA çalıştır. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) notifications.type KISITINI GENİŞLET                           ║
-- ║                                                                    ║
-- ║  Mevcut kısıtı SİLMİYORUZ — "eski kısıt VEYA yeni tipler" haline    ║
-- ║  getiriyoruz. Böylece uygulamanın beklediği tipler aynen geçerli    ║
-- ║  kalıyor, sadece dört yeni tip ekleniyor.                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare
  v_name text;
  v_def  text;
  v_expr text;
  v_new  text := $q$type = any (array['business_approved','business_rejected','student_approved','student_rejected'])$q$;
begin
  select c.conname, pg_get_constraintdef(c.oid)
  into v_name, v_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'notifications'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%type%'
  limit 1;

  if v_name is null then
    raise notice 'notifications.type uzerinde check kisiti yok — ek gerekmiyor';
    return;
  end if;

  -- Yeni tipler zaten kapsanıyorsa dokunma
  if v_def ilike '%business_approved%' then
    raise notice 'kisit zaten guncel: %', v_name;
    return;
  end if;

  -- "CHECK (ifade)" -> sadece ifadeyi al
  v_expr := regexp_replace(v_def, '^CHECK\s*\((.*)\)$', '\1');

  execute format('alter table notifications drop constraint %I', v_name);
  execute format('alter table notifications add constraint %I check ((%s) or (%s))',
                 v_name, v_expr, v_new);

  raise notice 'kisit genisletildi: %', v_name;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) PUSH AYARLARI — onay tipleri                                   ║
-- ║                                                                    ║
-- ║  Bu satırlar olmadan admin_pending_push bildirimleri alamaz         ║
-- ║  (push_settings ile INNER JOIN yapıyor) ve push hiç gitmez.         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

insert into push_settings (type, enabled, title_template, bypass_quiet, collapse_window_sec, sort_order) values
  ('business_approved', true, 'İşletme hesabın onaylandı', false, null, 240),
  ('business_rejected', true, 'İşletme başvurun',          false, null, 241),
  ('student_approved',  true, 'Öğrenci doğrulaman tamam',  false, null, 242),
  ('student_rejected',  true, 'Öğrenci başvurun',          false, null, 243)
on conflict (type) do nothing;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) TEK KULLANICIYA BİLDİRİM                                       ║
-- ║                                                                    ║
-- ║  push_status = 'pending' → normal push akışı devralır.             ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_notify_user(uuid, text, text, text, uuid, boolean);

create or replace function admin_notify_user(
  p_user_id uuid,
  p_type text,
  p_message text,
  p_entity_type text default 'system',
  p_entity_id uuid default null,
  p_push boolean default true
) returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_user_id is null then raise exception 'user_id zorunlu'; end if;
  if nullif(trim(coalesce(p_message,'')), '') is null then
    raise exception 'Mesaj bos olamaz';
  end if;

  insert into notifications (
    recipient_id, actor_id, type, entity_type, entity_id, message, is_read,
    push_status, push_error
  ) values (
    p_user_id, null, p_type, p_entity_type, p_entity_id, trim(p_message), false,
    case when p_push then 'pending' else 'skipped' end,
    case when p_push then null else 'panel: sadece uygulama ici' end
  )
  returning id into v_id;

  return json_build_object('id', v_id, 'tip', p_type, 'push', p_push);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) ONAY FONKSİYONLARI — karar verilince BİLDİRİM DÜŞER            ║
-- ║                                                                    ║
-- ║  Bildirim aynı işlem içinde atılıyor: onay verildi ama bildirim     ║
-- ║  gitmedi diye bir ara durum oluşmuyor.                              ║
-- ║  ★ Bildirim eklemek onayı ASLA engellemez — hata olursa yutulur.    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function admin_set_business(
  p_user_id uuid,
  p_approved boolean,
  p_reject_reason text default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_row profiles;
  v_msg text;
begin
  if p_approved then
    update profiles set
      role                = 'business',
      business_durum      = 'approved',
      business_onay_tarih = now(),
      business_red        = null,
      updated_at          = now()
    where id = p_user_id
    returning * into v_row;
  else
    update profiles set
      role                = case when role = 'business' then 'user' else role end,
      business_durum      = 'rejected',
      business_onay_tarih = null,
      business_red        = nullif(trim(coalesce(p_reject_reason, '')), ''),
      updated_at          = now()
    where id = p_user_id
    returning * into v_row;
  end if;

  if v_row.id is null then
    raise exception 'Kullanici bulunamadi: %', p_user_id;
  end if;

  -- ── Bildirim ──
  begin
    if p_approved then
      v_msg := 'İşletme hesabın onaylandı. Artık işletme özelliklerini kullanabilirsin.';
      perform admin_notify_user(p_user_id, 'business_approved', v_msg, 'profile', p_user_id, true);
    else
      v_msg := coalesce(
        'İşletme başvurun onaylanmadı: ' || nullif(trim(coalesce(p_reject_reason,'')), ''),
        'İşletme başvurun onaylanmadı. Bilgilerini güncelleyip tekrar başvurabilirsin.');
      perform admin_notify_user(p_user_id, 'business_rejected', v_msg, 'profile', p_user_id, true);
    end if;
  exception when others then
    raise notice 'bildirim olusturulamadi (onay yine kaydedildi): %', sqlerrm;
  end;

  return json_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'role', v_row.role,
    'business_durum', v_row.business_durum,
    'business_red', v_row.business_red,
    'business_count', v_row.business_count,
    'bildirim', true
  );
end;
$$;


create or replace function admin_set_student(
  p_user_id uuid, p_approved boolean, p_reject_reason text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_row profiles;
  v_msg text;
begin
  if p_approved then
    update profiles set
      ogrenci = true, ogrenci_durum = 'approved',
      ogrenci_tarih = now(), ogrenci_red_sebep = null, updated_at = now()
    where id = p_user_id returning * into v_row;
  else
    update profiles set
      ogrenci = false, ogrenci_durum = 'rejected',
      ogrenci_tarih = null,
      ogrenci_red_sebep = nullif(trim(coalesce(p_reject_reason, '')), ''),
      updated_at = now()
    where id = p_user_id returning * into v_row;
  end if;

  if v_row.id is null then raise exception 'Kullanici bulunamadi: %', p_user_id; end if;

  begin
    if p_approved then
      v_msg := 'Öğrenci doğrulaman tamamlandı. Öğrenci indirimleri artık senin için açık.';
      perform admin_notify_user(p_user_id, 'student_approved', v_msg, 'profile', p_user_id, true);
    else
      v_msg := coalesce(
        'Öğrenci başvurun onaylanmadı: ' || nullif(trim(coalesce(p_reject_reason,'')), ''),
        'Öğrenci başvurun onaylanmadı. Belgeni güncelleyip tekrar başvurabilirsin.');
      perform admin_notify_user(p_user_id, 'student_rejected', v_msg, 'profile', p_user_id, true);
    end if;
  exception when others then
    raise notice 'bildirim olusturulamadi (karar yine kaydedildi): %', sqlerrm;
  end;

  return json_build_object('id', v_row.id, 'username', v_row.username,
                           'ogrenci', v_row.ogrenci, 'ogrenci_durum', v_row.ogrenci_durum,
                           'bildirim', true);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) YETKİLER                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_notify_user','admin_set_business','admin_set_student')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- 1) Yeni tipler push_settings'te mi?
select type, enabled, title_template from push_settings
where type in ('business_approved','business_rejected','student_approved','student_rejected')
order by type;

-- 2) Kısıt yeni tipleri kapsıyor mu? (hata vermezse kapsıyor)
do $$
begin
  perform 1;
  begin
    insert into notifications (recipient_id, type, entity_type, message, push_status)
    select id, 'student_approved', 'system', 'kisit testi', 'skipped'
    from profiles limit 1;
    delete from notifications where message = 'kisit testi';
    raise notice 'KISIT TESTI: OK — yeni tipler yazilabiliyor';
  exception when others then
    raise notice 'KISIT TESTI BASARISIZ: %', sqlerrm;
  end;
end $$;

-- 3) admin_push_targets imzası (panel bu imzayı çağırıyor)
select p.proname, pg_get_function_identity_arguments(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname in ('admin_push_targets','admin_count_push_targets')
order by 1;
