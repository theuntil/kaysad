-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V4.5 — BUCKET'LAR + IMAP + ŞEHİR DETAYI + İSTATİSTİKLER
--
-- ★ panel_v4_4'ten SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) STORAGE BUCKET'LARI                                            ║
-- ║                                                                    ║
-- ║  ★ "Bucket not found" hatasının sebebi buydu. Bucket'lar SQL'den    ║
-- ║    oluşturuluyor; Supabase panelinden elle açmaya gerek yok.        ║
-- ╚═══════════════════════════════════════════════════════════════════╝

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('galeri', 'galeri', true, 209715200, null),   -- 200 MB, medya galerisi
  ('reklam', 'reklam', true, 20971520,  null),   -- 20 MB, reklam görselleri
  ('media',  'media',  true, 52428800,  null)    -- 50 MB, profil görselleri
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;


-- ── Bucket politikaları ──
-- Okuma herkese açık (uygulamada gösterilecek), yazma service_role'a ait.
do $$
declare b text;
begin
  foreach b in array array['galeri', 'reklam', 'media'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_public_read');
    execute format(
      'create policy %I on storage.objects for select using (bucket_id = %L)',
      b || '_public_read', b);

    -- Panel service_role ile yazıyor; RLS'yi bypass ediyor.
    -- Yine de authenticated kullanıcıların yazamayacağından emin olalım:
    execute format('drop policy if exists %I on storage.objects', b || '_no_write');
  end loop;
  raise notice 'Bucket politikalari kuruldu: galeri, reklam, media';
exception when insufficient_privilege then
  raise notice 'storage.objects uzerinde politika olusturma yetkisi yok — Supabase panelinden Public yapin';
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) MAİL: IMAP ALANLARI                                            ║
-- ║                                                                    ║
-- ║  ★ Webhook yerine IMAP: Hostinger gibi klasik mail sunucularında    ║
-- ║    webhook yok. Panel IMAP'e bağlanıp yeni mailleri çekiyor         ║
-- ║    (kalıcı dinleme değil, tek seferlik "getir" — bu Next.js'te      ║
-- ║    sorunsuz çalışıyor).                                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝

alter table mail_settings add column if not exists imap_host text;
alter table mail_settings add column if not exists imap_port integer default 993;
alter table mail_settings add column if not exists imap_secure boolean default true;
alter table mail_settings add column if not exists imap_user text;
alter table mail_settings add column if not exists imap_pass text;
alter table mail_settings add column if not exists imap_folder text default 'INBOX';
alter table mail_settings add column if not exists imap_enabled boolean default false;
alter table mail_settings add column if not exists imap_last_uid bigint default 0;
alter table mail_settings add column if not exists imap_last_sync timestamptz;

-- Ayar kaydetme: IMAP alanları da desteklensin
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
    -- ★ Boş şifre = "değiştirme"
    smtp_pass       = case when nullif(p_patch->>'smtp_pass','') is null
                           then smtp_pass else p_patch->>'smtp_pass' end,
    api_key         = case when nullif(p_patch->>'api_key','') is null
                           then api_key else p_patch->>'api_key' end,
    from_email      = coalesce(p_patch->>'from_email', from_email),
    from_name       = coalesce(p_patch->>'from_name', from_name),
    reply_to        = coalesce(p_patch->>'reply_to', reply_to),
    -- IMAP
    imap_host       = coalesce(p_patch->>'imap_host', imap_host),
    imap_port       = coalesce((p_patch->>'imap_port')::integer, imap_port),
    imap_secure     = coalesce((p_patch->>'imap_secure')::boolean, imap_secure),
    imap_user       = coalesce(p_patch->>'imap_user', imap_user),
    imap_pass       = case when nullif(p_patch->>'imap_pass','') is null
                           then imap_pass else p_patch->>'imap_pass' end,
    imap_folder     = coalesce(p_patch->>'imap_folder', imap_folder),
    imap_enabled    = coalesce((p_patch->>'imap_enabled')::boolean, imap_enabled),
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


drop function if exists admin_mail_sync_state(bigint);

create or replace function admin_mail_sync_state(p_uid bigint default null)
returns json language plpgsql security definer set search_path = public as $$
declare v_row mail_settings;
begin
  if p_uid is not null then
    update mail_settings
    set imap_last_uid = greatest(coalesce(imap_last_uid, 0), p_uid),
        imap_last_sync = now()
    where id = 1;
  end if;

  select * into v_row from mail_settings where id = 1;
  return json_build_object(
    'last_uid', coalesce(v_row.imap_last_uid, 0),
    'last_sync', v_row.imap_last_sync
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) ŞEHİR DETAYI                                                   ║
-- ║                                                                    ║
-- ║  ★ İçerik tabloları şehir kolonu tutmuyor olabilir; o yüzden        ║
-- ║    içerikler SAHİBİNİN şehri üzerinden sayılıyor.                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_city_detail(text);

create or replace function admin_city_detail(p_sehir text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_out jsonb;
  v_kind text;
  v_tbl text;
  v_owner text;
  v_date text;
  v_n bigint;
  v_yeni bigint;
  v_icerik jsonb := '{}'::jsonb;
begin
  -- İçerik sayıları: sahibi bu şehirde olanlar
  foreach v_kind in array array['post','listing','discount','event'] loop
    v_tbl := _admin_content_table(v_kind);
    v_n := null; v_yeni := null;

    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=v_tbl) then
      v_owner := _admin_owner_column(v_tbl);
      v_date := _admin_date_column(v_tbl);

      if v_owner is not null then
        execute format(
          'select count(*) from %I t
           where t.%I in (select p.id from profiles p where p.sehir = $1)',
          v_tbl, v_owner) into v_n using p_sehir;

        if v_date <> 'id' then
          execute format(
            'select count(*) from %I t
             where t.%I in (select p.id from profiles p where p.sehir = $1)
               and t.%I > now() - interval ''30 days''',
            v_tbl, v_owner, v_date) into v_yeni using p_sehir;
        end if;
      end if;
    end if;

    v_icerik := v_icerik || jsonb_build_object(
      v_kind, jsonb_build_object('toplam', v_n, 'son_30_gun', v_yeni));
  end loop;

  select jsonb_build_object(
    'sehir', p_sehir,

    /* ── Kullanıcı ── */
    'kullanici', (select count(*) from profiles where sehir = p_sehir),
    'aktif',     (select count(*) from profiles
                    where sehir = p_sehir and coalesce(is_banned,false) = false),
    'banli',     (select count(*) from profiles
                    where sehir = p_sehir and coalesce(is_banned,false)),
    'isletme',   (select count(*) from profiles
                    where sehir = p_sehir and role = 'business'),
    'ogrenci',   (select count(*) from profiles
                    where sehir = p_sehir and coalesce(ogrenci,false)),
    'dogrulanmis',(select count(*) from profiles
                    where sehir = p_sehir and coalesce(verify,false)),
    'yeni_7g',   (select count(*) from profiles
                    where sehir = p_sehir and created_at > now() - interval '7 days'),
    'yeni_30g',  (select count(*) from profiles
                    where sehir = p_sehir and created_at > now() - interval '30 days'),
    'ilk_kayit', (select min(created_at) from profiles where sehir = p_sehir),
    'son_kayit', (select max(created_at) from profiles where sehir = p_sehir),

    /* ── Cihaz ── */
    'cihaz', (select count(distinct d.device_id) from devices d
                where d.user_id in (select id from profiles where sehir = p_sehir)),
    'push_cihaz', (select count(distinct d.device_id) from devices d
                     where d.user_id in (select id from profiles where sehir = p_sehir)
                       and d.push_token is not null and d.push_token <> ''),
    'platformlar', (
      select coalesce(jsonb_agg(x order by x.adet desc), '[]'::jsonb) from (
        select coalesce(d.platform,'bilinmiyor') as platform,
               count(distinct d.device_id) as adet
        from devices d
        where d.user_id in (select id from profiles where sehir = p_sehir)
        group by coalesce(d.platform,'bilinmiyor')
      ) x
    ),

    /* ── Bekleyen iş ── */
    'bekleyen_isletme', (select count(*) from profiles
                           where sehir = p_sehir and business_durum = 'pending'),
    'bekleyen_ogrenci', (select count(*) from profiles
                           where sehir = p_sehir and ogrenci_durum = 'pending'),

    /* ── Büyüme (son 12 hafta) ── */
    'buyume', (
      select coalesce(jsonb_agg(g order by g.hafta), '[]'::jsonb) from (
        select date_trunc('week', created_at)::date as hafta, count(*) as adet
        from profiles
        where sehir = p_sehir and created_at > now() - interval '12 weeks'
        group by date_trunc('week', created_at)::date
      ) g
    ),

    /* ── En aktif kullanıcılar ── */
    'top_kullanici', (
      select coalesce(jsonb_agg(u order by u.post_count desc nulls last), '[]'::jsonb) from (
        select id, username, name, avatar_url, role,
               coalesce(post_count,0) as post_count,
               coalesce(follower_count,0) as follower_count
        from profiles
        where sehir = p_sehir
        order by coalesce(post_count,0) desc
        limit 8
      ) u
    ),

    /* ── Şehir sırası ── */
    'sira', (
      select sira from (
        select sehir, row_number() over (order by count(*) desc) as sira
        from profiles where sehir is not null group by sehir
      ) t where t.sehir = p_sehir
    ),
    'toplam_kullanici', (select count(*) from profiles where sehir is not null)
  ) into v_out;

  return (v_out || jsonb_build_object('icerik', v_icerik))::json;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) KAPSAMLI İSTATİSTİK                                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_full_stats();

create or replace function admin_full_stats()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_icerik jsonb := '{}'::jsonb;
  v_kind text;
  v_tbl text;
  v_date text;
  v_n bigint; v_7 bigint; v_30 bigint;
begin
  foreach v_kind in array array['post','listing','discount','event'] loop
    v_tbl := _admin_content_table(v_kind);
    v_n := null; v_7 := null; v_30 := null;

    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=v_tbl) then
      execute format('select count(*) from %I', v_tbl) into v_n;
      v_date := _admin_date_column(v_tbl);
      if v_date <> 'id' then
        execute format('select count(*) from %I where %I > now() - interval ''7 days''',
                       v_tbl, v_date) into v_7;
        execute format('select count(*) from %I where %I > now() - interval ''30 days''',
                       v_tbl, v_date) into v_30;
      end if;
    end if;

    v_icerik := v_icerik || jsonb_build_object(v_kind,
      jsonb_build_object('toplam', v_n, 'son_7g', v_7, 'son_30g', v_30));
  end loop;

  return (jsonb_build_object(
    'icerik', v_icerik,

    /* ── KULLANICI ── */
    'kullanici', jsonb_build_object(
      'toplam',      (select count(*) from auth.users),
      'profilli',    (select count(*) from profiles),
      'aktif',       (select count(*) from profiles where coalesce(is_banned,false) = false),
      'banli',       (select count(*) from profiles where coalesce(is_banned,false)),
      'isletme',     (select count(*) from profiles where role = 'business'),
      'ogrenci',     (select count(*) from profiles where coalesce(ogrenci,false)),
      'dogrulanmis', (select count(*) from profiles where coalesce(verify,false)),
      'gizli',       (select count(*) from profiles where coalesce(gizli,false)),
      'bugun',       (select count(*) from auth.users where created_at > current_date),
      'son_7g',      (select count(*) from auth.users where created_at > now() - interval '7 days'),
      'son_30g',     (select count(*) from auth.users where created_at > now() - interval '30 days'),
      'aktif_7g',    (select count(*) from auth.users where last_sign_in_at > now() - interval '7 days'),
      'aktif_30g',   (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
      'hic_girmemis',(select count(*) from auth.users where last_sign_in_at is null)
    ),

    /* ── BÜYÜME (30 gün) ── */
    'buyume', (
      select coalesce(jsonb_agg(g order by g.gun), '[]'::jsonb) from (
        select date_trunc('day', created_at)::date as gun, count(*) as adet
        from auth.users where created_at > now() - interval '30 days'
        group by date_trunc('day', created_at)::date
      ) g
    ),

    /* ── CİHAZ ── */
    'cihaz', jsonb_build_object(
      'toplam',    (select count(distinct device_id) from devices),
      'push',      (select count(distinct device_id) from devices
                      where push_token is not null and push_token <> ''),
      'push_acik', (select count(distinct device_id) from devices
                      where push_token is not null and push_token <> ''
                        and coalesce(push_enabled,true)),
      'banli',     (select count(distinct b.device_id) from bans b
                      where b.device_id is not null and coalesce(b.is_active,true)),
      'platformlar', (
        select coalesce(jsonb_agg(x order by x.adet desc), '[]'::jsonb) from (
          select coalesce(platform,'bilinmiyor') as platform,
                 count(distinct device_id) as adet
          from devices group by coalesce(platform,'bilinmiyor')
        ) x
      )
    ),

    /* ── BİLDİRİM ── */
    'bildirim', jsonb_build_object(
      'toplam',   (select count(*) from notifications),
      'okunmamis',(select count(*) from notifications where not is_read),
      'bugun',    (select count(*) from notifications where created_at > current_date),
      'kuyruk',   (select count(*) from notifications where push_status in ('pending','sending')),
      'push_sent',(select count(*) from notifications where push_status = 'sent'),
      'push_failed',(select count(*) from notifications where push_status = 'failed'),
      'tipler', (
        select coalesce(jsonb_agg(x order by x.adet desc), '[]'::jsonb) from (
          select type::text as tip, count(*) as adet
          from notifications group by type order by count(*) desc limit 12
        ) x
      )
    ),

    /* ── REKLAM ── */
    'reklam', jsonb_build_object(
      'toplam',      (select count(*) from ad_campaigns),
      'aktif',       (select count(*) from ad_campaigns where status = 'active'),
      'bekleyen',    (select count(*) from ad_campaigns where status = 'pending'),
      'aylik_gelir', (select coalesce(sum(monthly_price),0) from ad_campaigns where status = 'active'),
      'toplam_gelir',(select coalesce(sum(total_price),0) from ad_campaigns
                        where status in ('active','expired')),
      'gosterim',    (select coalesce(sum(gosterim),0) from ad_stats_daily),
      'tiklama',     (select coalesce(sum(tiklama),0) from ad_stats_daily),
      'boost_aktif', (select count(*) from boost_requests where status = 'active'),
      'alanlar', (
        select coalesce(jsonb_agg(x order by x.sort_order), '[]'::jsonb) from (
          select s.key, s.ad, s.capacity, s.sort_order,
                 (select count(*) from ad_campaigns c
                    where c.slot_key = s.key and c.status = 'active') as aktif
          from ad_slots s where s.is_active and s.key not like 'boost_%'
        ) x
      )
    ),

    /* ── ŞİKÂYET ── */
    'sikayet', jsonb_build_object(
      'toplam',        (select count(*) from reports),
      'cevaplanmamis', (select count(*) from reports where status in ('pending','reviewing')),
      'cozuldu',       (select count(*) from reports where status = 'resolved'),
      'reddedildi',    (select count(*) from reports where status = 'dismissed')
    ),

    /* ── ONAY ── */
    'onay', jsonb_build_object(
      'isletme_bekleyen', (select count(*) from profiles where business_durum = 'pending'),
      'isletme_onayli',   (select count(*) from profiles where business_durum = 'approved'),
      'ogrenci_bekleyen', (select count(*) from profiles where ogrenci_durum = 'pending'),
      'ogrenci_onayli',   (select count(*) from profiles where ogrenci_durum = 'approved')
    ),

    /* ── MAİL ── */
    'mail', jsonb_build_object(
      'gelen',      (select count(*) from mails),
      'okunmamis',  (select count(*) from mails where not is_read and not is_archived),
      'gonderilen', (select count(*) from mail_queue where status = 'sent'),
      'kuyruk',     (select count(*) from mail_queue where status = 'pending'),
      'hata',       (select count(*) from mail_queue where status = 'failed')
    ),

    /* ── MEDYA ── */
    'medya', jsonb_build_object(
      'dosya',  (select count(*) from media_library),
      'boyut',  (select coalesce(sum(size_bytes),0) from media_library),
      'gorsel', (select count(*) from media_library where mime_type like 'image/%'),
      'video',  (select count(*) from media_library where mime_type like 'video/%')
    ),

    /* ── POPUP ── */
    'popup', jsonb_build_object(
      'toplam',     (select count(*) from popups),
      'aktif',      (select count(*) from popups where coalesce(is_active,false)),
      'gosterim',   (select coalesce(sum(goruntulenme),0) from popups),
      'tiklama',    (select coalesce(sum(tiklanma),0) from popups)
    ),

    /* ── ŞEHİR (ilk 15) ── */
    'sehirler', (
      select coalesce(jsonb_agg(x order by x.kullanici desc), '[]'::jsonb) from (
        select sehir, count(*) as kullanici,
               count(*) filter (where role = 'business') as isletme,
               count(*) filter (where coalesce(ogrenci,false)) as ogrenci
        from profiles where sehir is not null and trim(sehir) <> ''
        group by sehir order by count(*) desc limit 15
      ) x
    ),

    /* ── BAN ── */
    'ban', jsonb_build_object(
      'aktif',   (select count(*) from bans where coalesce(is_active,true)
                    and (until_at is null or until_at > now())),
      'suresi_gecmis', (select count(*) from bans where until_at is not null and until_at < now()),
      'hesap',   (select count(*) from bans where user_id is not null and coalesce(is_active,true)),
      'cihaz',   (select count(*) from bans where device_ids is not null and coalesce(is_active,true)),
      'ip',      (select count(*) from bans where ips is not null and coalesce(is_active,true))
    )
  ))::json;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) POLİTİKA SIRALAMA (sürükle-bırak)                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_reorder_policies(uuid[]);

create or replace function admin_reorder_policies(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare
  v_i integer := 0;
  v_id uuid;
begin
  foreach v_id in array p_ids loop
    v_i := v_i + 1;
    -- ★ Sadece sort_order değişiyor; trigger sürümü artırmıyor
    --   (içerik/başlık değişmediği için).
    update policies set sort_order = v_i where id = v_id;
  end loop;
  return json_build_object('guncellenen', v_i);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) PANELDEN REKLAM OLUŞTURMA                                      ║
-- ║                                                                    ║
-- ║  ★ Reklam veren teklif göndermek zorunda değil: anlaşmayı dışarıda  ║
-- ║    yaptıysan panelden doğrudan kampanya açıp yayına alabilirsin.    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_create_ad(uuid, text, text, text, text, text, text, text, integer, numeric, boolean, text);

create or replace function admin_create_ad(
  p_advertiser uuid,
  p_slot text,
  p_title text,
  p_description text default null,
  p_image_url text default null,
  p_logo_url text default null,
  p_target_type text default 'external',
  p_target_value text default null,
  p_months integer default 1,
  p_monthly_price numeric default 0,
  p_activate boolean default false,
  p_note text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_camp ad_campaigns;
  v_slot ad_slots;
  v_aktif integer;
  v_no integer;
begin
  if p_advertiser is null then raise exception 'Reklam veren secilmeli'; end if;
  if nullif(trim(coalesce(p_title,'')), '') is null then raise exception 'Baslik zorunlu'; end if;

  select * into v_slot from ad_slots where key = p_slot and is_active;
  if v_slot.key is null then raise exception 'Gecersiz alan: %', p_slot; end if;

  select coalesce(max(offer_count),0) + 1 into v_no
  from ad_campaigns where advertiser_id = p_advertiser and slot_key = p_slot;

  insert into ad_campaigns (
    advertiser_id, slot_key, title, description, image_url, logo_url,
    target_type, target_value, months, monthly_price,
    offer_note, offer_count, status, admin_note
  ) values (
    p_advertiser, p_slot, trim(p_title), p_description, p_image_url, p_logo_url,
    coalesce(p_target_type,'external'), p_target_value,
    coalesce(p_months,1), greatest(0.01, coalesce(p_monthly_price,0)),
    p_note, v_no, 'pending', 'Panelden oluşturuldu'
  ) returning * into v_camp;

  insert into ad_offers (campaign_id, advertiser_id, slot_key, offer_no, months, monthly_price, note)
  values (v_camp.id, p_advertiser, p_slot, v_no, v_camp.months, v_camp.monthly_price, p_note);

  if p_activate then
    select count(*) into v_aktif from ad_campaigns
    where slot_key = p_slot and status = 'active';

    if v_aktif >= v_slot.capacity then
      return json_build_object('id', v_camp.id, 'durum', 'pending',
        'uyari', format('%s alani dolu (%s/%s) — yayina alinamadi.',
                        v_slot.ad, v_aktif, v_slot.capacity));
    end if;

    return admin_ad_approve(v_camp.id, 'panel') || jsonb_build_object('id', v_camp.id)::json;
  end if;

  return json_build_object('id', v_camp.id, 'durum', 'pending');
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  7) İÇERİK MEDYA KOLONLARI                                         ║
-- ║                                                                    ║
-- ║  ★ Panel bir içeriğin hangi kolonlarının medya olduğunu bilmeli:    ║
-- ║    tek URL mü, dizi mi? Kolon tipini information_schema'dan okuyup  ║
-- ║    döndürüyoruz.                                                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_content_media_columns(text);

create or replace function admin_content_media_columns(p_kind text)
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
    'kolon', c.column_name,
    'tip', c.data_type,
    'dizi', (c.data_type = 'ARRAY')
  ) order by
    array_position(
      array['cover_url','image_url','video_url','thumbnail_url','images',
            'media','medya','gorseller','gorsel','kapak_url','logo_url','avatar_url'],
      c.column_name)
  ), '[]'::json)
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = _admin_content_table(p_kind)
    and c.column_name in ('cover_url','image_url','video_url','thumbnail_url','images',
                          'media','medya','gorseller','gorsel','kapak_url','logo_url','avatar_url');
$$;


-- ── İçerikteki bir medya alanını güncelle (dizi elemanı dahil) ──
drop function if exists admin_set_content_media(text, uuid, text, integer, text);

create or replace function admin_set_content_media(
  p_kind text,
  p_id uuid,
  p_column text,
  p_index integer default null,   -- dizi ise hangi eleman; null = tek değer
  p_url text default null          -- null = kaldır
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_tbl text := _admin_content_table(p_kind);
  v_type text;
  v_eski text;
  v_row json;
begin
  if v_tbl is null then raise exception 'Gecersiz icerik tipi'; end if;

  select data_type into v_type from information_schema.columns
  where table_schema='public' and table_name=v_tbl and column_name=p_column;
  if v_type is null then raise exception 'Kolon yok: %.%', v_tbl, p_column; end if;

  if v_type = 'ARRAY' then
    if p_index is null then raise exception 'Dizi kolonunda index gerekli'; end if;

    execute format('select (%I)[$1] from %I where id = $2', p_column, v_tbl)
      into v_eski using p_index + 1, p_id;

    if p_url is null then
      -- Elemanı diziden çıkar
      execute format(
        'update %I set %I = (
           select array_agg(x) from (
             select unnest(%I) with ordinality as t(x, i)
           ) s where s.i <> $1
         ) where id = $2', v_tbl, p_column, p_column)
      using p_index + 1, p_id;
    else
      execute format('update %I set %I[$1] = $2 where id = $3', v_tbl, p_column)
      using p_index + 1, p_url, p_id;
    end if;
  else
    execute format('select %I from %I where id = $1', p_column, v_tbl)
      into v_eski using p_id;
    execute format('update %I set %I = $1 where id = $2', v_tbl, p_column)
      using p_url, p_id;
  end if;

  -- ★ Eski dosyayı temizlik kuyruğuna at
  if v_eski is not null and v_eski is distinct from p_url then
    perform storage_enqueue_delete(v_eski, format('%s.%s degisti', v_tbl, p_column));
  end if;

  execute format('select to_jsonb(t) from %I t where t.id = $1', v_tbl)
    into v_row using p_id;

  return json_build_object('eski', v_eski, 'yeni', p_url, 'kayit', v_row);
end;
$$;


-- Diziye yeni medya ekle
drop function if exists admin_add_content_media(text, uuid, text, text);

create or replace function admin_add_content_media(
  p_kind text, p_id uuid, p_column text, p_url text
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_tbl text := _admin_content_table(p_kind);
  v_type text;
begin
  select data_type into v_type from information_schema.columns
  where table_schema='public' and table_name=v_tbl and column_name=p_column;
  if v_type is null then raise exception 'Kolon yok'; end if;

  if v_type = 'ARRAY' then
    execute format('update %I set %I = array_append(coalesce(%I, ''{}''), $1) where id = $2',
                   v_tbl, p_column, p_column)
    using p_url, p_id;
  else
    execute format('update %I set %I = $1 where id = $2', v_tbl, p_column)
    using p_url, p_id;
  end if;

  return json_build_object('eklendi', p_url);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  8) YETKİLER                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_city_detail','admin_full_stats','admin_reorder_policies',
                        'admin_create_ad','admin_content_media_columns',
                        'admin_set_content_media','admin_add_content_media',
                        'admin_mail_sync_state','admin_save_mail_settings')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select id, name, public, file_size_limit from storage.buckets
where id in ('galeri','reklam','media') order by id;

select column_name from information_schema.columns
where table_schema='public' and table_name='mail_settings'
  and column_name like 'imap%' order by column_name;

select admin_full_stats() -> 'kullanici' as kullanici_ozet;
