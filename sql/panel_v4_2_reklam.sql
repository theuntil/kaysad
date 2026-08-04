-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V4.2 — REKLAM VE BOOST SİSTEMİ
--
-- ┌─ YAPI ────────────────────────────────────────────────────────────┐
-- │ ad_slots       → reklam alanları ve kapasiteleri                   │
-- │ ad_campaigns   → reklam kampanyası (içerik + durum)                │
-- │ ad_offers      → teklif geçmişi (kaçıncı teklif, fiyat, süre, not) │
-- │ ad_edits       → onay bekleyen içerik değişiklikleri               │
-- │ ad_events      → gösterim/tıklama kayıtları                        │
-- │ boost_requests → ilan/indirim/etkinlik öne çıkarma talepleri       │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ┌─ DURUM AKIŞI ─────────────────────────────────────────────────────┐
-- │ pending ──onay──> approved ──başlat──> active ──süre bitti──> expired
-- │    │                                      │                        │
-- │    └──red──> rejected                     └──yeni teklif──> paused │
-- │                 │                                                   │
-- │                 └──yeni teklif──> pending                          │
-- │ active + düzenleme talebi ──> edit_pending ──onay──> active        │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v4_1'den SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) REKLAM ALANLARI                                                ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists ad_slots (
  key           text primary key,
  ad            text not null,
  -- ★ Aynı anda kaç aktif reklam olabilir
  capacity      integer not null default 1,
  min_price     numeric(12,2) not null default 0,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

insert into ad_slots (key, ad, capacity, min_price, sort_order) values
  ('home',      'Anasayfa',   10, 0, 1),
  ('listings',  'İlanlar',     1, 0, 2),
  ('discounts', 'İndirimler',  1, 0, 3),
  ('events',    'Etkinlikler', 1, 0, 4),
  ('popup',     'Popup',       1, 0, 5)
on conflict (key) do update set ad = excluded.ad, capacity = excluded.capacity;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) KAMPANYALAR                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists ad_campaigns (
  id             uuid primary key default gen_random_uuid(),
  advertiser_id  uuid not null references profiles(id) on delete cascade,
  slot_key       text not null references ad_slots(key),

  -- İçerik
  title          text not null,
  description    text,
  image_url      text,
  logo_url       text,

  -- Yönlendirme
  target_type    text not null default 'external',
  target_value   text,

  -- Ticari
  months         integer not null default 1,
  monthly_price  numeric(12,2) not null,
  total_price    numeric(12,2) generated always as (monthly_price * months) stored,

  -- Durum
  status         text not null default 'pending',
  reject_reason  text,
  admin_note     text,
  offer_note     text,
  offer_count    integer not null default 1,

  -- Zaman
  starts_at      timestamptz,
  ends_at        timestamptz,
  approved_at    timestamptz,
  activated_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- Bildirim izleme (aynı mail iki kez gitmesin)
  notified_7d    boolean not null default false,
  notified_1d    boolean not null default false,
  notified_end   boolean not null default false,

  constraint ad_status_chk check (status in
    ('pending','approved','active','rejected','paused','expired','cancelled','edit_pending')),
  constraint ad_target_chk check (target_type in
    ('external','listing','event','discount','profile','none')),
  constraint ad_months_chk check (months in (1,2,3)),
  constraint ad_price_chk check (monthly_price > 0)
);

create index if not exists idx_ad_campaigns_slot_status on ad_campaigns (slot_key, status);
create index if not exists idx_ad_campaigns_advertiser on ad_campaigns (advertiser_id, created_at desc);
create index if not exists idx_ad_campaigns_active on ad_campaigns (ends_at) where status = 'active';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) TEKLİF GEÇMİŞİ                                                 ║
-- ║                                                                    ║
-- ║  Her teklif ayrı satır: "kaçıncı teklif" ve geçmiş burada.          ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists ad_offers (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references ad_campaigns(id) on delete cascade,
  advertiser_id uuid not null references profiles(id) on delete cascade,
  slot_key      text not null references ad_slots(key),
  offer_no      integer not null default 1,
  months        integer not null,
  monthly_price numeric(12,2) not null,
  total_price   numeric(12,2) generated always as (monthly_price * months) stored,
  note          text,
  status        text not null default 'pending',
  reject_reason text,
  decided_at    timestamptz,
  decided_by    text,
  created_at    timestamptz not null default now(),
  constraint ad_offer_status_chk check (status in ('pending','accepted','rejected','withdrawn'))
);

create index if not exists idx_ad_offers_campaign on ad_offers (campaign_id, offer_no);
create index if not exists idx_ad_offers_status on ad_offers (status, created_at desc);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) DÜZENLEME ONAYI                                                ║
-- ║                                                                    ║
-- ║  Aktif reklamın içeriği DOĞRUDAN değişmiyor: değişiklik burada      ║
-- ║  bekliyor, onaylanınca kampanyaya uygulanıyor.                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists ad_edits (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references ad_campaigns(id) on delete cascade,
  advertiser_id uuid not null references profiles(id) on delete cascade,
  patch         jsonb not null,
  status        text not null default 'pending',
  reject_reason text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    text,
  constraint ad_edit_status_chk check (status in ('pending','approved','rejected'))
);

create index if not exists idx_ad_edits_status on ad_edits (status, created_at desc);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) GÖSTERİM / TIKLAMA                                             ║
-- ║                                                                    ║
-- ║  ★ Ham olay tablosu yerine GÜNLÜK ÖZET: 1 milyon kullanıcıda ham    ║
-- ║    olay tablosu günde milyonlarca satır demek. Upsert ile gün       ║
-- ║    başına tek satır tutuyoruz.                                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists ad_stats_daily (
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  gun         date not null,
  gosterim    bigint not null default 0,
  tiklama     bigint not null default 0,
  primary key (campaign_id, gun)
);

create index if not exists idx_ad_stats_gun on ad_stats_daily (gun desc);

-- Mobil taraf bunu çağırıyor
drop function if exists ad_track(uuid, text);

create or replace function ad_track(p_campaign_id uuid, p_event text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('view', 'click') then
    raise exception 'Gecersiz olay: %', p_event;
  end if;

  insert into ad_stats_daily (campaign_id, gun, gosterim, tiklama)
  values (
    p_campaign_id, current_date,
    case when p_event = 'view' then 1 else 0 end,
    case when p_event = 'click' then 1 else 0 end
  )
  on conflict (campaign_id, gun) do update set
    gosterim = ad_stats_daily.gosterim + case when p_event = 'view' then 1 else 0 end,
    tiklama  = ad_stats_daily.tiklama  + case when p_event = 'click' then 1 else 0 end;
end;
$$;

grant execute on function ad_track(uuid, text) to authenticated, anon;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) BOOST TALEPLERİ                                                ║
-- ║                                                                    ║
-- ║  ilan / indirim / etkinlik öne çıkarma. En fazla 1 ay.              ║
-- ║  boost      → sadece kendi şehrinde öne çıkar                       ║
-- ║  super_boost→ tüm şehirlerde öne çıkar                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists boost_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles(id) on delete cascade,
  content_type  text not null,
  content_id    uuid not null,
  boost_type    text not null default 'boost',
  months        integer not null default 1,
  monthly_price numeric(12,2) not null,
  note          text,
  offer_no      integer not null default 1,
  status        text not null default 'pending',
  reject_reason text,
  starts_at     timestamptz,
  ends_at       timestamptz,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    text,
  notified_1d   boolean not null default false,
  constraint boost_type_chk check (boost_type in ('boost','super_boost')),
  constraint boost_content_chk check (content_type in ('listing','discount','event')),
  constraint boost_months_chk check (months = 1),
  constraint boost_status_chk check (status in
    ('pending','approved','active','rejected','expired','cancelled'))
);

create index if not exists idx_boost_status on boost_requests (status, created_at desc);
create index if not exists idx_boost_content on boost_requests (content_type, content_id);
create index if not exists idx_boost_active on boost_requests (ends_at) where status = 'active';

-- Alan başına aynı anda kaç boost olabilir
insert into ad_slots (key, ad, capacity, sort_order) values
  ('boost_listing',  'İlan Boost',      2, 10),
  ('boost_discount', 'İndirim Boost',   2, 11),
  ('boost_event',    'Etkinlik Boost',  2, 12)
on conflict (key) do update set capacity = excluded.capacity;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  7) İŞ KURALLARI                                                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- ── Alandaki aktif reklamlar ve kapasite ──
drop function if exists ad_slot_status(text);

create or replace function ad_slot_status(p_slot text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'slot', s.key,
    'ad', s.ad,
    'kapasite', s.capacity,
    'aktif', (select count(*) from ad_campaigns c
                where c.slot_key = s.key and c.status = 'active'),
    'bos', s.capacity - (select count(*) from ad_campaigns c
                where c.slot_key = s.key and c.status = 'active'),
    -- ★ Yeni teklif bunun ÜSTÜNDE olmak zorunda
    'en_dusuk_aktif_fiyat', (
      select min(c.monthly_price) from ad_campaigns c
      where c.slot_key = s.key and c.status = 'active'),
    'bekleyen_teklif', (select count(*) from ad_campaigns c
                where c.slot_key = s.key and c.status = 'pending')
  )
  from ad_slots s where s.key = p_slot;
$$;

grant execute on function ad_slot_status(text) to authenticated;


-- ── TEKLİF OLUŞTUR (reklam veren çağırıyor) ──
drop function if exists ad_submit_offer(text, text, text, text, text, text, text, integer, numeric, text);

create or replace function ad_submit_offer(
  p_slot text,
  p_title text,
  p_description text default null,
  p_image_url text default null,
  p_logo_url text default null,
  p_target_type text default 'external',
  p_target_value text default null,
  p_months integer default 1,
  p_monthly_price numeric default null,
  p_note text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot ad_slots;
  v_min_aktif numeric;
  v_camp ad_campaigns;
  v_offer_no integer;
  v_aktif_adet integer;
begin
  if v_uid is null then raise exception 'Oturum gerekli'; end if;
  if p_monthly_price is null or p_monthly_price <= 0 then
    raise exception 'Aylik fiyat zorunlu';
  end if;
  if p_months not in (1,2,3) then
    raise exception 'Sure 1, 2 veya 3 ay olabilir';
  end if;

  select * into v_slot from ad_slots where key = p_slot and is_active;
  if v_slot.key is null then raise exception 'Gecersiz reklam alani: %', p_slot; end if;

  -- ★ Alan doluysa: yeni teklif mevcut EN DÜŞÜK aktif fiyattan yüksek olmalı
  select count(*), min(monthly_price) into v_aktif_adet, v_min_aktif
  from ad_campaigns where slot_key = p_slot and status = 'active';

  if v_aktif_adet >= v_slot.capacity and v_min_aktif is not null
     and p_monthly_price <= v_min_aktif then
    raise exception
      'Bu alan dolu. Teklif verebilmek icin aylik fiyat %  TL uzerinde olmali.', v_min_aktif;
  end if;

  -- Kullanıcının bu alandaki kaçıncı teklifi
  select coalesce(max(offer_count), 0) + 1 into v_offer_no
  from ad_campaigns where advertiser_id = v_uid and slot_key = p_slot;

  insert into ad_campaigns (
    advertiser_id, slot_key, title, description, image_url, logo_url,
    target_type, target_value, months, monthly_price, offer_note, offer_count, status
  ) values (
    v_uid, p_slot, p_title, p_description, p_image_url, p_logo_url,
    coalesce(p_target_type,'external'), p_target_value, p_months, p_monthly_price,
    p_note, v_offer_no, 'pending'
  ) returning * into v_camp;

  insert into ad_offers (
    campaign_id, advertiser_id, slot_key, offer_no, months, monthly_price, note
  ) values (
    v_camp.id, v_uid, p_slot, v_offer_no, p_months, p_monthly_price, p_note
  );

  return json_build_object(
    'campaign_id', v_camp.id,
    'durum', v_camp.status,
    'teklif_no', v_offer_no,
    'toplam', v_camp.total_price
  );
end;
$$;

grant execute on function ad_submit_offer(text,text,text,text,text,text,text,integer,numeric,text) to authenticated;


-- ── DÜZENLEME TALEBİ (reklam veren) ──
drop function if exists ad_request_edit(uuid, jsonb);

create or replace function ad_request_edit(p_campaign_id uuid, p_patch jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_camp ad_campaigns;
  v_id uuid;
  v_key text;
  v_izinli text[] := array['title','description','image_url','logo_url','target_type','target_value'];
begin
  if v_uid is null then raise exception 'Oturum gerekli'; end if;

  select * into v_camp from ad_campaigns where id = p_campaign_id;
  if v_camp.id is null then raise exception 'Kampanya bulunamadi'; end if;
  if v_camp.advertiser_id <> v_uid then raise exception 'Bu kampanya size ait degil'; end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if v_key <> all(v_izinli) then
      raise exception 'Bu alan degistirilemez: %', v_key;
    end if;
  end loop;

  -- ★ Aktif değilse doğrudan uygula (henüz yayında değil, onaya gerek yok)
  if v_camp.status in ('pending','rejected','draft') then
    update ad_campaigns set
      title = coalesce(p_patch->>'title', title),
      description = coalesce(p_patch->>'description', description),
      image_url = coalesce(p_patch->>'image_url', image_url),
      logo_url = coalesce(p_patch->>'logo_url', logo_url),
      target_type = coalesce(p_patch->>'target_type', target_type),
      target_value = coalesce(p_patch->>'target_value', target_value),
      updated_at = now()
    where id = p_campaign_id;
    return json_build_object('dogrudan_uygulandi', true);
  end if;

  insert into ad_edits (campaign_id, advertiser_id, patch)
  values (p_campaign_id, v_uid, p_patch)
  returning id into v_id;

  update ad_campaigns set status = 'edit_pending', updated_at = now()
  where id = p_campaign_id and status = 'active';

  return json_build_object('edit_id', v_id, 'onay_bekliyor', true);
end;
$$;

grant execute on function ad_request_edit(uuid, jsonb) to authenticated;


-- ── PANEL: TEKLİFİ ONAYLA ──
drop function if exists admin_ad_approve(uuid, text);

create or replace function admin_ad_approve(p_campaign_id uuid, p_by text default 'panel')
returns json language plpgsql security definer set search_path = public as $$
declare
  v_camp ad_campaigns;
  v_slot ad_slots;
  v_aktif integer;
begin
  select * into v_camp from ad_campaigns where id = p_campaign_id;
  if v_camp.id is null then raise exception 'Kampanya bulunamadi'; end if;
  if v_camp.status not in ('pending','approved') then
    raise exception 'Bu kampanya onaylanamaz (durum: %)', v_camp.status;
  end if;

  select * into v_slot from ad_slots where key = v_camp.slot_key;
  select count(*) into v_aktif from ad_campaigns
  where slot_key = v_camp.slot_key and status = 'active';

  -- ★ Alan doluysa AKTİFLEŞTİRMİYORUZ: önce mevcut reklam pasife alınmalı.
  --   Kampanya 'approved' olarak bekliyor; panel uyarıyor.
  if v_aktif >= v_slot.capacity then
    update ad_campaigns set
      status = 'approved', approved_at = now(), reject_reason = null, updated_at = now()
    where id = p_campaign_id;

    return json_build_object(
      'durum', 'approved',
      'aktif_edilemedi', true,
      'sebep', format('%s alani dolu (%s/%s). Once mevcut reklami pasife al.',
                      v_slot.ad, v_aktif, v_slot.capacity)
    );
  end if;

  update ad_campaigns set
    status = 'active',
    approved_at = coalesce(approved_at, now()),
    activated_at = now(),
    starts_at = now(),
    ends_at = now() + make_interval(months => v_camp.months),
    reject_reason = null,
    notified_7d = false, notified_1d = false, notified_end = false,
    updated_at = now()
  where id = p_campaign_id;

  update ad_offers set status = 'accepted', decided_at = now(), decided_by = p_by
  where campaign_id = p_campaign_id and status = 'pending';

  return json_build_object('durum', 'active', 'bitis', now() + make_interval(months => v_camp.months));
end;
$$;


-- ── PANEL: TEKLİFİ REDDET ──
drop function if exists admin_ad_reject(uuid, text, text);

create or replace function admin_ad_reject(
  p_campaign_id uuid, p_reason text, p_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
begin
  if nullif(trim(coalesce(p_reason,'')), '') is null then
    raise exception 'Red sebebi zorunlu';
  end if;

  update ad_campaigns set
    status = 'rejected', reject_reason = trim(p_reason), updated_at = now()
  where id = p_campaign_id;

  update ad_offers set
    status = 'rejected', reject_reason = trim(p_reason),
    decided_at = now(), decided_by = p_by
  where campaign_id = p_campaign_id and status = 'pending';

  return json_build_object('durum', 'rejected');
end;
$$;


-- ── PANEL: AKTİF REKLAMI PASİFE AL (silmez) ──
drop function if exists admin_ad_pause(uuid);

create or replace function admin_ad_pause(p_campaign_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  update ad_campaigns set status = 'paused', updated_at = now()
  where id = p_campaign_id and status in ('active','edit_pending');

  if not found then raise exception 'Sadece aktif reklam pasife alinabilir'; end if;
  return json_build_object('durum', 'paused');
end;
$$;


drop function if exists admin_ad_resume(uuid);

create or replace function admin_ad_resume(p_campaign_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_camp ad_campaigns;
  v_slot ad_slots;
  v_aktif integer;
begin
  select * into v_camp from ad_campaigns where id = p_campaign_id;
  if v_camp.status <> 'paused' then raise exception 'Kampanya pasif degil'; end if;

  select * into v_slot from ad_slots where key = v_camp.slot_key;
  select count(*) into v_aktif from ad_campaigns
  where slot_key = v_camp.slot_key and status = 'active';

  if v_aktif >= v_slot.capacity then
    raise exception '% alani dolu (%/%). Once baska bir reklami pasife al.',
      v_slot.ad, v_aktif, v_slot.capacity;
  end if;

  update ad_campaigns set status = 'active', updated_at = now() where id = p_campaign_id;
  return json_build_object('durum', 'active');
end;
$$;


-- ── PANEL: DÜZENLEME ONAYI ──
drop function if exists admin_ad_edit_decide(uuid, boolean, text, text);

create or replace function admin_ad_edit_decide(
  p_edit_id uuid, p_approve boolean, p_reason text default null, p_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_edit ad_edits;
  v_patch jsonb;
begin
  select * into v_edit from ad_edits where id = p_edit_id;
  if v_edit.id is null then raise exception 'Duzenleme talebi bulunamadi'; end if;
  if v_edit.status <> 'pending' then raise exception 'Bu talep zaten karara baglanmis'; end if;

  if p_approve then
    v_patch := v_edit.patch;

    update ad_campaigns set
      title = coalesce(v_patch->>'title', title),
      description = coalesce(v_patch->>'description', description),
      image_url = coalesce(v_patch->>'image_url', image_url),
      logo_url = coalesce(v_patch->>'logo_url', logo_url),
      target_type = coalesce(v_patch->>'target_type', target_type),
      target_value = coalesce(v_patch->>'target_value', target_value),
      status = case when status = 'edit_pending' then 'active' else status end,
      updated_at = now()
    where id = v_edit.campaign_id;

    update ad_edits set status = 'approved', decided_at = now(), decided_by = p_by
    where id = p_edit_id;

    return json_build_object('durum', 'approved');
  end if;

  if nullif(trim(coalesce(p_reason,'')), '') is null then
    raise exception 'Red sebebi zorunlu';
  end if;

  update ad_edits set status = 'rejected', reject_reason = trim(p_reason),
                      decided_at = now(), decided_by = p_by
  where id = p_edit_id;

  -- Kampanya eski içeriğiyle yayında kalmaya devam eder
  update ad_campaigns set status = 'active', updated_at = now()
  where id = v_edit.campaign_id and status = 'edit_pending';

  return json_build_object('durum', 'rejected');
end;
$$;


-- ── SÜRESİ DOLANLARI KAPAT (cron) ──
drop function if exists ad_expire_due();

create or replace function ad_expire_due()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_reklam integer;
  v_boost integer;
begin
  update ad_campaigns set status = 'expired', updated_at = now()
  where status in ('active','edit_pending') and ends_at is not null and ends_at < now();
  get diagnostics v_reklam = row_count;

  -- Boost süresi dolanlar
  update boost_requests set status = 'expired', decided_at = now()
  where status = 'active' and ends_at is not null and ends_at < now();
  get diagnostics v_boost = row_count;

  perform boost_apply_flags();

  return json_build_object('reklam', v_reklam, 'boost', v_boost);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  8) BOOST İŞ KURALLARI                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- İçerik tablosundaki boost bayraklarını aktif taleplere göre senkronla
drop function if exists boost_apply_flags();

create or replace function boost_apply_flags()
returns void language plpgsql security definer set search_path = public as $$
declare
  v_map record;
begin
  for v_map in
    select * from (values
      ('listing',  'listings'),
      ('discount', 'indirimler'),
      ('event',    'etkinlikler')
    ) as t(tip, tablo)
  loop
    continue when not exists (
      select 1 from information_schema.tables
      where table_schema='public' and table_name=v_map.tablo);
    continue when not exists (
      select 1 from information_schema.columns
      where table_schema='public' and table_name=v_map.tablo and column_name='boost');

    -- Önce hepsini kapat
    execute format(
      'update %I set boost = false, super_boost = false
       where coalesce(boost,false) or coalesce(super_boost,false)', v_map.tablo);

    -- Aktif boost'ları aç
    execute format(
      'update %I t set boost = true
       from boost_requests b
       where b.content_id = t.id and b.content_type = $1
         and b.status = ''active'' and b.boost_type = ''boost''
         and (b.ends_at is null or b.ends_at > now())', v_map.tablo)
    using v_map.tip;

    execute format(
      'update %I t set boost = true, super_boost = true
       from boost_requests b
       where b.content_id = t.id and b.content_type = $1
         and b.status = ''active'' and b.boost_type = ''super_boost''
         and (b.ends_at is null or b.ends_at > now())', v_map.tablo)
    using v_map.tip;
  end loop;
end;
$$;


-- ── BOOST TEKLİFİ (kullanıcı) ──
drop function if exists boost_submit(text, uuid, text, numeric, text);

create or replace function boost_submit(
  p_content_type text,
  p_content_id uuid,
  p_boost_type text default 'boost',
  p_monthly_price numeric default null,
  p_note text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot_key text := 'boost_' || p_content_type;
  v_slot ad_slots;
  v_aktif integer;
  v_min numeric;
  v_no integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Oturum gerekli'; end if;
  if p_monthly_price is null or p_monthly_price <= 0 then
    raise exception 'Fiyat zorunlu';
  end if;
  if p_boost_type not in ('boost','super_boost') then
    raise exception 'Gecersiz boost tipi';
  end if;

  select * into v_slot from ad_slots where key = v_slot_key;
  if v_slot.key is null then raise exception 'Gecersiz icerik tipi: %', p_content_type; end if;

  select count(*), min(monthly_price) into v_aktif, v_min
  from boost_requests
  where content_type = p_content_type and boost_type = p_boost_type and status = 'active';

  -- ★ Kapasite doluysa mevcut en düşük tekliften yüksek olmalı
  if v_aktif >= v_slot.capacity and v_min is not null and p_monthly_price <= v_min then
    raise exception 'Bu alan dolu. Teklif % TL uzerinde olmali.', v_min;
  end if;

  select coalesce(max(offer_no), 0) + 1 into v_no
  from boost_requests where user_id = v_uid and content_id = p_content_id;

  insert into boost_requests (
    user_id, content_type, content_id, boost_type, months, monthly_price, note, offer_no
  ) values (
    v_uid, p_content_type, p_content_id, p_boost_type, 1, p_monthly_price, p_note, v_no
  ) returning id into v_id;

  return json_build_object('id', v_id, 'teklif_no', v_no, 'durum', 'pending');
end;
$$;

grant execute on function boost_submit(text, uuid, text, numeric, text) to authenticated;


drop function if exists admin_boost_decide(uuid, boolean, text, text);

create or replace function admin_boost_decide(
  p_id uuid, p_approve boolean, p_reason text default null, p_by text default 'panel'
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_req boost_requests;
  v_slot ad_slots;
  v_aktif integer;
begin
  select * into v_req from boost_requests where id = p_id;
  if v_req.id is null then raise exception 'Talep bulunamadi'; end if;

  if not p_approve then
    if nullif(trim(coalesce(p_reason,'')), '') is null then
      raise exception 'Red sebebi zorunlu';
    end if;
    update boost_requests set status = 'rejected', reject_reason = trim(p_reason),
                              decided_at = now(), decided_by = p_by
    where id = p_id;
    return json_build_object('durum', 'rejected');
  end if;

  select * into v_slot from ad_slots where key = 'boost_' || v_req.content_type;
  select count(*) into v_aktif from boost_requests
  where content_type = v_req.content_type and boost_type = v_req.boost_type and status = 'active';

  if v_aktif >= v_slot.capacity then
    raise exception 'Bu alan dolu (%/%). Once mevcut boost''u durdur.', v_aktif, v_slot.capacity;
  end if;

  update boost_requests set
    status = 'active', starts_at = now(), ends_at = now() + interval '1 month',
    decided_at = now(), decided_by = p_by, reject_reason = null, notified_1d = false
  where id = p_id;

  perform boost_apply_flags();
  return json_build_object('durum', 'active', 'bitis', now() + interval '1 month');
end;
$$;


drop function if exists admin_boost_stop(uuid);

create or replace function admin_boost_stop(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  update boost_requests set status = 'cancelled', decided_at = now() where id = p_id;
  perform boost_apply_flags();
  return json_build_object('durum', 'cancelled');
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  9) PANEL LİSTELERİ                                                ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_ad_counts();

create or replace function admin_ad_counts()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'bekleyen',      (select count(*) from ad_campaigns where status = 'pending'),
    'aktif',         (select count(*) from ad_campaigns where status = 'active'),
    'onayli_bekler', (select count(*) from ad_campaigns where status = 'approved'),
    'duzenleme',     (select count(*) from ad_edits where status = 'pending'),
    'boost_bekleyen',(select count(*) from boost_requests where status = 'pending'),
    'boost_aktif',   (select count(*) from boost_requests where status = 'active'),
    'yakinda_biten', (select count(*) from ad_campaigns
                        where status = 'active' and ends_at < now() + interval '7 days'),
    'aylik_gelir',   (select coalesce(sum(monthly_price), 0) from ad_campaigns where status = 'active'),
    'alanlar', (
      select coalesce(json_agg(x order by x.sort_order), '[]'::json) from (
        select s.key, s.ad, s.capacity, s.sort_order,
               (select count(*) from ad_campaigns c where c.slot_key = s.key and c.status = 'active') as aktif
        from ad_slots s where s.is_active and s.key not like 'boost_%'
      ) x
    )
  );
$$;


drop function if exists admin_list_ads(text, text, integer);

create or replace function admin_list_ads(
  p_status text default null,
  p_slot text default null,
  p_limit integer default 100
) returns table (
  id uuid, advertiser_id uuid, advertiser_username text, advertiser_name text,
  advertiser_avatar text, advertiser_email text,
  slot_key text, slot_ad text,
  title text, description text, image_url text, logo_url text,
  target_type text, target_value text,
  months integer, monthly_price numeric, total_price numeric,
  status text, reject_reason text, offer_note text, offer_count integer,
  starts_at timestamptz, ends_at timestamptz, created_at timestamptz,
  kalan_gun integer, gosterim bigint, tiklama bigint,
  bekleyen_duzenleme bigint
)
language sql security definer set search_path = public as $$
  select
    c.id, c.advertiser_id, p.username::text, p.name::text, p.avatar_url, p.email,
    c.slot_key, s.ad,
    c.title, c.description, c.image_url, c.logo_url,
    c.target_type, c.target_value,
    c.months, c.monthly_price, c.total_price,
    c.status, c.reject_reason, c.offer_note, c.offer_count,
    c.starts_at, c.ends_at, c.created_at,
    case when c.ends_at is null then null
         else greatest(0, extract(day from c.ends_at - now())::int) end,
    coalesce((select sum(gosterim) from ad_stats_daily d where d.campaign_id = c.id), 0),
    coalesce((select sum(tiklama)  from ad_stats_daily d where d.campaign_id = c.id), 0),
    (select count(*) from ad_edits e where e.campaign_id = c.id and e.status = 'pending')
  from ad_campaigns c
  join ad_slots s on s.key = c.slot_key
  left join profiles p on p.id = c.advertiser_id
  where (p_status is null or trim(p_status) = '' or c.status = p_status)
    and (p_slot is null or trim(p_slot) = '' or c.slot_key = p_slot)
  order by
    case c.status when 'pending' then 0 when 'edit_pending' then 1
                  when 'approved' then 2 when 'active' then 3 else 4 end,
    c.created_at desc
  limit greatest(1, least(500, coalesce(p_limit, 100)));
$$;


drop function if exists admin_ad_detail(uuid);

create or replace function admin_ad_detail(p_id uuid)
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'kampanya', (
      select to_jsonb(c) || jsonb_build_object(
        'slot_ad', s.ad,
        'kalan_gun', case when c.ends_at is null then null
                          else greatest(0, extract(day from c.ends_at - now())::int) end)
      from ad_campaigns c join ad_slots s on s.key = c.slot_key where c.id = p_id
    ),
    'reklamveren', (
      select json_build_object('id', p.id, 'username', p.username, 'name', p.name,
        'avatar_url', p.avatar_url, 'email', p.email, 'phone', p.phone,
        'sehir', p.sehir, 'business_name', p.business_name)
      from profiles p join ad_campaigns c on c.advertiser_id = p.id where c.id = p_id
    ),
    'teklifler', (
      select coalesce(json_agg(o order by o.offer_no desc), '[]'::json)
      from ad_offers o where o.campaign_id = p_id
    ),
    'duzenlemeler', (
      select coalesce(json_agg(e order by e.created_at desc), '[]'::json)
      from ad_edits e where e.campaign_id = p_id
    ),
    'istatistik', (
      select json_build_object(
        'gosterim', coalesce(sum(gosterim), 0),
        'tiklama', coalesce(sum(tiklama), 0),
        'gunluk', coalesce(json_agg(json_build_object(
          'gun', gun, 'gosterim', gosterim, 'tiklama', tiklama) order by gun), '[]'::json))
      from ad_stats_daily where campaign_id = p_id
    )
  );
$$;


drop function if exists admin_list_boosts(text, integer);

create or replace function admin_list_boosts(p_status text default null, p_limit integer default 100)
returns table (
  id uuid, user_id uuid, username text, avatar_url text, email text,
  content_type text, content_id uuid, content_title text,
  boost_type text, monthly_price numeric, note text, offer_no integer,
  status text, reject_reason text,
  starts_at timestamptz, ends_at timestamptz, created_at timestamptz,
  kalan_gun integer
)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select b.id, b.user_id, p.username::text, p.avatar_url, p.email,
    b.content_type, b.content_id,
    -- İçerik başlığını dinamik çek
    (case b.content_type
      when 'listing'  then (select t.title from listings t where t.id = b.content_id)
      when 'discount' then (select t.title from indirimler t where t.id = b.content_id)
      when 'event'    then (select t.title from etkinlikler t where t.id = b.content_id)
     end)::text,
    b.boost_type, b.monthly_price, b.note, b.offer_no,
    b.status, b.reject_reason, b.starts_at, b.ends_at, b.created_at,
    case when b.ends_at is null then null
         else greatest(0, extract(day from b.ends_at - now())::int) end
  from boost_requests b
  left join profiles p on p.id = b.user_id
  where (p_status is null or trim(p_status) = '' or b.status = p_status)
  order by case b.status when 'pending' then 0 when 'active' then 1 else 2 end, b.created_at desc
  limit greatest(1, least(500, coalesce(p_limit, 100)));
exception when others then
  -- İçerik tablolarından biri yoksa başlıksız döndür
  return query
  select b.id, b.user_id, p.username::text, p.avatar_url, p.email,
    b.content_type, b.content_id, null::text,
    b.boost_type, b.monthly_price, b.note, b.offer_no,
    b.status, b.reject_reason, b.starts_at, b.ends_at, b.created_at,
    case when b.ends_at is null then null
         else greatest(0, extract(day from b.ends_at - now())::int) end
  from boost_requests b
  left join profiles p on p.id = b.user_id
  where (p_status is null or trim(p_status) = '' or b.status = p_status)
  order by b.created_at desc
  limit greatest(1, least(500, coalesce(p_limit, 100)));
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  10) RLS — reklam veren sadece kendi kaydını görür                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

alter table ad_campaigns   enable row level security;
alter table ad_offers      enable row level security;
alter table ad_edits       enable row level security;
alter table ad_stats_daily enable row level security;
alter table boost_requests enable row level security;
alter table ad_slots       enable row level security;

-- Alanlar herkese açık (fiyat/kapasite görünsün)
drop policy if exists ad_slots_read on ad_slots;
create policy ad_slots_read on ad_slots for select using (true);

-- ★ Aktif reklamlar herkese görünür (uygulama bunları gösteriyor)
drop policy if exists ad_campaigns_public on ad_campaigns;
create policy ad_campaigns_public on ad_campaigns
  for select using (status = 'active');

-- ★ Reklam veren kendi kampanyalarının HEPSİNİ görür (durum ne olursa olsun)
drop policy if exists ad_campaigns_own on ad_campaigns;
create policy ad_campaigns_own on ad_campaigns
  for select using (advertiser_id = auth.uid());

drop policy if exists ad_offers_own on ad_offers;
create policy ad_offers_own on ad_offers
  for select using (advertiser_id = auth.uid());

drop policy if exists ad_edits_own on ad_edits;
create policy ad_edits_own on ad_edits
  for select using (advertiser_id = auth.uid());

drop policy if exists ad_stats_own on ad_stats_daily;
create policy ad_stats_own on ad_stats_daily
  for select using (exists (
    select 1 from ad_campaigns c
    where c.id = ad_stats_daily.campaign_id and c.advertiser_id = auth.uid()));

drop policy if exists boost_own on boost_requests;
create policy boost_own on boost_requests
  for select using (user_id = auth.uid());

-- ★ Yazma yok: her şey security definer fonksiyonlardan geçiyor.
--   Böylece fiyat/durum alanları istemciden değiştirilemiyor.


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  11) ZAMANLANMIŞ İŞ                                                ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron yok — reklam suresi kontrolu zamanlanmadi';
    return;
  end if;
  perform cron.unschedule(jobname) from cron.job where jobname = 'ad_expire';
  perform cron.schedule('ad_expire', '10 * * * *', $c$ select ad_expire_due(); $c$);
  raise notice 'ad_expire zamanlandi (saat basi)';
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  12) YETKİLER                                                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like 'admin_ad%' or p.proname like 'admin_boost%'
           or p.proname in ('ad_expire_due','boost_apply_flags','admin_list_ads','admin_list_boosts'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

grant select on ad_slots to anon, authenticated;
grant select on ad_campaigns, ad_offers, ad_edits, ad_stats_daily, boost_requests to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select key, ad, capacity from ad_slots order by sort_order;
select admin_ad_counts() as reklam_ozet;
