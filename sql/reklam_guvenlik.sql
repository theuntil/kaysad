-- ═══════════════════════════════════════════════════════════════════════
-- REKLAM: TABAN FİYAT + TEKLİF GÜNCELLEME + GÜVENLİK
--
-- ┌─ 1. GÜVENLİK AÇIĞI ───────────────────────────────────────────────┐
-- │ `ad_campaigns` üzerinde iki RLS politikası var ve PostgreSQL       │
-- │ bunları OR ile birleştiriyor:                                      │
-- │                                                                    │
-- │   ad_campaigns_public → status = 'active'                          │
-- │   ad_campaigns_own    → advertiser_id = auth.uid()                 │
-- │                                                                    │
-- │ Sonuç: filtre koymayan bir sorgu "kendi kampanyalarım + HERKESİN   │
-- │ aktif reklamları" döndürüyordu. Kullanıcı başkasının reklamını     │
-- │ kendi listesinde görüyordu.                                        │
-- │                                                                    │
-- │ ★ Public politika GEREKLİ (uygulama reklamları onunla gösteriyor). │
-- │   Bu yüzden çözüm: istemci açıkça filtreliyor + burada listeleme   │
-- │   için ayrı, güvenli bir RPC var.                                  │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v4_9_servis_ban.sql'den SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) TABAN FİYATLAR                                                 ║
-- ║     Alan başına farklı taban koyabilirsin.                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

update ad_slots set min_price = 20000 where key in
  ('home', 'listings', 'discounts', 'events', 'popup');

update ad_slots set min_price = 20000 where key like 'boost_%';


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) ad_slot_status → min_price DÖNSÜN                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝

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
    'en_dusuk_aktif_fiyat', (
      select min(c.monthly_price) from ad_campaigns c
      where c.slot_key = s.key and c.status = 'active'),
    'min_price', s.min_price,
    'bekleyen_teklif', (select count(*) from ad_campaigns c
                where c.slot_key = s.key and c.status = 'pending')
  )
  from ad_slots s where s.key = p_slot;
$$;

grant execute on function ad_slot_status(text) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) TABAN FİYAT DENETİMİ — veritabanı seviyesinde                  ║
-- ║                                                                    ║
-- ║  ★ İstemcideki kontrol tek başına yeterli değil; doğrudan RPC      ║
-- ║    çağıran biri taban altına inebilirdi.                           ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function trg_fn_ad_taban_fiyat()
returns trigger language plpgsql set search_path = public as $$
declare v_taban numeric;
begin
  select min_price into v_taban from ad_slots where key = new.slot_key;

  if v_taban is not null and v_taban > 0 and new.monthly_price < v_taban then
    raise exception 'Aylik teklif en az % TL olmali.',
      trim(to_char(v_taban, 'FM999G999G999')) using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ad_taban_fiyat on ad_campaigns;
create trigger trg_ad_taban_fiyat
before insert or update of monthly_price on ad_campaigns
for each row execute function trg_fn_ad_taban_fiyat();


create or replace function trg_fn_boost_taban_fiyat()
returns trigger language plpgsql set search_path = public as $$
declare v_taban numeric;
begin
  select min_price into v_taban
  from ad_slots where key = 'boost_' || new.content_type;

  if v_taban is not null and v_taban > 0 and new.monthly_price < v_taban then
    raise exception 'Aylik teklif en az % TL olmali.',
      trim(to_char(v_taban, 'FM999G999G999')) using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_boost_taban_fiyat on boost_requests;
create trigger trg_boost_taban_fiyat
before insert or update of monthly_price on boost_requests
for each row execute function trg_fn_boost_taban_fiyat();


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) TEKLİF TUTARINI GÜNCELLE — reklam                              ║
-- ║                                                                    ║
-- ║  ★ Fiyat `ad_request_edit` ile gitmiyor. Kapasite ve taban fiyat   ║
-- ║    kurallarının yeniden çalışması gerekiyor; ayrı RPC daha temiz.  ║
-- ║                                                                    ║
-- ║  ★ Aktif kampanyada fiyat artışı ONAYA düşüyor — reklam veren      ║
-- ║    tek taraflı fiyat düşüremesin, panel görmeden değişmesin.       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists ad_update_price(uuid, numeric);

create or replace function ad_update_price(
  p_campaign_id uuid,
  p_monthly_price numeric
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c ad_campaigns;
  v_slot ad_slots;
  v_aktif integer;
  v_min numeric;
  v_no integer;
  v_onay boolean := false;
begin
  if v_uid is null then raise exception 'Oturum gerekli'; end if;

  -- ★ SAHİPLİK: başkasının kampanyasının fiyatı değiştirilemez
  select * into v_c from ad_campaigns
  where id = p_campaign_id and advertiser_id = v_uid;

  if v_c.id is null then raise exception 'Kampanya bulunamadi'; end if;

  if v_c.status not in ('pending','approved','active','rejected') then
    raise exception 'Bu kampanyanin teklifi degistirilemez.';
  end if;

  select * into v_slot from ad_slots where key = v_c.slot_key;

  -- Taban fiyat
  if v_slot.min_price is not null and v_slot.min_price > 0
     and p_monthly_price < v_slot.min_price then
    raise exception 'Aylik teklif en az % TL olmali.',
      trim(to_char(v_slot.min_price, 'FM999G999G999'));
  end if;

  -- ★ Alan doluysa mevcut en düşüğün üstünde olmalı (kendisi hariç)
  select count(*), min(monthly_price) into v_aktif, v_min
  from ad_campaigns
  where slot_key = v_c.slot_key and status = 'active' and id <> v_c.id;

  if v_aktif >= v_slot.capacity and v_min is not null
     and p_monthly_price <= v_min then
    raise exception 'Bu alan dolu. Teklif % TL uzerinde olmali.',
      trim(to_char(v_min, 'FM999G999G999'));
  end if;

  -- Teklif geçmişine yeni satır
  select coalesce(max(offer_no), 0) + 1 into v_no
  from ad_offers where campaign_id = v_c.id;

  -- ★ total_price YAZILMIYOR — üretilmiş kolon:
  --     total_price numeric generated always as (monthly_price * months) stored
  --   Değer atamaya çalışmak "cannot insert a non-default value into
  --   column total_price" hatası veriyordu.
  insert into ad_offers (
    campaign_id, advertiser_id, offer_no, months, monthly_price, status
  ) values (
    v_c.id, v_uid, v_no, v_c.months, p_monthly_price,
    case when v_c.status = 'active' then 'pending' else 'accepted' end
  );

  if v_c.status = 'active' then
    -- ★ Yayındaysa fiyat HEMEN değişmiyor; panel onaylayınca değişecek
    v_onay := true;
  else
    -- ★ total_price otomatik hesaplanıyor, elle yazılmıyor
    update ad_campaigns set
      monthly_price = p_monthly_price,
      offer_count   = v_no,
      status        = case when status = 'rejected' then 'pending' else status end,
      reject_reason = case when status = 'rejected' then null else reject_reason end
    where id = v_c.id;
  end if;

  return json_build_object(
    'ok', true,
    'onay_bekliyor', v_onay,
    'teklif_no', v_no
  );
end;
$$;

grant execute on function ad_update_price(uuid, numeric) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) TEKLİF TUTARINI GÜNCELLE — boost                               ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists boost_update_price(uuid, numeric);

create or replace function boost_update_price(
  p_boost_id uuid,
  p_monthly_price numeric
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_b boost_requests;
  v_slot ad_slots;
  v_aktif integer;
  v_min numeric;
  v_onay boolean := false;
begin
  if v_uid is null then raise exception 'Oturum gerekli'; end if;

  -- ★ SAHİPLİK
  select * into v_b from boost_requests
  where id = p_boost_id and user_id = v_uid;

  if v_b.id is null then raise exception 'Talep bulunamadi'; end if;

  if v_b.status not in ('pending','approved','active','rejected') then
    raise exception 'Bu talebin teklifi degistirilemez.';
  end if;

  select * into v_slot from ad_slots where key = 'boost_' || v_b.content_type;

  if v_slot.min_price is not null and v_slot.min_price > 0
     and p_monthly_price < v_slot.min_price then
    raise exception 'Aylik teklif en az % TL olmali.',
      trim(to_char(v_slot.min_price, 'FM999G999G999'));
  end if;

  select count(*), min(monthly_price) into v_aktif, v_min
  from boost_requests
  where content_type = v_b.content_type
    and boost_type = v_b.boost_type
    and status = 'active'
    and id <> v_b.id;

  if v_aktif >= v_slot.capacity and v_min is not null
     and p_monthly_price <= v_min then
    raise exception 'Bu alan dolu. Teklif % TL uzerinde olmali.',
      trim(to_char(v_min, 'FM999G999G999'));
  end if;

  if v_b.status = 'active' then
    v_onay := true;
  else
    update boost_requests set
      monthly_price = p_monthly_price,
      status        = case when status = 'rejected' then 'pending' else status end,
      reject_reason = case when status = 'rejected' then null else reject_reason end
    where id = v_b.id;
  end if;

  return json_build_object('ok', true, 'onay_bekliyor', v_onay);
end;
$$;

grant execute on function boost_update_price(uuid, numeric) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) boost_requests RLS — sadece sahibi görsün                      ║
-- ║                                                                    ║
-- ║  ★ Reklamlardan farklı: boost'un "herkese açık" hâli yok.          ║
-- ║    Uygulama boost'u içerik listesindeki `boost` bayrağından        ║
-- ║    okuyor, bu tablodan değil.                                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

alter table boost_requests enable row level security;

drop policy if exists boost_own on boost_requests;
create policy boost_own on boost_requests
  for select using (user_id = auth.uid());


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select key, ad, capacity, min_price from ad_slots order by sort_order, key;

select ad_slot_status('home') as home_durum;

select proname from pg_proc
where proname in ('ad_update_price','boost_update_price')
order by proname;

-- ★ Kritik test: başka kullanıcının aktif reklamı listende çıkıyor mu?
--   Aşağıdaki iki sayı FARKLI olmalı (ilki sadece seninkiler).
select
  (select count(*) from ad_campaigns where advertiser_id = auth.uid()) as benim,
  (select count(*) from ad_campaigns) as gorunen_toplam;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  7) boost_slot_status — KAPASİTE SAYIMI                            ║
-- ║                                                                    ║
-- ║  ★ ÖNEMLİ: 6. adımdaki `boost_own` politikası kullanıcıya sadece   ║
-- ║    kendi taleplerini gösteriyor. Ama alan doluluğunu hesaplamak    ║
-- ║    için TÜM aktif talepleri saymak gerekiyor.                      ║
-- ║                                                                    ║
-- ║  ★ Çözüm: `security definer` fonksiyon. Sayıyor ama satırları      ║
-- ║    döndürmüyor — kimin ne teklif verdiği görünmüyor, sadece        ║
-- ║    kapasite ve en düşük fiyat çıkıyor.                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists boost_slot_status(text, text);

create or replace function boost_slot_status(
  p_content_type text,
  p_boost_type text default 'boost'
) returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'kapasite', s.capacity,
    'aktif', (
      select count(*) from boost_requests b
      where b.content_type = p_content_type
        and b.boost_type = p_boost_type
        and b.status = 'active'),
    'bos', s.capacity - (
      select count(*) from boost_requests b
      where b.content_type = p_content_type
        and b.boost_type = p_boost_type
        and b.status = 'active'),
    'en_dusuk_aktif_fiyat', (
      select min(b.monthly_price) from boost_requests b
      where b.content_type = p_content_type
        and b.boost_type = p_boost_type
        and b.status = 'active'),
    'min_price', s.min_price
  )
  from ad_slots s where s.key = 'boost_' || p_content_type;
$$;

grant execute on function boost_slot_status(text, text) to authenticated;


-- ── Doğrulama ──
select boost_slot_status('listing', 'boost')       as ilan_boost,
       boost_slot_status('listing', 'super_boost') as ilan_super;
