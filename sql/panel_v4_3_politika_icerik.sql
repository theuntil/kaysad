-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V4.3 — POLİTİKALAR + POPUP ALANLARI + İÇERİK YÖNETİMİ
--
-- ★ panel_v4_2'den SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) POLİTİKALAR                                                    ║
-- ║                                                                    ║
-- ║  ★ RLS: herkes YAYINDAKİ politikaları okuyabilir; yazma yalnızca    ║
-- ║    service_role (panel). Taslaklar dışarıya sızmıyor.               ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists policies (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  content      text not null default '',
  summary      text,
  version      integer not null default 1,
  is_published boolean not null default true,
  sort_order   integer not null default 0,
  updated_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint policies_slug_chk check (slug ~ '^[a-z0-9-]+$')
);

create index if not exists idx_policies_published on policies (is_published, sort_order);

-- Güncelleme tarihi ve sürüm otomatik
create or replace function trg_fn_policies_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  -- ★ İçerik değiştiyse sürüm artar; sadece sıralama değiştiyse artmaz.
  if new.content is distinct from old.content or new.title is distinct from old.title then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_policies_touch on policies;
create trigger trg_policies_touch
before update on policies
for each row execute function trg_fn_policies_touch();


-- ── Başlangıç politikaları ──
insert into policies (slug, title, summary, sort_order, content) values
  ('gizlilik-politikasi', 'Gizlilik Politikası',
   'Kişisel verilerin toplanması, işlenmesi ve korunması.', 1,
   E'# Gizlilik Politikası\n\nBu politika, uygulamayı kullandığınızda hangi verileri topladığımızı ve nasıl kullandığımızı açıklar.\n\n## Toplanan Veriler\n\n## Verilerin Kullanımı\n\n## Veri Saklama Süresi\n\n## Haklarınız'),

  ('kullanim-kosullari', 'Kullanım Koşulları',
   'Uygulamayı kullanırken uymanız gereken kurallar.', 2,
   E'# Kullanım Koşulları\n\n## Hesap Oluşturma\n\n## Kabul Edilebilir Kullanım\n\n## Hesap Askıya Alma\n\n## Sorumluluk Sınırı'),

  ('cerez-politikasi', 'Çerez Politikası',
   'Çerezlerin kullanımı ve yönetimi.', 3,
   E'# Çerez Politikası\n\n## Çerez Nedir\n\n## Kullandığımız Çerezler\n\n## Çerez Tercihleri'),

  ('kullanici-gizliligi', 'Kullanıcı Gizliliği',
   'Profil görünürlüğü ve gizlilik ayarları.', 4,
   E'# Kullanıcı Gizliliği\n\n## Profil Görünürlüğü\n\n## Gizli Hesap\n\n## Engelleme'),

  ('ilan-politikasi', 'İlan Politikası',
   'İlan yayınlama kuralları ve yasaklı içerikler.', 5,
   E'# İlan Politikası\n\n## Yayın Kuralları\n\n## Yasaklı İçerikler\n\n## İlan Kaldırma'),

  ('indirim-politikasi', 'İndirim Politikası',
   'İndirim oluşturma ve kullanım kuralları.', 6,
   E'# İndirim Politikası\n\n## İndirim Oluşturma\n\n## Geçerlilik\n\n## İptal ve İade'),

  ('reklam-politikasi', 'Reklam Politikası',
   'Reklam verme kuralları ve içerik standartları.', 7,
   E'# Reklam Politikası\n\n## Reklam İçeriği\n\n## Yasaklı Reklamlar\n\n## Onay Süreci\n\n## Ücretlendirme'),

  ('topluluk-kurallari', 'Topluluk Kuralları',
   'Toplulukta beklenen davranış standartları.', 8,
   E'# Topluluk Kuralları\n\n## Saygılı İletişim\n\n## Yasaklı Davranışlar\n\n## Şikâyet Süreci\n\n## Yaptırımlar'),

  ('kvkk-aydinlatma', 'KVKK Aydınlatma Metni',
   '6698 sayılı kanun kapsamında aydınlatma yükümlülüğü.', 9,
   E'# KVKK Aydınlatma Metni\n\n## Veri Sorumlusu\n\n## İşleme Amaçları\n\n## Aktarım\n\n## Başvuru Hakkı'),

  ('etkinlik-politikasi', 'Etkinlik Politikası',
   'Etkinlik oluşturma ve katılım kuralları.', 10,
   E'# Etkinlik Politikası\n\n## Etkinlik Oluşturma\n\n## Katılım\n\n## İptal'),

  ('odeme-iade-politikasi', 'Ödeme ve İade Politikası',
   'Ödeme yöntemleri, faturalandırma ve iade koşulları.', 11,
   E'# Ödeme ve İade Politikası\n\n## Ödeme Yöntemleri\n\n## Faturalandırma\n\n## İade Koşulları'),

  ('cocuk-guvenligi', 'Çocuk Güvenliği Politikası',
   'Reşit olmayan kullanıcıların korunması.', 12,
   E'# Çocuk Güvenliği Politikası\n\n## Yaş Sınırı\n\n## Koruyucu Önlemler\n\n## Bildirim'),

  ('telif-hakki', 'Telif Hakkı Politikası',
   'Fikri mülkiyet ihlali bildirimi ve kaldırma süreci.', 13,
   E'# Telif Hakkı Politikası\n\n## İhlal Bildirimi\n\n## Kaldırma Süreci\n\n## İtiraz'),

  ('veri-saklama', 'Veri Saklama Politikası',
   'Verilerin ne kadar süre saklandığı ve silme.', 14,
   E'# Veri Saklama Politikası\n\n## Saklama Süreleri\n\n## Hesap Silme\n\n## Yedekler')
on conflict (slug) do nothing;


-- ── RLS ──
alter table policies enable row level security;

drop policy if exists policies_public_read on policies;
create policy policies_public_read on policies
  for select using (is_published = true);

-- ★ Yazma politikası YOK: insert/update/delete sadece service_role
--   (RLS'yi bypass eder). Böylece istemciden politika değiştirilemiyor.

grant select on policies to anon, authenticated;


-- ── Panel fonksiyonları ──
drop function if exists admin_list_policies();

create or replace function admin_list_policies()
returns setof policies
language sql security definer set search_path = public as $$
  select * from policies order by sort_order, title;
$$;


drop function if exists admin_save_policy(uuid, text, text, text, text, boolean, integer, text);

create or replace function admin_save_policy(
  p_id uuid default null,
  p_slug text default null,
  p_title text default null,
  p_content text default null,
  p_summary text default null,
  p_published boolean default true,
  p_sort integer default 0,
  p_by text default 'panel'
) returns policies language plpgsql security definer set search_path = public as $$
declare v_row policies;
begin
  if nullif(trim(coalesce(p_title,'')), '') is null then
    raise exception 'Baslik zorunlu';
  end if;

  if p_id is null then
    if nullif(trim(coalesce(p_slug,'')), '') is null then
      raise exception 'Slug zorunlu';
    end if;
    insert into policies (slug, title, content, summary, is_published, sort_order, updated_by)
    values (lower(trim(p_slug)), trim(p_title), coalesce(p_content,''), p_summary,
            coalesce(p_published,true), coalesce(p_sort,0), p_by)
    returning * into v_row;
  else
    update policies set
      slug = coalesce(lower(nullif(trim(p_slug),'')), slug),
      title = trim(p_title),
      content = coalesce(p_content, content),
      summary = p_summary,
      is_published = coalesce(p_published, is_published),
      sort_order = coalesce(p_sort, sort_order),
      updated_by = p_by
    where id = p_id
    returning * into v_row;

    if v_row.id is null then raise exception 'Politika bulunamadi'; end if;
  end if;

  return v_row;
end;
$$;


drop function if exists admin_delete_policy(uuid);

create or replace function admin_delete_policy(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from policies where id = p_id;
  get diagnostics v_n = row_count;
  return json_build_object('silinen', v_n);
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) POPUP: LOGO + TİP                                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝

alter table popups add column if not exists logo_url text;
alter table popups add column if not exists popup_kind text not null default 'system';

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'popups' and c.conname = 'popups_kind_chk'
  ) then
    alter table popups add constraint popups_kind_chk
      check (popup_kind in ('system','ad'));
  end if;
end $$;

create index if not exists idx_popups_kind on popups (popup_kind);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) İÇERİK LİSTELEME (gönderi / ilan / indirim / etkinlik sayfaları)║
-- ║                                                                    ║
-- ║  ★ Şema-bağımsız: sahip ve tarih kolonlarını kendisi buluyor.       ║
-- ║    En yeni kayıt en üstte.                                          ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_list_content(text, text, integer, integer);

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
begin
  if v_tbl is null then raise exception 'Gecersiz icerik tipi: %', p_kind; end if;

  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name=v_tbl) then
    return json_build_object('tablo', v_tbl, 'hata', 'tablo yok',
                             'toplam', 0, 'satirlar', '[]'::json);
  end if;

  v_owner := _admin_owner_column(v_tbl);
  v_date  := _admin_date_column(v_tbl);

  -- Arama: başlık benzeri kolonlarda
  if nullif(trim(coalesce(p_query,'')), '') is not null then
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=v_tbl and column_name='title') then
      v_where := format(' where t.title ilike %L', '%' || p_query || '%');
    elsif exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=v_tbl and column_name='baslik') then
      v_where := format(' where t.baslik ilike %L', '%' || p_query || '%');
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
    case when v_owner is null then 'null::text as _sahip_username, null::text as _sahip_avatar'
         else format('(select p.username::text from profiles p where p.id = t.%I) as _sahip_username,
                      (select p.avatar_url from profiles p where p.id = t.%I) as _sahip_avatar',
                     v_owner, v_owner) end,
    v_tbl, v_where, v_date
  ) into v_rows using greatest(1, least(100, coalesce(p_limit,40))), greatest(0, coalesce(p_offset,0));

  return json_build_object(
    'tablo', v_tbl,
    'sahip_kolonu', v_owner,
    'tarih_kolonu', v_date,
    'toplam', v_total,
    'satirlar', v_rows
  );
end;
$$;


drop function if exists admin_content_counts();

create or replace function admin_content_counts()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_kind text;
  v_tbl text;
  v_n bigint;
begin
  foreach v_kind in array array['post','listing','discount','event'] loop
    v_tbl := _admin_content_table(v_kind);
    if exists (select 1 from information_schema.tables
               where table_schema='public' and table_name=v_tbl) then
      execute format('select count(*) from %I', v_tbl) into v_n;
      v_out := v_out || jsonb_build_object(v_kind, v_n);
    else
      v_out := v_out || jsonb_build_object(v_kind, null);
    end if;
  end loop;
  return v_out::json;
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) KULLANICI ROLÜ                                                 ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_set_role(uuid, text);

create or replace function admin_set_role(p_user_id uuid, p_role text)
returns json language plpgsql security definer set search_path = public as $$
declare v_row profiles;
begin
  if p_role not in ('user','business') then
    raise exception 'Gecersiz rol: %. Sadece user veya business', p_role;
  end if;

  update profiles set
    role = p_role,
    -- ★ Business'tan user'a düşerken işletme onayı da geri alınır,
    --   yoksa "onaylı ama rolü user" gibi tutarsız bir kayıt kalır.
    business_durum = case when p_role = 'user' then null else business_durum end,
    updated_at = now()
  where id = p_user_id
  returning * into v_row;

  if v_row.id is null then raise exception 'Kullanici bulunamadi'; end if;

  begin
    perform admin_notify_user(
      p_user_id,
      case when p_role = 'business' then 'business_approved' else 'business_rejected' end,
      case when p_role = 'business'
           then 'Hesabın işletme hesabına yükseltildi.'
           else 'Hesabın standart kullanıcı hesabına dönüştürüldü.' end,
      'profile', p_user_id, true);
  exception when others then null;
  end;

  return json_build_object('id', v_row.id, 'role', v_row.role);
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
      and p.proname in ('admin_list_policies','admin_save_policy','admin_delete_policy',
                        'admin_list_content','admin_content_counts','admin_set_role')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select slug, title, version, is_published from policies order by sort_order;
select admin_content_counts() as icerik_sayilari;
select column_name from information_schema.columns
where table_schema='public' and table_name='popups' and column_name in ('logo_url','popup_kind');
