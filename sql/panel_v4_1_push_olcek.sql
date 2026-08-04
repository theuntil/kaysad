-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V4.1 — PUSH ÖLÇEKLENDİRME + OTOMATİK TEMİZLİK
--
-- ┌─ ÇÖZÜLEN ASIL SORUN ──────────────────────────────────────────────┐
-- │ Eski trigger `for each row` idi. 500.000 kişilik bir duyuruda tek  │
-- │ INSERT 500.000 satır yazıyor ve trigger HER SATIR İÇİN ayrı bir    │
-- │ HTTP isteği kuyruğa atıyordu. pg_net kuyruğu doluyor, panel aynı   │
-- │ işi 500.000 kez tekrar ediyordu.                                   │
-- │                                                                    │
-- │ ÇÖZÜM: `for each statement` — bir INSERT = BİR uyandırma isteği.   │
-- │ Panel uyanıp kuyruğu toplu işliyor. 1 satır da yazılsa 500.000 de, │
-- │ veritabanı tarafındaki maliyet aynı.                               │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v3_6'dan SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) KUYRUK İNDEKSİ                                                 ║
-- ║                                                                    ║
-- ║  Kuyruk sorgusu `where push_status='pending'` ile çalışıyor.        ║
-- ║  Kısmi indeks: 10 milyon satırlık tabloda sadece bekleyenleri       ║
-- ║  indeksliyor — indeks küçük kalıyor, tarama anlık.                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create index if not exists idx_notifications_pending
  on notifications (created_at)
  where push_status = 'pending';

create index if not exists idx_notifications_recipient_created
  on notifications (recipient_id, created_at desc);

create index if not exists idx_notifications_push_status
  on notifications (push_status, created_at);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) STATEMENT-LEVEL TETİKLEYİCİ                                    ║
-- ║                                                                    ║
-- ║  ★ Uyandırma isteği "şu bildirimi gönder" demiyor artık; sadece     ║
-- ║    "kuyrukta iş var, uyan" diyor. Panel kuyruğu kendisi çekiyor.    ║
-- ║    Böylece 1 satır ile 500.000 satır arasında fark kalmıyor.        ║
-- ║                                                                    ║
-- ║  ★ DEBOUNCE: aynı saniye içinde ikinci bir uyandırma atılmıyor.     ║
-- ║    Yoğun anlarda (saniyede 50 beğeni) panel 50 kez değil 1 kez      ║
-- ║    uyanıyor; zaten tek turda hepsini işliyor.                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists push_wake_log (
  id smallint primary key default 1,
  last_wake timestamptz,
  wake_count bigint default 0,
  constraint push_wake_single check (id = 1)
);

insert into push_wake_log (id, last_wake, wake_count)
values (1, null, 0) on conflict (id) do nothing;

drop function if exists push_wake_panel(boolean);

create or replace function push_wake_panel(p_force boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_url text;
  v_secret text;
  v_last timestamptz;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    return false;
  end if;

  if coalesce(app_setting('push_enabled'), 'true') <> 'true' then
    return false;
  end if;

  v_url := nullif(trim(coalesce(app_setting('push_panel_url'), '')), '');
  v_secret := nullif(trim(coalesce(app_setting('push_webhook_secret'), '')), '');
  if v_url is null or v_secret is null then
    return false;
  end if;

  -- ★ Debounce: son 1 saniyede uyandırdıysak tekrar etme
  select last_wake into v_last from push_wake_log where id = 1;
  if not p_force and v_last is not null and v_last > now() - interval '1 second' then
    return false;
  end if;

  update push_wake_log
  set last_wake = now(), wake_count = wake_count + 1
  where id = 1;

  perform net.http_post(
    url     := v_url || '/api/push/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-push-secret', v_secret
    ),
    -- ★ Belirli bir bildirim değil, "kuyruğu işle" komutu
    body    := jsonb_build_object('drain', true),
    timeout_milliseconds := 4000
  );

  return true;
exception when others then
  raise notice 'push uyandirma hatasi: %', sqlerrm;
  return false;
end;
$$;


drop trigger if exists trg_notifications_push on notifications;
drop function if exists trg_fn_notifications_push();

create or replace function trg_fn_notifications_push_stmt()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform push_wake_panel(false);
  return null;
end;
$$;

-- ★ FOR EACH STATEMENT — satır sayısından bağımsız TEK çağrı
create trigger trg_notifications_push_stmt
after insert on notifications
for each statement
execute function trg_fn_notifications_push_stmt();


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) KUYRUK ÇEKME — atomik ve paralel-güvenli                       ║
-- ║                                                                    ║
-- ║  ★ FOR UPDATE SKIP LOCKED: iki panel örneği (ya da trigger + cron)  ║
-- ║    aynı anda çekerse aynı bildirimi İKİ KEZ göndermezler. Kilitli   ║
-- ║    satırları atlayıp bir sonrakini alırlar.                         ║
-- ║    Bu olmadan yatay ölçeklendirmede çift push kaçınılmazdı.         ║
-- ║                                                                    ║
-- ║  ★ Çekilen satırlar hemen 'sending' işaretleniyor: başka bir tur    ║
-- ║    onları görmüyor. Panel çökerse 5 dakika sonra 'pending'e döner   ║
-- ║    (aşağıdaki kurtarma fonksiyonu).                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- push_status'a 'sending' değeri gerekiyor; kısıt varsa genişlet
do $$
declare v_name text; v_def text; v_expr text;
begin
  select c.conname, pg_get_constraintdef(c.oid) into v_name, v_def
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname='public' and t.relname='notifications' and c.contype='c'
    and pg_get_constraintdef(c.oid) ilike '%push_status%'
  limit 1;

  if v_name is null then return; end if;
  if v_def ilike '%sending%' then return; end if;

  v_expr := regexp_replace(v_def, '^CHECK\s*\((.*)\)$', '\1');
  execute format('alter table notifications drop constraint %I', v_name);
  execute format(
    'alter table notifications add constraint %I check ((%s) or push_status = ''sending'')',
    v_name, v_expr);
  raise notice 'push_status kisiti genisletildi: sending';
end $$;


drop function if exists admin_claim_push_batch(integer);

create or replace function admin_claim_push_batch(p_limit integer default 2000)
returns table (
  notification_id uuid,
  user_id uuid,
  device_id text,
  push_token text,
  platform text,
  type text,
  title text,
  body text,
  entity_type text,
  entity_id uuid
)
language plpgsql security definer set search_path = public as $$
declare
  v_quiet boolean := push_in_quiet_hours();
begin
  -- ★ Atomik çekme: seç → kilitle → 'sending' yap
  with secilen as (
    select n.id
    from notifications n
    join push_settings s on s.type = n.type
    where n.push_status = 'pending'
      and s.enabled = true
      -- Sessiz saatte sadece bypass_quiet tipleri geçer
      and (not v_quiet or coalesce(s.bypass_quiet, false) = true)
    order by
      -- Acil tipler önce, sonra eskiden yeniye
      case when coalesce(s.bypass_quiet, false) then 0 else 1 end,
      n.created_at
    limit greatest(1, least(10000, coalesce(p_limit, 2000)))
    for update of n skip locked
  )
  update notifications n
  set push_status = 'sending'
  from secilen
  where n.id = secilen.id
  ;

  -- ★ Artık 'sending' işaretli satırların cihaz eşleşmelerini döndür.
  --   Bir kullanıcının birden çok cihazı varsa her cihaz ayrı satır olur.
  return query
  select
    n.id,
    n.recipient_id,
    d.device_id,
    d.push_token,
    d.platform,
    n.type::text,
    coalesce(s.title_template, 'Kays'),
    coalesce(n.message, ''),
    n.entity_type::text,
    n.entity_id
  from notifications n
  join push_settings s on s.type = n.type
  join devices d on d.user_id = n.recipient_id
  where n.push_status = 'sending'
    and d.push_token is not null and d.push_token <> ''
    and coalesce(d.push_enabled, true) = true
  order by n.created_at
  limit greatest(1, least(50000, coalesce(p_limit, 2000) * 3));
end;
$$;


-- ── Cihazı olmayan bildirimleri 'skipped' yap ──
--    Yoksa sonsuza kadar 'sending'de kalıp kuyruğu tıkarlar.
drop function if exists admin_finalize_orphan_push();

create or replace function admin_finalize_orphan_push()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update notifications n
  set push_status = 'skipped',
      push_error = 'cihaz/token yok'
  where n.push_status = 'sending'
    and not exists (
      select 1 from devices d
      where d.user_id = n.recipient_id
        and d.push_token is not null and d.push_token <> ''
        and coalesce(d.push_enabled, true) = true
    );
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- ── KURTARMA: takılı kalmış 'sending' satırları geri al ──
--    Panel gönderim ortasında çökerse satırlar 'sending'de kalır.
--    5 dakikadan eskileri 'pending'e döndürüyoruz — bildirim kaybolmuyor.
drop function if exists admin_recover_stuck_push(integer);

create or replace function admin_recover_stuck_push(p_minutes integer default 5)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update notifications
  set push_status = 'pending'
  where push_status = 'sending'
    and created_at < now() - make_interval(mins => greatest(1, p_minutes));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- ── Kuyruk durumu (panel göstergesi) ──
drop function if exists admin_queue_status();

create or replace function admin_queue_status()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'pending',  (select count(*) from notifications where push_status = 'pending'),
    'sending',  (select count(*) from notifications where push_status = 'sending'),
    'failed',   (select count(*) from notifications where push_status = 'failed'),
    'en_eski',  (select min(created_at) from notifications where push_status in ('pending','sending')),
    'sessiz_saat', push_in_quiet_hours(),
    'push_acik', (coalesce(app_setting('push_enabled'), 'true') = 'true'),
    'son_uyandirma', (select last_wake from push_wake_log where id = 1),
    'uyandirma_sayisi', (select wake_count from push_wake_log where id = 1)
  );
$$;


-- ── KUYRUĞU ELLE TEMİZLE (panel butonu) ──
drop function if exists admin_clear_push_queue(text);

create or replace function admin_clear_push_queue(
  -- 'skip' = bildirimler kalsın ama push gönderilmesin
  -- 'delete' = bildirim satırları tamamen silinsin
  p_mode text default 'skip'
) returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if p_mode not in ('skip', 'delete') then
    raise exception 'Gecersiz mod: %. skip veya delete', p_mode;
  end if;

  if p_mode = 'skip' then
    update notifications
    set push_status = 'skipped', push_error = 'panel: kuyruk temizlendi'
    where push_status in ('pending', 'sending');
    get diagnostics v_n = row_count;
    return json_build_object('mod', 'skip', 'etkilenen', v_n);
  end if;

  delete from notifications where push_status in ('pending', 'sending');
  get diagnostics v_n = row_count;
  return json_build_object('mod', 'delete', 'etkilenen', v_n);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) BİLDİRİM TEMİZLİĞİ                                             ║
-- ║                                                                    ║
-- ║  Kural: 10 günden eski bildirimler silinir, AMA her kullanıcının    ║
-- ║  en son 10 bildirimi ne olursa olsun korunur.                       ║
-- ║                                                                    ║
-- ║  ★ Neden: uzun süre girmeyen kullanıcı uygulamayı açtığında         ║
-- ║    bildirim ekranı bomboş görünmesin.                               ║
-- ║                                                                    ║
-- ║  ★ Silme PARÇALI: tek seferde 50.000 satır. 10 milyon satırlık      ║
-- ║    bir DELETE tabloyu kilitler ve WAL'i şişirir.                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists cleanup_notifications(integer, integer, integer);

create or replace function cleanup_notifications(
  p_days integer default 10,
  p_keep_per_user integer default 10,
  p_batch integer default 50000
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_silinen integer := 0;
  v_tur integer := 0;
  v_n integer;
begin
  loop
    v_tur := v_tur + 1;

    with korunacak as (
      -- Her kullanıcının son N bildirimi — silinmeyecek
      select id from (
        select n.id,
               row_number() over (partition by n.recipient_id order by n.created_at desc) as sira
        from notifications n
        where n.created_at < now() - make_interval(days => greatest(1, p_days))
      ) t
      where t.sira <= greatest(0, p_keep_per_user)
    ),
    silinecek as (
      select n.id
      from notifications n
      where n.created_at < now() - make_interval(days => greatest(1, p_days))
        and not exists (select 1 from korunacak k where k.id = n.id)
        -- Kuyrukta bekleyene dokunma
        and n.push_status not in ('pending', 'sending')
      limit greatest(1000, p_batch)
    )
    delete from notifications n
    using silinecek s
    where n.id = s.id;

    get diagnostics v_n = row_count;
    v_silinen := v_silinen + v_n;

    exit when v_n = 0 or v_tur >= 40;  -- en fazla 2 milyon satır / çağrı
  end loop;

  return json_build_object(
    'silinen', v_silinen,
    'tur', v_tur,
    'gun', p_days,
    'kullanici_basina_korunan', p_keep_per_user,
    'kalan', (select count(*) from notifications)
  );
end;
$$;


-- ── İŞLEM KAYDI TEMİZLİĞİ (30 gün) ──
drop function if exists cleanup_audit_log(integer);

create or replace function cleanup_audit_log(p_days integer default 30)
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from admin_audit_log
  where created_at < now() - make_interval(days => greatest(1, p_days));
  get diagnostics v_n = row_count;

  return json_build_object(
    'silinen', v_n, 'gun', p_days,
    'kalan', (select count(*) from admin_audit_log)
  );
end;
$$;


-- ── PUSH LOG TEMİZLİĞİ (7 gün) ──
drop function if exists cleanup_push_log(integer);

create or replace function cleanup_push_log(p_days integer default 7)
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from push_log
  where created_at < now() - make_interval(days => greatest(1, p_days));
  get diagnostics v_n = row_count;
  return json_build_object('silinen', v_n, 'kalan', (select count(*) from push_log));
end;
$$;


-- ── HEPSİ BİR ARADA (cron bunu çağırıyor) ──
drop function if exists run_maintenance();

create or replace function run_maintenance()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_bildirim json;
  v_audit json;
  v_log json;
  v_kurtarilan integer;
begin
  v_kurtarilan := admin_recover_stuck_push(5);
  v_bildirim := cleanup_notifications(10, 10, 50000);
  v_audit := cleanup_audit_log(30);
  v_log := cleanup_push_log(7);

  return json_build_object(
    'tarih', now(),
    'kurtarilan_push', v_kurtarilan,
    'bildirim', v_bildirim,
    'islem_kaydi', v_audit,
    'push_log', v_log
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) ZAMANLANMIŞ İŞLER (pg_cron)                                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron kurulu degil — zamanlanmis isler atlandi.';
    raise notice 'Supabase: Database > Extensions > pg_cron etkinlestir, sonra bu dosyayi tekrar calistir.';
    return;
  end if;

  -- Eskileri temizle
  perform cron.unschedule(jobname)
  from cron.job
  where jobname in ('push_sweep', 'push_drain', 'kays_maintenance', 'push_recover');

  -- ★ Kuyruk taraması: her dakika (trigger çalışmazsa güvenlik ağı)
  perform cron.schedule(
    'push_drain', '* * * * *',
    $c$ select push_wake_panel(true); $c$
  );

  -- ★ Takılı kalanları kurtar: 5 dakikada bir
  perform cron.schedule(
    'push_recover', '*/5 * * * *',
    $c$ select admin_recover_stuck_push(5); $c$
  );

  -- ★ Bakım: her gece 04:00
  perform cron.schedule(
    'kays_maintenance', '0 4 * * *',
    $c$ select run_maintenance(); $c$
  );

  raise notice 'Zamanlanmis isler kuruldu: push_drain, push_recover, kays_maintenance';
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) YETKİLER                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('push_wake_panel','admin_claim_push_batch','admin_finalize_orphan_push',
                        'admin_recover_stuck_push','admin_queue_status','admin_clear_push_queue',
                        'cleanup_notifications','cleanup_audit_log','cleanup_push_log','run_maintenance')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

alter table push_wake_log enable row level security;
drop policy if exists push_wake_log_deny on push_wake_log;
create policy push_wake_log_deny on push_wake_log for all using (false);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Tetikleyici artık statement seviyesinde mi?
select t.tgname,
       case when t.tgtype & 1 = 1 then 'ROW' else 'STATEMENT' end as seviye
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where c.relname = 'notifications' and not t.tgisinternal;

select admin_queue_status() as kuyruk;

-- Zamanlanmış işler
select jobname, schedule, active from cron.job order by jobname;
