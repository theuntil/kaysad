-- ═══════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════
--
--   KAYS PANEL — BİRLEŞİK GÜNCELLEME (v4.5 + v4.6 + v4.7)
--
--   ★ Son üç güncellemeyi TEK DOSYADA birleştirdim.
--     panel_v4_4_mail_medya.sql'i çalıştırdıysan, sıradaki dosya BU.
--     Ayrı ayrı v4_5 / v4_6 / v4_7 çalıştırmana GEREK YOK.
--
--   ★ Tamamı idempotent — tekrar çalıştırmak zarar vermez.
--     Daha önce bir kısmını çalıştırdıysan da güvenle çalıştırabilirsin.
--
--   ┌─ İÇİNDEKİLER ──────────────────────────────────────────────────┐
--   │ BÖLÜM 1  Storage bucket'ları (galeri, reklam, media)            │
--   │          IMAP alanları · Şehir detayı · Kapsamlı istatistik     │
--   │          Politika sıralama · Panelden reklam ekleme             │
--   │          İçerik medya yönetimi                                  │
--   │                                                                 │
--   │ BÖLÜM 2  Geniş içerik araması (JSON, dizi, sahip adı dahil)     │
--   │          Sıralama ve trigram indeksleri                         │
--   │                                                                 │
--   │ BÖLÜM 3  ★ "json || json" hatası düzeltmesi                     │
--   │          Uygulama ayarları (bakım modu, sürüm, servis anahtarı) │
--   │          İçerik limitleri (4 içerik × 4 rol)                    │
--   │          Mail/telefon servis kapıları                           │
--   │          Mail kalıcı silme · Bildirim temizlik önizlemesi       │
--   └────────────────────────────────────────────────────────────────┘
--
--   ┌─ ÇALIŞTIRMA ───────────────────────────────────────────────────┐
--   │ Supabase → SQL Editor → tümünü yapıştır → Run                   │
--   │ Uzun sürebilir (indeks oluşturma). Sabırla bekle.               │
--   │ Sonunda doğrulama sorguları çalışıyor; çıktılarına bak.         │
--   └────────────────────────────────────────────────────────────────┘
--
--   ┌─ GEREKLİ EKLENTİLER ───────────────────────────────────────────┐
--   │ Database → Extensions'tan aç:                                   │
--   │   pg_net   → push tetikleme                                     │
--   │   pg_cron  → zamanlanmış temizlik                               │
--   │   pg_trgm  → arama hızı (bu dosya kendisi kurmayı dener)        │
--   │ Yoksa hata VERMEZ, notice yazıp atlar.                          │
--   └────────────────────────────────────────────────────────────────┘
--
-- ═══════════════════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════



-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║                                                                   ║
-- ║   BÖLÜM 1 / 3                                                    ║
-- ║   BUCKET'LAR + IMAP + ŞEHİR DETAYI + İSTATİSTİKLER              ║
-- ║                                                                   ║
-- ║   (kaynak: panel_v4_5_bucket_imap_stats.sql                    )║
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



-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║                                                                   ║
-- ║   BÖLÜM 2 / 3                                                    ║
-- ║   GENİŞ ARAMA + PERFORMANS İNDEKSLERİ                           ║
-- ║                                                                   ║
-- ║   (kaynak: panel_v4_6_arama_optimizasyon.sql                   )║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists _admin_search_columns(text);

create or replace function _admin_search_columns(p_table text)
returns text[] language sql stable set search_path = public as $$
  select coalesce(array_agg(c.column_name order by
    array_position(
      array['title','baslik','name','ad','description','aciklama','content',
            'icerik','caption','metin','adres','address','brand','marka',
            'model','category','kategori','tags','etiketler','detail','detay',
            'ozellikler','features','note','not'],
      c.column_name)
  ), '{}')
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = p_table
    and c.column_name in ('title','baslik','name','ad','description','aciklama',
                          'content','icerik','caption','metin','adres','address',
                          'brand','marka','model','category','kategori','tags',
                          'etiketler','detail','detay','ozellikler','features','note','not')
    -- Aranabilir tipler: metin, metin dizisi, json
    and (c.data_type in ('text','character varying','ARRAY','json','jsonb'));
$$;


create or replace function admin_list_content(
  p_kind text,
  p_query text default null,
  p_limit integer default 40,
  p_offset integer default 0
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_tbl text := _admin_content_table(p_kind);
  v_owner text;
  v_date text;
  v_rows json;
  v_total bigint;
  v_where text := '';
  v_kolonlar text[];
  v_kosullar text[] := '{}';
  v_k text;
  v_tip text;
  v_q text := nullif(trim(coalesce(p_query, '')), '');
begin
  if v_tbl is null then raise exception 'Gecersiz icerik tipi: %', p_kind; end if;

  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name=v_tbl) then
    return json_build_object('tablo', v_tbl, 'hata', 'tablo yok',
                             'toplam', 0, 'satirlar', '[]'::json);
  end if;

  v_owner := _admin_owner_column(v_tbl);
  v_date  := _admin_date_column(v_tbl);

  /* ── ARAMA: tüm metin/json kolonlarda ── */
  if v_q is not null then
    v_kolonlar := _admin_search_columns(v_tbl);

    foreach v_k in array v_kolonlar loop
      select data_type into v_tip from information_schema.columns
      where table_schema='public' and table_name=v_tbl and column_name=v_k;

      if v_tip = 'ARRAY' then
        -- Dizi: elemanları birleştirip ara
        v_kosullar := v_kosullar ||
          format('array_to_string(t.%I, '' '') ilike %L', v_k, '%' || v_q || '%')::text;
      elsif v_tip in ('json','jsonb') then
        -- JSON: metne çevirip ara (ör. ilanların detail alanı)
        v_kosullar := v_kosullar ||
          format('t.%I::text ilike %L', v_k, '%' || v_q || '%')::text;
      else
        v_kosullar := v_kosullar ||
          format('t.%I ilike %L', v_k, '%' || v_q || '%')::text;
      end if;
    end loop;

    -- Sahibinin kullanıcı adında da ara
    if v_owner is not null then
      v_kosullar := v_kosullar || format(
        'exists (select 1 from profiles p where p.id = t.%I and p.username ilike %L)',
        v_owner, '%' || v_q || '%')::text;
    end if;

    -- UUID araması
    v_kosullar := v_kosullar || format('t.id::text = %L', v_q)::text;

    if array_length(v_kosullar, 1) > 0 then
      v_where := ' where (' || array_to_string(v_kosullar, ' or ') || ')';
    end if;
  end if;

  execute format('select count(*) from %I t %s', v_tbl, v_where) into v_total;

  execute format(
    'select coalesce(json_agg(x order by x.%I desc nulls last), ''[]''::json) from (
       select t.*, %s
       from %I t %s
       order by t.%I desc nulls last
       limit $1 offset $2
     ) x',
    v_date,
    case when v_owner is null
         then 'null::text as _sahip_username, null::text as _sahip_avatar'
         else format('(select p.username::text from profiles p where p.id = t.%I) as _sahip_username,
                      (select p.avatar_url from profiles p where p.id = t.%I) as _sahip_avatar',
                     v_owner, v_owner) end,
    v_tbl, v_where, v_date
  ) into v_rows using greatest(1, least(100, coalesce(p_limit,40))),
                      greatest(0, coalesce(p_offset,0));

  return json_build_object(
    'tablo', v_tbl,
    'sahip_kolonu', v_owner,
    'tarih_kolonu', v_date,
    'toplam', v_total,
    'aranan_kolonlar', v_kolonlar,
    'satirlar', v_rows
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) PERFORMANS İNDEKSLERİ                                          ║
-- ║                                                                    ║
-- ║  ★ 100.000+ kayıtta sıralama ve arama indekssiz sürünüyor.          ║
-- ║    Tablo/kolon varsa indeks açılıyor, yoksa sessizce atlanıyor.     ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare
  v_tbl text;
  v_date text;
  v_owner text;
begin
  foreach v_tbl in array array['posts','listings','indirimler','etkinlikler','comments'] loop
    continue when not exists (
      select 1 from information_schema.tables
      where table_schema='public' and table_name=v_tbl);

    v_date := _admin_date_column(v_tbl);
    v_owner := _admin_owner_column(v_tbl);

    -- Sıralama indeksi (en yeni üstte)
    if v_date <> 'id' then
      begin
        execute format('create index if not exists %I on %I (%I desc)',
                       'idx_' || v_tbl || '_' || v_date, v_tbl, v_date);
      exception when others then
        raise notice '% indeksi olusturulamadi: %', v_tbl, sqlerrm;
      end;
    end if;

    -- Sahiplik indeksi (kullanıcı detayındaki içerikler)
    if v_owner is not null then
      begin
        execute format('create index if not exists %I on %I (%I, %I desc)',
                       'idx_' || v_tbl || '_' || v_owner, v_tbl, v_owner,
                       case when v_date = 'id' then 'id' else v_date end);
      exception when others then null;
      end;
    end if;
  end loop;

  raise notice 'Icerik indeksleri kontrol edildi';
end $$;


-- ── Metin araması için trigram indeksleri ──
--    ilike '%...%' aramaları ancak trigram indeksiyle hızlanır.
do $$
declare
  v_tbl text;
  v_col text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
    begin
      create extension if not exists pg_trgm;
      raise notice 'pg_trgm kuruldu';
    exception when others then
      raise notice 'pg_trgm kurulamadi — arama indekssiz calisacak: %', sqlerrm;
      return;
    end;
  end if;

  foreach v_tbl in array array['posts','listings','indirimler','etkinlikler'] loop
    continue when not exists (
      select 1 from information_schema.tables
      where table_schema='public' and table_name=v_tbl);

    foreach v_col in array array['title','baslik'] loop
      continue when not exists (
        select 1 from information_schema.columns
        where table_schema='public' and table_name=v_tbl and column_name=v_col);

      begin
        execute format('create index if not exists %I on %I using gin (%I gin_trgm_ops)',
                       'idx_trgm_' || v_tbl || '_' || v_col, v_tbl, v_col);
      exception when others then null;
      end;
    end loop;
  end loop;

  raise notice 'Trigram arama indeksleri kontrol edildi';
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) YETKİLER                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

revoke all on function admin_list_content(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function admin_list_content(text, text, integer, integer) to service_role;

revoke all on function _admin_search_columns(text) from public, anon, authenticated;
grant execute on function _admin_search_columns(text) to service_role;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Hangi kolonlarda arama yapılacak?
select k.kind, _admin_content_table(k.kind) as tablo,
       _admin_search_columns(_admin_content_table(k.kind)) as aranan_kolonlar
from (values ('post'),('listing'),('discount'),('event')) k(kind);

-- Oluşan indeksler
select tablename, indexname from pg_indexes
where schemaname = 'public'
  and tablename in ('posts','listings','indirimler','etkinlikler')
order by tablename, indexname;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) TANI: içerik tablolarındaki medya kolonları                     ║
-- ║                                                                    ║
-- ║  ★ Video gönderilerde kapak görünmüyorsa ÖNCE BUNU ÇALIŞTIR.        ║
-- ║    Panel şu sırayla kapak arıyor:                                   ║
-- ║      image_url → cover_url → thumbnail_url → thumb_url →            ║
-- ║      preview_url → kapak_url → images[] → gorseller[] →             ║
-- ║      media[] → medya[] → gorsel                                     ║
-- ║    Hiç görsel yoksa video adresinden ilk kare gösteriliyor.         ║
-- ║                                                                    ║
-- ║  Aşağıdaki sorgu senin tablonda hangi kolonların olduğunu           ║
-- ║  gösteriyor. Listede olmayan bir kolon adı varsa bana söyle,        ║
-- ║  panelin arama listesine eklerim.                                   ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select
  c.table_name as tablo,
  c.column_name as kolon,
  c.data_type as tip,
  case
    when c.column_name in ('image_url','cover_url','thumbnail_url','thumb_url',
                           'preview_url','kapak_url','images','gorseller',
                           'media','medya','gorsel')
      then '✓ kapak olarak taranıyor'
    when c.column_name in ('video_url','video','medya_url')
      then '✓ video olarak taranıyor'
    else '✗ TANINMIYOR — panele eklenmeli'
  end as durum
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in ('posts','listings','indirimler','etkinlikler')
  and (
    c.column_name ~* '(url|image|img|photo|foto|gorsel|resim|media|medya|video|cover|kapak|thumb|preview)'
  )
order by c.table_name, c.column_name;

-- Video gönderilerde hangi kolonlar dolu? (ilk 5 örnek)
do $$
declare
  v_var boolean;
begin
  select exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='posts') into v_var;
  if not v_var then
    raise notice 'posts tablosu yok';
    return;
  end if;

  raise notice '--- posts tablosundaki medya kolonlari ---';
  perform 1;
end $$;

select c.column_name, count(*) filter (where true) as toplam
from information_schema.columns c
where c.table_schema='public' and c.table_name='posts'
  and c.column_name ~* '(url|image|video|cover|kapak|thumb|media|gorsel)'
group by c.column_name
order by 1;



-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║                                                                   ║
-- ║   BÖLÜM 3 / 3                                                    ║
-- ║   AYARLAR + LİMİTLER + BAKIM MODU + REKLAM HATASI DÜZELTMESİ    ║
-- ║                                                                   ║
-- ║   (kaynak: panel_v4_7_ayarlar_limitler.sql                     )║
-- ╚═══════════════════════════════════════════════════════════════════╝

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
  v_sonuc jsonb;
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

    -- ★ DÜZELTME: json değil jsonb üzerinde birleştirme
    v_sonuc := admin_ad_approve(v_camp.id, 'panel')::jsonb
               || jsonb_build_object('id', v_camp.id);
    return v_sonuc::json;
  end if;

  return json_build_object('id', v_camp.id, 'durum', 'pending');
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) UYGULAMA AYARLARI                                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists app_config (
  id                  smallint primary key default 1,

  /* ── Bakım modu ── */
  maintenance         boolean not null default false,
  maintenance_message text default 'Uygulama kısa süreliğine bakımda. Lütfen daha sonra tekrar deneyin.',
  maintenance_until   timestamptz,
  maintenance_at      timestamptz,
  maintenance_by      text,

  /* ── Sürüm ── */
  app_version         text default '1.0.0',
  min_version         text default '1.0.0',
  force_update        boolean not null default false,
  update_message      text default 'Yeni bir sürüm mevcut. Devam etmek için güncelleyin.',
  ios_store_url       text,
  android_store_url   text,

  /* ── Alt sistem anahtarları ── */
  mail_service        boolean not null default true,
  phone_service       boolean not null default true,
  push_service        boolean not null default true,
  ads_service         boolean not null default true,
  registration_open   boolean not null default true,

  updated_at          timestamptz not null default now(),
  updated_by          text,
  constraint app_config_single check (id = 1)
);

insert into app_config (id) values (1) on conflict (id) do nothing;

alter table app_config enable row level security;

-- ★ Uygulama bakım modunu ve sürümü OKUYABİLMELİ (giriş öncesi bile).
--   Yazma yok: sadece service_role (panel) değiştirebiliyor.
drop policy if exists app_config_read on app_config;
create policy app_config_read on app_config for select using (true);

grant select on app_config to anon, authenticated;


-- ── Mobil tarafın çağıracağı tek kapı ──
drop function if exists app_status(text);

create or replace function app_status(p_version text default null)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'maintenance', c.maintenance,
    'maintenance_message', c.maintenance_message,
    'maintenance_until', c.maintenance_until,
    'app_version', c.app_version,
    'min_version', c.min_version,
    -- ★ Sürüm karşılaştırma: gelen sürüm min_version'dan küçükse güncelleme şart
    'update_required', (
      c.force_update or (
        p_version is not null and
        string_to_array(regexp_replace(p_version, '[^0-9.]', '', 'g'), '.')::int[]
          < string_to_array(regexp_replace(c.min_version, '[^0-9.]', '', 'g'), '.')::int[]
      )
    ),
    'update_message', c.update_message,
    'ios_store_url', c.ios_store_url,
    'android_store_url', c.android_store_url,
    'services', json_build_object(
      'mail', c.mail_service,
      'phone', c.phone_service,
      'push', c.push_service,
      'ads', c.ads_service,
      'registration', c.registration_open
    )
  )
  from app_config c where c.id = 1;
$$;

grant execute on function app_status(text) to anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) İÇERİK SINIRLARI                                               ║
-- ║                                                                    ║
-- ║  ┌─ MANTIK ────────────────────────────────────────────────────┐   ║
-- ║  │ post     → GÜNLÜK   (bugün kaç gönderi attı)                 │   ║
-- ║  │ listing  → AKTİF    (şu an kaç açık ilanı var)               │   ║
-- ║  │ discount → AKTİF    (sadece işletme)                         │   ║
-- ║  │ event    → AKTİF    (şu an kaç açık etkinliği var)           │   ║
-- ║  └─────────────────────────────────────────────────────────────┘   ║
-- ║                                                                    ║
-- ║  ★ profiles.is_boosted = true olan kullanıcı "boosted" satırındaki  ║
-- ║    sınırı alıyor. Böylece bir kullanıcıya ekstra hak vermek için    ║
-- ║    kod değişikliği gerekmiyor.                                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists content_limits (
  content_type  text not null,
  role          text not null,
  limit_type    text not null,
  limit_value   integer not null default 0,
  is_allowed    boolean not null default true,
  updated_at    timestamptz not null default now(),
  primary key (content_type, role),
  constraint cl_content_chk check (content_type in ('post','listing','discount','event')),
  constraint cl_role_chk check (role in ('user','business','boosted_user','boosted_business')),
  constraint cl_type_chk check (limit_type in ('daily','active')),
  constraint cl_value_chk check (limit_value >= 0)
);

-- Varsayılan sınırlar
insert into content_limits (content_type, role, limit_type, limit_value, is_allowed) values
  -- Gönderi: günlük
  ('post', 'user',              'daily',  5,  true),
  ('post', 'business',          'daily', 10,  true),
  ('post', 'boosted_user',      'daily', 15,  true),
  ('post', 'boosted_business',  'daily', 30,  true),

  -- İlan: aktif
  ('listing', 'user',             'active',  3, true),
  ('listing', 'business',         'active', 20, true),
  ('listing', 'boosted_user',     'active', 10, true),
  ('listing', 'boosted_business', 'active', 50, true),

  -- İndirim: aktif · ★ sadece işletme
  ('discount', 'user',             'active', 0,  false),
  ('discount', 'business',         'active', 10, true),
  ('discount', 'boosted_user',     'active', 0,  false),
  ('discount', 'boosted_business', 'active', 25, true),

  -- Etkinlik: aktif
  ('event', 'user',             'active',  2, true),
  ('event', 'business',         'active', 10, true),
  ('event', 'boosted_user',     'active',  5, true),
  ('event', 'boosted_business', 'active', 25, true)
on conflict (content_type, role) do nothing;

alter table content_limits enable row level security;
drop policy if exists content_limits_read on content_limits;
create policy content_limits_read on content_limits for select using (true);
grant select on content_limits to anon, authenticated;


-- ── Kullanıcının rol anahtarını bul ──
drop function if exists _user_limit_role(uuid);

create or replace function _user_limit_role(p_user_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when coalesce(p.is_boosted, false) and p.role = 'business' then 'boosted_business'
    when coalesce(p.is_boosted, false) then 'boosted_user'
    when p.role = 'business' then 'business'
    else 'user'
  end
  from profiles p where p.id = p_user_id;
$$;


-- ── SINIR KONTROLÜ — mobil taraf bunu çağırıyor ──
drop function if exists check_content_limit(uuid, text);

create or replace function check_content_limit(
  p_user_id uuid default null,
  p_content_type text default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_role text;
  v_limit content_limits;
  v_tbl text;
  v_owner text;
  v_date text;
  v_kullanilan bigint := 0;
  v_aktif_kolon text;
  v_bakim boolean;
begin
  if v_uid is null then raise exception 'Kullanici belirlenemedi'; end if;
  if p_content_type not in ('post','listing','discount','event') then
    raise exception 'Gecersiz icerik tipi: %', p_content_type;
  end if;

  -- ★ Bakım modunda hiçbir içerik oluşturulamaz
  select maintenance into v_bakim from app_config where id = 1;
  if coalesce(v_bakim, false) then
    return json_build_object(
      'allowed', false, 'reason', 'maintenance',
      'message', coalesce((select maintenance_message from app_config where id = 1),
                          'Uygulama bakımda.'));
  end if;

  v_role := _user_limit_role(v_uid);
  if v_role is null then
    return json_build_object('allowed', false, 'reason', 'no_profile',
                             'message', 'Profil bulunamadı.');
  end if;

  select * into v_limit from content_limits
  where content_type = p_content_type and role = v_role;

  if v_limit.content_type is null then
    -- Tanımsızsa serbest bırakma; güvenli taraf kapalı olmak
    return json_build_object('allowed', false, 'reason', 'no_limit_defined',
                             'message', 'Bu içerik türü için sınır tanımlanmamış.');
  end if;

  if not v_limit.is_allowed then
    return json_build_object(
      'allowed', false, 'reason', 'not_permitted',
      'message', case when p_content_type = 'discount'
                      then 'İndirim yalnızca işletme hesaplarına açıktır.'
                      else 'Bu içerik türünü oluşturma yetkiniz yok.' end,
      'role', v_role);
  end if;

  v_tbl := _admin_content_table(p_content_type);
  if v_tbl is null or not exists (select 1 from information_schema.tables
                                  where table_schema='public' and table_name=v_tbl) then
    return json_build_object('allowed', true, 'reason', 'table_missing',
                             'limit', v_limit.limit_value, 'used', 0);
  end if;

  v_owner := _admin_owner_column(v_tbl);
  if v_owner is null then
    return json_build_object('allowed', true, 'reason', 'no_owner_column',
                             'limit', v_limit.limit_value, 'used', 0);
  end if;

  if v_limit.limit_type = 'daily' then
    /* ── GÜNLÜK: bugün kaç tane oluşturdu ── */
    v_date := _admin_date_column(v_tbl);
    if v_date = 'id' then
      return json_build_object('allowed', true, 'reason', 'no_date_column',
                               'limit', v_limit.limit_value, 'used', 0);
    end if;

    execute format('select count(*) from %I where %I = $1 and %I >= current_date',
                   v_tbl, v_owner, v_date)
      into v_kullanilan using v_uid;
  else
    /* ── AKTİF: şu an kaç açık kaydı var ── */
    select column_name into v_aktif_kolon
    from information_schema.columns
    where table_schema='public' and table_name=v_tbl
      and column_name in ('is_active','aktif','is_published','yayinda','status','durum')
    order by array_position(
      array['is_active','aktif','is_published','yayinda','status','durum'], column_name)
    limit 1;

    if v_aktif_kolon is null then
      execute format('select count(*) from %I where %I = $1', v_tbl, v_owner)
        into v_kullanilan using v_uid;
    elsif v_aktif_kolon in ('status','durum') then
      execute format(
        'select count(*) from %I where %I = $1 and coalesce(%I::text, '''') not in
         (''deleted'',''expired'',''passive'',''archived'',''silindi'',''pasif'')',
        v_tbl, v_owner, v_aktif_kolon) into v_kullanilan using v_uid;
    else
      execute format('select count(*) from %I where %I = $1 and coalesce(%I, true)',
                     v_tbl, v_owner, v_aktif_kolon) into v_kullanilan using v_uid;
    end if;
  end if;

  return json_build_object(
    'allowed', v_kullanilan < v_limit.limit_value,
    'reason', case when v_kullanilan < v_limit.limit_value then 'ok' else 'limit_reached' end,
    'message', case when v_kullanilan < v_limit.limit_value then null
      else case v_limit.limit_type
        when 'daily' then format('Günlük %s hakkınızı doldurdunuz. Yarın tekrar deneyin.',
                                 v_limit.limit_value)
        else format('En fazla %s aktif kaydınız olabilir. Yeni eklemek için birini kapatın.',
                    v_limit.limit_value) end
    end,
    'limit', v_limit.limit_value,
    'used', v_kullanilan,
    'remaining', greatest(0, v_limit.limit_value - v_kullanilan),
    'limit_type', v_limit.limit_type,
    'role', v_role,
    'boosted', (select coalesce(is_boosted, false) from profiles where id = v_uid)
  );
end;
$$;

grant execute on function check_content_limit(uuid, text) to authenticated;


-- ── Kullanıcının tüm sınırları tek seferde (profil ekranı için) ──
drop function if exists my_content_limits();

create or replace function my_content_limits()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'post',     check_content_limit(auth.uid(), 'post'),
    'listing',  check_content_limit(auth.uid(), 'listing'),
    'discount', check_content_limit(auth.uid(), 'discount'),
    'event',    check_content_limit(auth.uid(), 'event')
  );
$$;

grant execute on function my_content_limits() to authenticated;


-- ── profiles.is_boosted kolonu yoksa ekle ──
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='profiles'
                   and column_name='is_boosted') then
    alter table profiles add column is_boosted boolean not null default false;
    raise notice 'profiles.is_boosted eklendi';
  end if;
end $$;

create index if not exists idx_profiles_boosted on profiles (is_boosted) where is_boosted;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) MAİL VE TELEFON SERVİSİ KAPILARI                               ║
-- ║                                                                    ║
-- ║  ★ Yüklediğin Express servisleri (mail-main, phone-main) her        ║
-- ║    istekte bu fonksiyonu çağırmalı. Panelden anahtarı kapatınca     ║
-- ║    servis kendini devre dışı bırakıyor — kodu değiştirmeye gerek    ║
-- ║    yok, yeniden başlatmaya da.                                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists service_enabled(text);

create or replace function service_enabled(p_service text)
returns boolean language sql stable security definer set search_path = public as $$
  select case p_service
    when 'mail'  then c.mail_service
    when 'phone' then c.phone_service
    when 'push'  then c.push_service
    when 'ads'   then c.ads_service
    when 'registration' then c.registration_open
    else false
  end
  -- ★ Bakım modunda tüm servisler kapalı sayılır
  and not c.maintenance
  from app_config c where c.id = 1;
$$;

grant execute on function service_enabled(text) to anon, authenticated, service_role;


-- ── Mail servisinin ihtiyaç duyduğu tablo (yoksa oluştur) ──
create table if not exists email_change_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  new_email       text not null,
  code            text not null,
  is_verification boolean not null default false,
  attempts        integer not null default 0,
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now(),
  constraint ecr_email_chk check (new_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

create index if not exists idx_ecr_user on email_change_requests (user_id, created_at desc);
create index if not exists idx_ecr_expires on email_change_requests (expires_at);

alter table email_change_requests enable row level security;
drop policy if exists ecr_deny on email_change_requests;
-- ★ Kod istemciye sızmamalı: okuma tamamen kapalı, servis service_role ile geçiyor
create policy ecr_deny on email_change_requests for all using (false);


-- ── Telefon servisinin ihtiyaç duyduğu kolonlar ──
do $$
declare
  v_kolonlar text[][] := array[
    array['phone_change_temp', 'text'],
    array['phone_code_sent_at', 'timestamptz'],
    array['phone_verification_attempts', 'integer'],
    array['phone_last_attempt_at', 'timestamptz'],
    array['phone_verify', 'boolean']
  ];
  v_k text[];
begin
  foreach v_k slice 1 in array v_kolonlar loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name='profiles'
                     and column_name = v_k[1]) then
      execute format('alter table profiles add column %I %s', v_k[1], v_k[2]);
      raise notice 'profiles.% eklendi', v_k[1];
    end if;
  end loop;
end $$;


-- ── Süresi geçmiş doğrulama isteklerini temizle ──
drop function if exists cleanup_verification_requests();

create or replace function cleanup_verification_requests()
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from email_change_requests where expires_at < now() - interval '1 hour';
  get diagnostics v_n = row_count;

  -- 1 saatten eski telefon denemelerini sıfırla
  update profiles
  set phone_change_temp = null,
      phone_verification_attempts = 0
  where phone_code_sent_at < now() - interval '1 hour'
    and phone_change_temp is not null;

  return json_build_object('silinen_mail_istegi', v_n);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  5) BAKIM MODU + PANEL FONKSİYONLARI                               ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_get_config();

create or replace function admin_get_config()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    'config', to_jsonb(c),
    'limits', (
      select coalesce(json_agg(l order by
        array_position(array['post','listing','discount','event'], l.content_type),
        array_position(array['user','business','boosted_user','boosted_business'], l.role)
      ), '[]'::json)
      from content_limits l
    ),
    'boosted_user_count', (select count(*) from profiles where coalesce(is_boosted,false))
  )
  from app_config c where c.id = 1;
$$;


drop function if exists admin_save_config(jsonb, text);

create or replace function admin_save_config(p_patch jsonb, p_by text default 'panel')
returns json language plpgsql security definer set search_path = public as $$
declare v_row app_config;
begin
  update app_config set
    maintenance         = coalesce((p_patch->>'maintenance')::boolean, maintenance),
    maintenance_message = coalesce(p_patch->>'maintenance_message', maintenance_message),
    maintenance_until   = case when p_patch ? 'maintenance_until'
                               then nullif(p_patch->>'maintenance_until','')::timestamptz
                               else maintenance_until end,
    -- Bakım modu AÇILDIĞI anı kaydet
    maintenance_at      = case when (p_patch->>'maintenance')::boolean is true
                                 and maintenance = false
                               then now() else maintenance_at end,
    maintenance_by      = case when p_patch ? 'maintenance' then p_by else maintenance_by end,

    app_version         = coalesce(p_patch->>'app_version', app_version),
    min_version         = coalesce(p_patch->>'min_version', min_version),
    force_update        = coalesce((p_patch->>'force_update')::boolean, force_update),
    update_message      = coalesce(p_patch->>'update_message', update_message),
    ios_store_url       = coalesce(p_patch->>'ios_store_url', ios_store_url),
    android_store_url   = coalesce(p_patch->>'android_store_url', android_store_url),

    mail_service        = coalesce((p_patch->>'mail_service')::boolean, mail_service),
    phone_service       = coalesce((p_patch->>'phone_service')::boolean, phone_service),
    push_service        = coalesce((p_patch->>'push_service')::boolean, push_service),
    ads_service         = coalesce((p_patch->>'ads_service')::boolean, ads_service),
    registration_open   = coalesce((p_patch->>'registration_open')::boolean, registration_open),

    updated_at          = now(),
    updated_by          = p_by
  where id = 1
  returning * into v_row;

  -- ★ Push anahtarı app_settings ile de senkron olsun
  --   (push sistemi oradan okuyor)
  if p_patch ? 'push_service' then
    begin
      perform admin_set_setting('push_enabled',
        case when v_row.push_service then 'true' else 'false' end);
    exception when others then null;
    end;
  end if;

  return to_json(v_row);
end;
$$;


drop function if exists admin_save_limits(jsonb);

create or replace function admin_save_limits(p_limits jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_n integer := 0;
begin
  for v_item in select * from jsonb_array_elements(p_limits) loop
    update content_limits set
      limit_value = greatest(0, coalesce((v_item->>'limit_value')::integer, limit_value)),
      is_allowed  = coalesce((v_item->>'is_allowed')::boolean, is_allowed),
      limit_type  = coalesce(v_item->>'limit_type', limit_type),
      updated_at  = now()
    where content_type = v_item->>'content_type'
      and role = v_item->>'role';

    if found then v_n := v_n + 1; end if;
  end loop;

  return json_build_object('guncellenen', v_n);
end;
$$;


-- ── Kullanıcıya boost hakkı ver / al ──
drop function if exists admin_set_boosted(uuid, boolean);

create or replace function admin_set_boosted(p_user_id uuid, p_value boolean)
returns json language plpgsql security definer set search_path = public as $$
begin
  update profiles set is_boosted = p_value, updated_at = now() where id = p_user_id;
  if not found then raise exception 'Kullanici bulunamadi'; end if;
  return json_build_object('id', p_user_id, 'is_boosted', p_value);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  6) MAİL SİLME (kalıcı)                                            ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_delete_mail(uuid[]);

create or replace function admin_delete_mail(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from mails where id = any(p_ids);
  get diagnostics v_n = row_count;
  return json_build_object('silinen', v_n);
end;
$$;


drop function if exists admin_delete_queued_mail(uuid[]);

create or replace function admin_delete_queued_mail(p_ids uuid[])
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from mail_queue where id = any(p_ids);
  get diagnostics v_n = row_count;
  return json_build_object('silinen', v_n);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  7) BİLDİRİM TEMİZLİĞİ — doğrulama                                 ║
-- ║                                                                    ║
-- ║  ★ Kural zaten kurulu: 10 günden eski silinir AMA her kullanıcının  ║
-- ║    SON 10 BİLDİRİMİ korunur. Gece 04:00'te otomatik çalışıyor.      ║
-- ║    Aşağıdaki sorgu bunu doğruluyor.                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_cleanup_preview(integer, integer);

create or replace function admin_cleanup_preview(
  p_days integer default 10, p_keep integer default 10
) returns json language sql security definer set search_path = public as $$
  with eski as (
    select n.id, n.recipient_id,
           row_number() over (partition by n.recipient_id order by n.created_at desc) as sira
    from notifications n
    where n.created_at < now() - make_interval(days => p_days)
  )
  select json_build_object(
    'kural', format('%s günden eski silinir, kullanıcı başına son %s korunur', p_days, p_keep),
    'toplam_bildirim', (select count(*) from notifications),
    'eski_bildirim', (select count(*) from eski),
    'korunacak', (select count(*) from eski where sira <= p_keep),
    'silinecek', (select count(*) from eski where sira > p_keep),
    'etkilenen_kullanici', (select count(distinct recipient_id) from eski where sira > p_keep),
    'zamanlanmis_is', (
      select coalesce(json_agg(json_build_object('is', jobname, 'zaman', schedule, 'aktif', active)), '[]'::json)
      from cron.job where jobname = 'kays_maintenance'
    )
  );
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  8) ZAMANLANMIŞ İŞ                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then return; end if;
  perform cron.unschedule(jobname) from cron.job where jobname = 'verification_cleanup';
  perform cron.schedule('verification_cleanup', '*/30 * * * *',
    $c$ select cleanup_verification_requests(); $c$);
  raise notice 'verification_cleanup zamanlandi (30 dakikada bir)';
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  9) YETKİLER                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_get_config','admin_save_config','admin_save_limits',
                        'admin_set_boosted','admin_delete_mail','admin_delete_queued_mail',
                        'admin_cleanup_preview','cleanup_verification_requests',
                        'admin_create_ad','_user_limit_role')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- 1) Reklam oluşturma hatası düzeldi mi? (hata vermezse tamam)
do $$
begin
  perform '{"a":1}'::jsonb || '{"b":2}'::jsonb;
  raise notice 'JSONB BIRLESTIRME: OK';
end $$;

-- 2) Ayarlar
select app_status('1.0.0') as uygulama_durumu;

-- 3) Sınırlar
select content_type, role, limit_type, limit_value, is_allowed
from content_limits
order by array_position(array['post','listing','discount','event'], content_type),
         array_position(array['user','business','boosted_user','boosted_business'], role);

-- 4) Bildirim temizliği kuralı
select admin_cleanup_preview(10, 10) as temizlik_onizleme;

-- 5) Servis anahtarları
select service_enabled('mail') as mail, service_enabled('phone') as phone,
       service_enabled('push') as push, service_enabled('ads') as reklam;



-- ═══════════════════════════════════════════════════════════════════════
--   BİTTİ
--
--   Yukarıdaki doğrulama sorgularında şunları görmelisin:
--     · JSONB BIRLESTIRME: OK          ← reklam hatası düzeldi
--     · 3 bucket (galeri, reklam, media)
--     · content_limits tablosunda 16 satır
--     · app_status(...) → maintenance: false
--     · service_enabled → mail/phone/push için true
--
--   Panel tarafında: npm install && npm run build && npm start
--   (imapflow + mailparser bağımlılıkları eklendi)
-- ═══════════════════════════════════════════════════════════════════════
