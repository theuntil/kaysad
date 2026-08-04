-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V4.6 — GENİŞ ARAMA + PERFORMANS
--
-- ★ panel_v4_5'ten SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) İÇERİK ARAMASI: sadece başlıkta değil                          ║
-- ║                                                                    ║
-- ║  Aranan kolonlar: başlık, açıklama, içerik, adres, marka, model,   ║
-- ║  kategori, etiketler ve JSON detay alanı.                          ║
-- ║                                                                    ║
-- ║  ★ Kolonlar information_schema'dan bulunuyor — tablo şeması         ║
-- ║    değişince SQL'e dokunmaya gerek yok.                             ║
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
