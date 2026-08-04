-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V4.4 — MAİL SİSTEMİ + GÜVENLİK MAİLLERİ + MEDYA KÜTÜPHANESİ
--
-- ┌─ MAİL MİMARİSİ ───────────────────────────────────────────────────┐
-- │ GÖNDERİM: mail_queue tablosu → panel worker → SMTP/Resend          │
-- │   Kuyruk kullanılıyor çünkü mail gönderimi yavaş ve hata verebilir;│
-- │   tetikleyicinin içinde SMTP beklemek işlemi kilitler.             │
-- │                                                                    │
-- │ GELEN: mails tablosu ← /api/mail/inbound webhook                   │
-- │   IMAP kalıcı bağlantı ister, Next.js'te çalışmaz. Sağlayıcı       │
-- │   webhook'u (Resend/Postmark/SendGrid inbound) doğru yöntem.       │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v4_3'ten SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) MAİL AYARLARI                                                  ║
-- ║                                                                    ║
-- ║  ★ Şifre app_settings'te DEĞİL burada; RLS ile tamamen kapalı.     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists mail_settings (
  id                smallint primary key default 1,
  -- Giden
  provider          text not null default 'smtp',
  smtp_host         text,
  smtp_port         integer default 587,
  smtp_secure       boolean default false,
  smtp_user         text,
  smtp_pass         text,
  api_key           text,
  from_email        text,
  from_name         text default 'Kays',
  reply_to          text,
  -- Gelen
  inbound_secret    text,
  inbound_enabled   boolean default false,
  -- Davranış
  is_active         boolean default false,
  daily_limit       integer default 2000,
  default_template  text,
  signature_html    text,
  updated_at        timestamptz default now(),
  constraint mail_settings_single check (id = 1),
  constraint mail_provider_chk check (provider in ('smtp','resend','postmark','sendgrid'))
);

insert into mail_settings (id) values (1) on conflict (id) do nothing;

-- Varsayılan HTML şablonu
update mail_settings
set default_template = coalesce(default_template, E'<!DOCTYPE html>\n<html lang="tr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>{{konu}}</title>\n</head>\n<body style="margin:0;padding:0;background:#f2f2f7;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;">\n  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f7;padding:32px 16px;">\n    <tr><td align="center">\n      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">\n        <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #eeeef2;">\n          <img src="{{logo}}" alt="Kays" width="40" height="40" style="display:block;border:0;">\n        </td></tr>\n        <tr><td style="padding:28px 32px;color:#18181b;font-size:15px;line-height:1.6;">\n          {{icerik}}\n        </td></tr>\n        <tr><td style="padding:20px 32px 28px;border-top:1px solid #eeeef2;color:#8e8e93;font-size:12px;line-height:1.5;">\n          {{imza}}\n          <p style="margin:12px 0 0;">Bu e-posta Kays tarafından gönderildi.</p>\n        </td></tr>\n      </table>\n    </td></tr>\n  </table>\n</body>\n</html>')
where id = 1;

alter table mail_settings enable row level security;
drop policy if exists mail_settings_deny on mail_settings;
create policy mail_settings_deny on mail_settings for all using (false);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) MAİL ŞABLONLARI                                                ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists mail_templates (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  ad          text not null,
  subject     text not null,
  body_html   text not null,
  body_text   text,
  -- Sistem şablonları silinemez
  is_system   boolean not null default false,
  aciklama    text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

insert into mail_templates (key, ad, subject, body_html, is_system, aciklama) values
  ('security_login', 'Güvenlik: Yeni giriş', 'Hesabınıza yeni giriş yapıldı',
   E'<p>Merhaba {{ad}},</p><p>Hesabınıza yeni bir giriş yapıldı.</p><p><strong>Tarih:</strong> {{tarih}}<br><strong>Cihaz:</strong> {{cihaz}}<br><strong>IP:</strong> {{ip}}</p><p>Bu siz değilseniz hemen şifrenizi değiştirin.</p>',
   true, 'Kullanıcı giriş yaptığında'),

  ('security_password', 'Güvenlik: Şifre değişikliği', 'Şifreniz değiştirildi',
   E'<p>Merhaba {{ad}},</p><p>Hesabınızın şifresi {{tarih}} tarihinde değiştirildi.</p><p>Bu işlemi siz yapmadıysanız derhal bizimle iletişime geçin.</p>',
   true, 'Şifre değiştiğinde'),

  ('security_email', 'Güvenlik: E-posta değişikliği', 'E-posta adresiniz değiştirildi',
   E'<p>Merhaba {{ad}},</p><p>Hesabınızın e-posta adresi <strong>{{eski}}</strong> adresinden <strong>{{yeni}}</strong> adresine değiştirildi.</p><p>Bu işlemi siz yapmadıysanız derhal bizimle iletişime geçin.</p>',
   true, 'E-posta değiştiğinde'),

  ('security_phone', 'Güvenlik: Telefon değişikliği', 'Telefon numaranız değiştirildi',
   E'<p>Merhaba {{ad}},</p><p>Hesabınızın telefon numarası {{tarih}} tarihinde değiştirildi.</p><p>Bu işlemi siz yapmadıysanız derhal bizimle iletişime geçin.</p>',
   true, 'Telefon değiştiğinde'),

  ('ad_approved', 'Reklam onaylandı', 'Reklamınız yayına alındı',
   E'<p>Merhaba {{ad}},</p><p><strong>{{baslik}}</strong> adlı reklamınız onaylandı ve yayına alındı.</p><p><strong>Alan:</strong> {{alan}}<br><strong>Süre:</strong> {{sure}} ay<br><strong>Bitiş:</strong> {{bitis}}</p><p>İyi kampanyalar dileriz.</p>',
   true, 'Reklam onaylandığında'),

  ('ad_rejected', 'Reklam reddedildi', 'Reklam başvurunuz hakkında',
   E'<p>Merhaba {{ad}},</p><p><strong>{{baslik}}</strong> adlı reklam başvurunuz onaylanmadı.</p><p><strong>Sebep:</strong> {{sebep}}</p><p>Gerekli düzeltmeleri yapıp yeni bir teklif gönderebilirsiniz.</p>',
   true, 'Reklam reddedildiğinde'),

  ('ad_expiring_7d', 'Reklam: 1 hafta kaldı', 'Reklam süreniz bitmek üzere',
   E'<p>Merhaba {{ad}},</p><p><strong>{{baslik}}</strong> adlı reklamınızın süresi <strong>{{bitis}}</strong> tarihinde doluyor.</p><p>Reklam süreniz bitmek üzere. Anlaşmamızı yenilemek veya yeni teklif göndermek için bizimle iletişime geçebilirsiniz.</p>',
   true, 'Bitime 1 hafta kala'),

  ('ad_expiring_1d', 'Reklam: 1 gün kaldı', 'Reklamınız yarın sona eriyor',
   E'<p>Merhaba {{ad}},</p><p><strong>{{baslik}}</strong> adlı reklamınız <strong>yarın</strong> sona eriyor.</p><p>Yayında kalmaya devam etmek isterseniz yeni teklif göndermeniz yeterli.</p>',
   true, 'Bitime 1 gün kala'),

  ('ad_expired', 'Reklam süresi doldu', 'Reklamınızın süresi doldu',
   E'<p>Merhaba {{ad}},</p><p><strong>{{baslik}}</strong> adlı reklamınızın süresi doldu ve yayından kaldırıldı.</p><p>Yeniden yayına almak için yeni bir teklif gönderebilirsiniz.</p>',
   true, 'Süre dolduğunda'),

  ('boost_approved', 'Öne çıkarma onaylandı', 'İçeriğiniz öne çıkarıldı',
   E'<p>Merhaba {{ad}},</p><p><strong>{{baslik}}</strong> içeriğiniz {{tip}} olarak öne çıkarıldı.</p><p><strong>Bitiş:</strong> {{bitis}}</p>',
   true, 'Boost onaylandığında'),

  ('boost_expiring_1d', 'Öne çıkarma: 1 gün kaldı', 'Öne çıkarma süreniz doluyor',
   E'<p>Merhaba {{ad}},</p><p><strong>{{baslik}}</strong> içeriğinizin öne çıkarma süresi yarın doluyor.</p><p>Devam etmek isterseniz yeni teklif gönderebilirsiniz.</p>',
   true, 'Boost bitimine 1 gün kala')
on conflict (key) do nothing;

alter table mail_templates enable row level security;
drop policy if exists mail_templates_deny on mail_templates;
create policy mail_templates_deny on mail_templates for all using (false);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) GİDEN MAİL KUYRUĞU                                             ║
-- ║                                                                    ║
-- ║  ★ Tetikleyiciler SMTP'yi beklemez: kuyruğa yazar, panel worker'ı  ║
-- ║    gönderir. Yoksa e-posta sunucusu yavaşladığında kullanıcı        ║
-- ║    kaydı da yavaşlardı.                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists mail_queue (
  id           uuid primary key default gen_random_uuid(),
  to_email     text not null,
  to_name      text,
  user_id      uuid references profiles(id) on delete set null,
  subject      text not null,
  body_html    text,
  body_text    text,
  template_key text,
  variables    jsonb,
  status       text not null default 'pending',
  attempts     integer not null default 0,
  error        text,
  provider_id  text,
  priority     integer not null default 5,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz,
  constraint mail_queue_status_chk check (status in ('pending','sending','sent','failed','cancelled'))
);

create index if not exists idx_mail_queue_pending
  on mail_queue (priority, created_at) where status = 'pending';
create index if not exists idx_mail_queue_user on mail_queue (user_id, created_at desc);

alter table mail_queue enable row level security;
drop policy if exists mail_queue_deny on mail_queue;
create policy mail_queue_deny on mail_queue for all using (false);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) GELEN MAİLLER                                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists mails (
  id            uuid primary key default gen_random_uuid(),
  message_id    text unique,
  from_email    text not null,
  from_name     text,
  to_email      text,
  subject       text,
  body_text     text,
  body_html     text,
  -- ★ Gönderen otomatik eşleştirme
  matched_user_id uuid references profiles(id) on delete set null,
  match_score   integer,
  match_reason  text,
  is_read       boolean not null default false,
  is_starred    boolean not null default false,
  is_archived   boolean not null default false,
  attachments   jsonb,
  headers       jsonb,
  received_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_mails_received on mails (received_at desc);
create index if not exists idx_mails_unread on mails (received_at desc) where not is_read and not is_archived;
create index if not exists idx_mails_from on mails (from_email);

alter table mails enable row level security;
drop policy if exists mails_deny on mails;
create policy mails_deny on mails for all using (false);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) GÖNDEREN EŞLEŞTİRME                                            ║
-- ║                                                                    ║
-- ║  ★ "Bu maili gönderen X kullanıcısı olabilir" önerisi.              ║
-- ║    Puanlama: tam e-posta 100 · auth e-posta 95 · alan adı+isim 60   ║
-- ║    · isim benzerliği 40. 40 altı öneri verilmiyor.                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists mail_match_sender(text, text);

create or replace function mail_match_sender(p_email text, p_name text default null)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid;
  v_score integer;
  v_reason text;
  v_alan text;
begin
  if p_email is null then return null; end if;

  -- 1) profiles.email tam eşleşme
  select id into v_uid from profiles where lower(email) = lower(trim(p_email)) limit 1;
  if v_uid is not null then
    return json_build_object('user_id', v_uid, 'score', 100,
      'reason', 'Profil e-postası birebir eşleşti');
  end if;

  -- 2) auth.users.email tam eşleşme
  select u.id into v_uid from auth.users u
  where lower(u.email::text) = lower(trim(p_email)) limit 1;
  if v_uid is not null then
    return json_build_object('user_id', v_uid, 'score', 95,
      'reason', 'Giriş e-postası birebir eşleşti');
  end if;

  -- 3) E-posta kullanıcı adı = profil kullanıcı adı
  select id into v_uid from profiles
  where lower(username) = lower(split_part(trim(p_email), '@', 1)) limit 1;
  if v_uid is not null then
    return json_build_object('user_id', v_uid, 'score', 70,
      'reason', format('E-posta kullanıcı adı "%s" profil adıyla eşleşti',
                       split_part(trim(p_email), '@', 1)));
  end if;

  -- 4) İsim benzerliği (gönderen adı verilmişse)
  if nullif(trim(coalesce(p_name,'')), '') is not null then
    select id into v_uid from profiles
    where lower(name) = lower(trim(p_name)) limit 1;
    if v_uid is not null then
      return json_build_object('user_id', v_uid, 'score', 55,
        'reason', format('Gönderen adı "%s" profil ismiyle eşleşti', trim(p_name)));
    end if;

    -- Kısmi
    select id into v_uid from profiles
    where lower(name) like '%' || lower(split_part(trim(p_name), ' ', 1)) || '%'
    limit 1;
    if v_uid is not null then
      return json_build_object('user_id', v_uid, 'score', 40,
        'reason', 'Gönderen adı profil ismine benziyor');
    end if;
  end if;

  return null;
end;
$$;


-- Gelen mail kaydedildiğinde otomatik eşleştir
create or replace function trg_fn_mail_match()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_m json;
begin
  v_m := mail_match_sender(new.from_email, new.from_name);
  if v_m is not null then
    new.matched_user_id := (v_m->>'user_id')::uuid;
    new.match_score := (v_m->>'score')::integer;
    new.match_reason := v_m->>'reason';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mail_match on mails;
create trigger trg_mail_match
before insert on mails
for each row execute function trg_fn_mail_match();


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) MAİL KUYRUĞA EKLEME                                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists mail_enqueue(text, text, text, text, uuid, text, jsonb, integer);

create or replace function mail_enqueue(
  p_to text,
  p_subject text,
  p_html text default null,
  p_text text default null,
  p_user_id uuid default null,
  p_template text default null,
  p_vars jsonb default null,
  p_priority integer default 5
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_aktif boolean;
begin
  select is_active into v_aktif from mail_settings where id = 1;

  -- ★ Mail kapalıysa kuyruğa yine yazıyoruz ama 'cancelled' olarak:
  --   açıldığında geçmişte ne gitmesi gerektiğini görebilesin.
  insert into mail_queue (
    to_email, user_id, subject, body_html, body_text,
    template_key, variables, priority, status, error
  ) values (
    lower(trim(p_to)), p_user_id, p_subject, p_html, p_text,
    p_template, p_vars, coalesce(p_priority, 5),
    case when coalesce(v_aktif, false) then 'pending' else 'cancelled' end,
    case when coalesce(v_aktif, false) then null else 'mail sistemi kapalı' end
  ) returning id into v_id;

  return v_id;
end;
$$;


-- Şablondan mail kuyruğa ekle (değişkenler doldurularak)
drop function if exists mail_enqueue_template(text, uuid, jsonb, integer);

create or replace function mail_enqueue_template(
  p_template_key text,
  p_user_id uuid,
  p_vars jsonb default '{}'::jsonb,
  p_priority integer default 5
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_t mail_templates;
  v_email text;
  v_ad text;
  v_html text;
  v_subject text;
  v_key text;
begin
  select * into v_t from mail_templates where key = p_template_key;
  if v_t.id is null then
    raise notice 'Sablon bulunamadi: %', p_template_key;
    return null;
  end if;

  select coalesce(p.email, u.email::text),
         coalesce(nullif(trim(p.name),''), nullif(trim(p.username),''), 'değerli kullanıcı')
  into v_email, v_ad
  from profiles p
  full outer join auth.users u on u.id = p.id
  where coalesce(p.id, u.id) = p_user_id
  limit 1;

  if v_email is null then
    raise notice 'Kullanicinin e-postasi yok: %', p_user_id;
    return null;
  end if;

  v_html := v_t.body_html;
  v_subject := v_t.subject;

  -- ★ Değişken doldurma: {{ad}} her zaman var, gerisi p_vars'tan
  v_html := replace(v_html, '{{ad}}', v_ad);
  v_subject := replace(v_subject, '{{ad}}', v_ad);

  for v_key in select jsonb_object_keys(coalesce(p_vars, '{}'::jsonb)) loop
    v_html := replace(v_html, '{{' || v_key || '}}', coalesce(p_vars->>v_key, ''));
    v_subject := replace(v_subject, '{{' || v_key || '}}', coalesce(p_vars->>v_key, ''));
  end loop;

  return mail_enqueue(v_email, v_subject, v_html, null, p_user_id, p_template_key, p_vars, p_priority);
end;
$$;


-- ── Kuyruk çekme (panel worker) ──
drop function if exists admin_claim_mail_batch(integer);

create or replace function admin_claim_mail_batch(p_limit integer default 50)
returns setof mail_queue language plpgsql security definer set search_path = public as $$
begin
  return query
  with secilen as (
    select id from mail_queue
    where status = 'pending' and attempts < 3
    order by priority, created_at
    limit greatest(1, least(200, coalesce(p_limit, 50)))
    for update skip locked
  )
  update mail_queue q
  set status = 'sending', attempts = q.attempts + 1
  from secilen s
  where q.id = s.id
  returning q.*;
end;
$$;


drop function if exists admin_mark_mail(uuid, boolean, text, text);

create or replace function admin_mark_mail(
  p_id uuid, p_ok boolean, p_error text default null, p_provider_id text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  update mail_queue set
    status = case when p_ok then 'sent'
                  when attempts >= 3 then 'failed'
                  else 'pending' end,
    error = case when p_ok then null else p_error end,
    provider_id = coalesce(p_provider_id, provider_id),
    sent_at = case when p_ok then now() else sent_at end
  where id = p_id;
end;
$$;


-- ── Takılı kalanları kurtar ──
drop function if exists mail_recover_stuck(integer);

create or replace function mail_recover_stuck(p_minutes integer default 10)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  update mail_queue set status = 'pending'
  where status = 'sending' and created_at < now() - make_interval(mins => greatest(1, p_minutes));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  7) GÜVENLİK MAİLLERİ                                              ║
-- ║                                                                    ║
-- ║  ★ auth.users üzerinde tetikleyici. Supabase auth şemasına trigger  ║
-- ║    eklemek destekleniyor; hata olursa auth işlemi ETKİLENMEZ        ║
-- ║    (exception yutuluyor) — kullanıcı girişi mail yüzünden bozulmaz. ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function trg_fn_security_mail()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    -- Şifre değişti
    if new.encrypted_password is distinct from old.encrypted_password then
      perform mail_enqueue_template('security_password', new.id,
        jsonb_build_object('tarih', to_char(now(), 'DD.MM.YYYY HH24:MI')), 1);
    end if;

    -- E-posta değişti
    if new.email is distinct from old.email then
      perform mail_enqueue_template('security_email', new.id,
        jsonb_build_object('eski', coalesce(old.email::text, '—'),
                           'yeni', coalesce(new.email::text, '—'),
                           'tarih', to_char(now(), 'DD.MM.YYYY HH24:MI')), 1);
    end if;

    -- Telefon değişti
    if new.phone is distinct from old.phone then
      perform mail_enqueue_template('security_phone', new.id,
        jsonb_build_object('tarih', to_char(now(), 'DD.MM.YYYY HH24:MI')), 1);
    end if;

    -- Yeni giriş
    if new.last_sign_in_at is distinct from old.last_sign_in_at
       and new.last_sign_in_at is not null then
      perform mail_enqueue_template('security_login', new.id,
        jsonb_build_object(
          'tarih', to_char(new.last_sign_in_at, 'DD.MM.YYYY HH24:MI'),
          'cihaz', coalesce((select d.model from devices d
                             where d.user_id = new.id
                             order by d.last_login_at desc nulls last limit 1), 'Bilinmiyor'),
          'ip', coalesce((select d.ip from devices d
                          where d.user_id = new.id
                          order by d.ip_updated_at desc nulls last limit 1), 'Bilinmiyor')
        ), 3);
    end if;
  exception when others then
    -- ★ Mail hatası ASLA auth işlemini bozmaz
    raise notice 'guvenlik maili kuyruga eklenemedi: %', sqlerrm;
  end;

  return new;
end;
$$;

do $$
begin
  begin
    drop trigger if exists trg_security_mail on auth.users;
    create trigger trg_security_mail
    after update on auth.users
    for each row execute function trg_fn_security_mail();
    raise notice 'Guvenlik maili tetikleyicisi kuruldu';
  exception when insufficient_privilege then
    raise notice 'auth.users uzerinde trigger olusturma yetkisi yok — guvenlik mailleri panel tarafindan tetiklenmeli';
  when others then
    raise notice 'Guvenlik maili tetikleyicisi kurulamadi: %', sqlerrm;
  end;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  8) REKLAM MAİLLERİ                                                ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Onay / red anında mail
create or replace function trg_fn_ad_status_mail()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_slot text;
begin
  if new.status is not distinct from old.status then return new; end if;

  begin
    select ad into v_slot from ad_slots where key = new.slot_key;

    if new.status = 'active' and old.status in ('pending','approved','paused') then
      perform mail_enqueue_template('ad_approved', new.advertiser_id,
        jsonb_build_object(
          'baslik', new.title, 'alan', coalesce(v_slot, new.slot_key),
          'sure', new.months::text,
          'bitis', to_char(new.ends_at, 'DD.MM.YYYY')), 2);

    elsif new.status = 'rejected' then
      perform mail_enqueue_template('ad_rejected', new.advertiser_id,
        jsonb_build_object(
          'baslik', new.title,
          'sebep', coalesce(new.reject_reason, 'Belirtilmedi')), 2);

    elsif new.status = 'expired' then
      perform mail_enqueue_template('ad_expired', new.advertiser_id,
        jsonb_build_object('baslik', new.title), 3);
    end if;
  exception when others then
    raise notice 'reklam maili eklenemedi: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists trg_ad_status_mail on ad_campaigns;
create trigger trg_ad_status_mail
after update on ad_campaigns
for each row execute function trg_fn_ad_status_mail();


-- Boost onayında mail
create or replace function trg_fn_boost_status_mail()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then return new; end if;
  begin
    if new.status = 'active' then
      perform mail_enqueue_template('boost_approved', new.user_id,
        jsonb_build_object(
          'baslik', coalesce(new.content_id::text, ''),
          'tip', case when new.boost_type = 'super_boost' then 'süper boost' else 'boost' end,
          'bitis', to_char(new.ends_at, 'DD.MM.YYYY')), 3);
    end if;
  exception when others then null;
  end;
  return new;
end;
$$;

drop trigger if exists trg_boost_status_mail on boost_requests;
create trigger trg_boost_status_mail
after update on boost_requests
for each row execute function trg_fn_boost_status_mail();


-- ── Süre hatırlatmaları (cron) ──
drop function if exists ad_send_reminders();

create or replace function ad_send_reminders()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_7d integer := 0;
  v_1d integer := 0;
  v_boost integer := 0;
  r record;
begin
  -- 1 hafta kala
  for r in
    select * from ad_campaigns
    where status = 'active' and notified_7d = false
      and ends_at between now() and now() + interval '7 days'
  loop
    perform mail_enqueue_template('ad_expiring_7d', r.advertiser_id,
      jsonb_build_object('baslik', r.title, 'bitis', to_char(r.ends_at, 'DD.MM.YYYY')), 3);
    update ad_campaigns set notified_7d = true where id = r.id;
    v_7d := v_7d + 1;
  end loop;

  -- 1 gün kala
  for r in
    select * from ad_campaigns
    where status = 'active' and notified_1d = false
      and ends_at between now() and now() + interval '1 day'
  loop
    perform mail_enqueue_template('ad_expiring_1d', r.advertiser_id,
      jsonb_build_object('baslik', r.title, 'bitis', to_char(r.ends_at, 'DD.MM.YYYY')), 2);
    update ad_campaigns set notified_1d = true where id = r.id;
    v_1d := v_1d + 1;
  end loop;

  -- Boost 1 gün kala
  for r in
    select * from boost_requests
    where status = 'active' and notified_1d = false
      and ends_at between now() and now() + interval '1 day'
  loop
    perform mail_enqueue_template('boost_expiring_1d', r.user_id,
      jsonb_build_object('baslik', r.content_id::text), 3);
    update boost_requests set notified_1d = true where id = r.id;
    v_boost := v_boost + 1;
  end loop;

  return json_build_object('hafta', v_7d, 'gun', v_1d, 'boost', v_boost);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  9) MEDYA KÜTÜPHANESİ                                              ║
-- ║                                                                    ║
-- ║  ★ Dosyalar Storage'da; bu tablo sadece ÜST VERİ tutuyor            ║
-- ║    (etiket, açıklama, kim yükledi). Storage listeleme API'si        ║
-- ║    bunları veremiyor.                                               ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists media_library (
  id          uuid primary key default gen_random_uuid(),
  bucket      text not null default 'medya',
  path        text not null,
  url         text not null,
  file_name   text not null,
  mime_type   text,
  size_bytes  bigint,
  width       integer,
  height      integer,
  klasor      text default 'genel',
  etiketler   text[],
  aciklama    text,
  uploaded_by text,
  created_at  timestamptz not null default now(),
  unique (bucket, path)
);

create index if not exists idx_media_created on media_library (created_at desc);
create index if not exists idx_media_klasor on media_library (klasor, created_at desc);

alter table media_library enable row level security;
drop policy if exists media_library_read on media_library;
-- ★ Yüklenen medya herkese açık okunabilir (uygulamada kullanılabilsin)
create policy media_library_read on media_library for select using (true);
grant select on media_library to anon, authenticated;


drop function if exists admin_media_stats();

create or replace function admin_media_stats()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'toplam', (select count(*) from media_library),
    'boyut', (select coalesce(sum(size_bytes), 0) from media_library),
    'gorsel', (select count(*) from media_library where mime_type like 'image/%'),
    'video', (select count(*) from media_library where mime_type like 'video/%'),
    'klasorler', (
      select coalesce(json_agg(x order by x.adet desc), '[]'::json) from (
        select coalesce(klasor, 'genel') as klasor, count(*) as adet
        from media_library group by coalesce(klasor, 'genel')
      ) x
    )
  );
$$;


drop function if exists admin_list_media(text, text, integer, integer);

create or replace function admin_list_media(
  p_klasor text default null,
  p_query text default null,
  p_limit integer default 60,
  p_offset integer default 0
) returns setof media_library
language sql security definer set search_path = public as $$
  select * from media_library
  where (p_klasor is null or trim(p_klasor) = '' or klasor = p_klasor)
    and (p_query is null or trim(p_query) = ''
         or file_name ilike '%' || p_query || '%'
         or aciklama ilike '%' || p_query || '%'
         or array_to_string(etiketler, ',') ilike '%' || p_query || '%')
  order by created_at desc
  limit greatest(1, least(200, coalesce(p_limit, 60)))
  offset greatest(0, coalesce(p_offset, 0));
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  10) REKLAM MEDYASI TEMİZLİĞİ                                      ║
-- ║                                                                    ║
-- ║  ★ Kampanya silindiğinde ya da görsel değiştiğinde eski dosya       ║
-- ║    Storage'dan silinmeli. SQL Storage'a erişemez; bu yüzden         ║
-- ║    silinecek yollar bir kuyruğa yazılıyor, panel worker'ı siliyor.  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists storage_cleanup_queue (
  id         uuid primary key default gen_random_uuid(),
  bucket     text not null,
  path       text not null,
  reason     text,
  status     text not null default 'pending',
  error      text,
  created_at timestamptz not null default now(),
  done_at    timestamptz,
  constraint storage_cleanup_status_chk check (status in ('pending','done','failed','skipped'))
);

create index if not exists idx_storage_cleanup_pending
  on storage_cleanup_queue (created_at) where status = 'pending';

alter table storage_cleanup_queue enable row level security;
drop policy if exists storage_cleanup_deny on storage_cleanup_queue;
create policy storage_cleanup_deny on storage_cleanup_queue for all using (false);


-- URL'den bucket ve yol çıkar
drop function if exists storage_parse_url(text);

create or replace function storage_parse_url(p_url text)
returns json language plpgsql immutable as $$
declare
  v_m text[];
begin
  if p_url is null or p_url = '' then return null; end if;
  -- .../storage/v1/object/public/<bucket>/<path>?...
  v_m := regexp_match(p_url, '/storage/v1/object/(?:public|sign|authenticated)/([^/]+)/([^?]+)');
  if v_m is null then return null; end if;
  return json_build_object('bucket', v_m[1], 'path', v_m[2]);
end;
$$;


drop function if exists storage_enqueue_delete(text, text);

create or replace function storage_enqueue_delete(p_url text, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_p json;
  v_id uuid;
begin
  v_p := storage_parse_url(p_url);
  if v_p is null then return null; end if;

  insert into storage_cleanup_queue (bucket, path, reason)
  values (v_p->>'bucket', v_p->>'path', p_reason)
  returning id into v_id;

  return v_id;
end;
$$;


-- ── Reklam medyası: değişince/silinince eski dosyayı kuyruğa at ──
create or replace function trg_fn_ad_media_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform storage_enqueue_delete(old.image_url, 'kampanya silindi');
    perform storage_enqueue_delete(old.logo_url, 'kampanya silindi');
    return old;
  end if;

  -- ★ Görsel değiştiyse ESKİSİNİ sil
  if new.image_url is distinct from old.image_url and old.image_url is not null then
    perform storage_enqueue_delete(old.image_url, 'gorsel degisti');
  end if;
  if new.logo_url is distinct from old.logo_url and old.logo_url is not null then
    perform storage_enqueue_delete(old.logo_url, 'logo degisti');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ad_media_cleanup_upd on ad_campaigns;
create trigger trg_ad_media_cleanup_upd
after update on ad_campaigns
for each row execute function trg_fn_ad_media_cleanup();

drop trigger if exists trg_ad_media_cleanup_del on ad_campaigns;
create trigger trg_ad_media_cleanup_del
after delete on ad_campaigns
for each row execute function trg_fn_ad_media_cleanup();


-- Medya kütüphanesinden silinince dosyayı da sil
create or replace function trg_fn_media_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into storage_cleanup_queue (bucket, path, reason)
  values (old.bucket, old.path, 'medya kutuphanesinden silindi');
  return old;
end;
$$;

drop trigger if exists trg_media_cleanup on media_library;
create trigger trg_media_cleanup
after delete on media_library
for each row execute function trg_fn_media_cleanup();


drop function if exists admin_claim_storage_cleanup(integer);

create or replace function admin_claim_storage_cleanup(p_limit integer default 100)
returns setof storage_cleanup_queue
language sql security definer set search_path = public as $$
  select * from storage_cleanup_queue
  where status = 'pending'
  order by created_at
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;


drop function if exists admin_mark_storage_cleanup(uuid, boolean, text);

create or replace function admin_mark_storage_cleanup(
  p_id uuid, p_ok boolean, p_error text default null
) returns void language sql security definer set search_path = public as $$
  update storage_cleanup_queue
  set status = case when p_ok then 'done' else 'failed' end,
      error = case when p_ok then null else p_error end,
      done_at = now()
  where id = p_id;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  11) PANEL FONKSİYONLARI                                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_mail_stats();

create or replace function admin_mail_stats()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'gelen_toplam',   (select count(*) from mails where not is_archived),
    'gelen_okunmamis',(select count(*) from mails where not is_read and not is_archived),
    'giden_bekleyen', (select count(*) from mail_queue where status = 'pending'),
    'giden_gonderilen',(select count(*) from mail_queue where status = 'sent'),
    'giden_hata',     (select count(*) from mail_queue where status = 'failed'),
    'bugun_gonderilen',(select count(*) from mail_queue
                          where status = 'sent' and sent_at > current_date),
    'ayarli',         (select is_active from mail_settings where id = 1),
    'gunluk_limit',   (select daily_limit from mail_settings where id = 1)
  );
$$;


drop function if exists admin_list_mails(text, text, integer, integer);

create or replace function admin_list_mails(
  p_filter text default 'inbox',
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
) returns table (
  id uuid, from_email text, from_name text, to_email text, subject text,
  body_text text, is_read boolean, is_starred boolean, is_archived boolean,
  matched_user_id uuid, match_score integer, match_reason text,
  matched_username text, matched_avatar text,
  received_at timestamptz
)
language sql security definer set search_path = public as $$
  select m.id, m.from_email, m.from_name, m.to_email, m.subject,
         left(coalesce(m.body_text, regexp_replace(coalesce(m.body_html,''), '<[^>]+>', ' ', 'g')), 200),
         m.is_read, m.is_starred, m.is_archived,
         m.matched_user_id, m.match_score, m.match_reason,
         p.username::text, p.avatar_url,
         m.received_at
  from mails m
  left join profiles p on p.id = m.matched_user_id
  where case coalesce(p_filter, 'inbox')
    when 'inbox'    then not m.is_archived
    when 'unread'   then not m.is_read and not m.is_archived
    when 'starred'  then m.is_starred
    when 'archived' then m.is_archived
    else true
  end
  and (p_query is null or trim(p_query) = ''
       or m.subject ilike '%' || p_query || '%'
       or m.from_email ilike '%' || p_query || '%'
       or m.body_text ilike '%' || p_query || '%')
  order by m.received_at desc
  limit greatest(1, least(200, coalesce(p_limit, 50)))
  offset greatest(0, coalesce(p_offset, 0));
$$;


drop function if exists admin_mail_detail(uuid);

create or replace function admin_mail_detail(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_out json;
begin
  update mails set is_read = true where id = p_id and not is_read;

  select json_build_object(
    'mail', to_jsonb(m),
    'kullanici', (
      select json_build_object('id', p.id, 'username', p.username, 'name', p.name,
        'avatar_url', p.avatar_url, 'email', p.email, 'sehir', p.sehir,
        'role', p.role, 'is_banned', coalesce(p.is_banned,false))
      from profiles p where p.id = m.matched_user_id
    ),
    -- Aynı gönderenden gelen diğer mailler
    'gecmis', (
      select coalesce(json_agg(json_build_object(
        'id', m2.id, 'subject', m2.subject, 'received_at', m2.received_at
      ) order by m2.received_at desc), '[]'::json)
      from mails m2 where m2.from_email = m.from_email and m2.id <> p_id limit 10
    ),
    -- Bu kişiye gönderdiğimiz mailler
    'giden', (
      select coalesce(json_agg(json_build_object(
        'id', q.id, 'subject', q.subject, 'status', q.status, 'sent_at', q.sent_at
      ) order by q.created_at desc), '[]'::json)
      from mail_queue q where lower(q.to_email) = lower(m.from_email) limit 10
    )
  ) into v_out
  from mails m where m.id = p_id;

  return v_out;
end;
$$;


drop function if exists admin_mail_flag(uuid, text, boolean);

create or replace function admin_mail_flag(p_id uuid, p_field text, p_value boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_field not in ('is_read','is_starred','is_archived') then
    raise exception 'Gecersiz alan: %', p_field;
  end if;
  execute format('update mails set %I = $1 where id = $2', p_field) using p_value, p_id;
end;
$$;


drop function if exists admin_save_mail_settings(jsonb);

create or replace function admin_save_mail_settings(p_patch jsonb)
returns mail_settings language plpgsql security definer set search_path = public as $$
declare v_row mail_settings;
begin
  update mail_settings set
    provider        = coalesce(p_patch->>'provider', provider),
    smtp_host       = coalesce(p_patch->>'smtp_host', smtp_host),
    smtp_port       = coalesce((p_patch->>'smtp_port')::integer, smtp_port),
    smtp_secure     = coalesce((p_patch->>'smtp_secure')::boolean, smtp_secure),
    smtp_user       = coalesce(p_patch->>'smtp_user', smtp_user),
    -- ★ Şifre boş gelirse eskisini KORU: panel maskeli gösteriyor,
    --   her kaydetmede şifreyi tekrar yazmak zorunda kalma.
    smtp_pass       = case when nullif(p_patch->>'smtp_pass','') is null
                           then smtp_pass else p_patch->>'smtp_pass' end,
    api_key         = case when nullif(p_patch->>'api_key','') is null
                           then api_key else p_patch->>'api_key' end,
    from_email      = coalesce(p_patch->>'from_email', from_email),
    from_name       = coalesce(p_patch->>'from_name', from_name),
    reply_to        = coalesce(p_patch->>'reply_to', reply_to),
    inbound_secret  = case when nullif(p_patch->>'inbound_secret','') is null
                           then inbound_secret else p_patch->>'inbound_secret' end,
    inbound_enabled = coalesce((p_patch->>'inbound_enabled')::boolean, inbound_enabled),
    is_active       = coalesce((p_patch->>'is_active')::boolean, is_active),
    daily_limit     = coalesce((p_patch->>'daily_limit')::integer, daily_limit),
    default_template= coalesce(p_patch->>'default_template', default_template),
    signature_html  = coalesce(p_patch->>'signature_html', signature_html),
    updated_at      = now()
  where id = 1
  returning * into v_row;
  return v_row;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  12) ZAMANLANMIŞ İŞLER                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron yok — mail isleri zamanlanmadi';
    return;
  end if;

  perform cron.unschedule(jobname) from cron.job
  where jobname in ('mail_drain','ad_reminders','mail_recover');

  -- Mail kuyruğunu panele bildir (dakikada bir)
  perform cron.schedule('mail_drain', '* * * * *',
    $c$ select push_wake_panel(true); $c$);

  perform cron.schedule('mail_recover', '*/10 * * * *',
    $c$ select mail_recover_stuck(10); $c$);

  -- Reklam hatırlatmaları (günde bir, 09:00)
  perform cron.schedule('ad_reminders', '0 9 * * *',
    $c$ select ad_send_reminders(); $c$);

  raise notice 'Mail isleri zamanlandi';
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  13) YETKİLER                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin_mail%' or p.proname like 'mail_%'
           or p.proname like 'admin_media%' or p.proname like 'admin_list_media%'
           or p.proname like 'storage_%' or p.proname like 'admin_%storage%'
           or p.proname in ('ad_send_reminders','admin_save_mail_settings',
                            'admin_list_mails','admin_mail_detail','admin_mail_flag'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select key, ad, is_system from mail_templates order by key;
select admin_mail_stats() as mail_ozet;
select admin_media_stats() as medya_ozet;

-- Güvenlik tetikleyicisi kuruldu mu?
select tgname from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth' and c.relname = 'users' and not t.tgisinternal;
