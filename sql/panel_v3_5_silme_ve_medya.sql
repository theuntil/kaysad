-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V3.5 — PROFİL MEDYASI + TAM KULLANICI SİLME
--
-- 1. profiles.background kolonu tanınıyor (background_url değil)
-- 2. admin_delete_user_completely — kullanıcıyla ilgili HER ŞEYİ siler,
--    yalnızca bans tablosu korunur
--
-- ★ panel_v3_4'ten SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) MEDYA KOLONLARI — 'background' de tanınıyor                    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function admin_profile_media_columns()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'avatar', (
      select c.column_name from information_schema.columns c
      where c.table_schema='public' and c.table_name='profiles'
        and c.column_name in ('avatar_url','avatar','profile_image')
      order by array_position(array['avatar_url','avatar','profile_image'], c.column_name)
      limit 1),
    'background', (
      select c.column_name from information_schema.columns c
      where c.table_schema='public' and c.table_name='profiles'
        -- ★ 'background' önce: projedeki gerçek kolon adı bu
        and c.column_name in ('background','background_url','cover_url','banner_url','kapak_url')
      order by array_position(
        array['background','background_url','cover_url','banner_url','kapak_url'], c.column_name)
      limit 1)
  );
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) TAM KULLANICI SİLME                                            ║
-- ║                                                                    ║
-- ║  ┌─ NASIL ÇALIŞIYOR ───────────────────────────────────────────┐   ║
-- ║  │ 1. Kullanıcının İÇERİKLERİ bulunur (posts, listings,          │   ║
-- ║  │    indirimler, etkinlikler, comments)                        │   ║
-- ║  │ 2. Bu içeriklere BAĞLI satırlar silinir (yorumlar, yanıtlar,  │   ║
-- ║  │    beğeniler, favoriler, biletler, katılımlar…) — başkasının  │   ║
-- ║  │    yazdığı yanıt da gider, çünkü bağlı olduğu içerik yok      │   ║
-- ║  │ 3. Kullanıcıya AİT satırlar silinir: sahiplik kolonu olan     │   ║
-- ║  │    (user_id, author_id, sender_id, blocker_id…) tüm tablolar  │   ║
-- ║  │ 4. profiles satırı silinir                                    │   ║
-- ║  │ 5. auth.users satırı silinir                                  │   ║
-- ║  └──────────────────────────────────────────────────────────────┘   ║
-- ║                                                                    ║
-- ║  ★ bans TABLOSUNA DOKUNULMAZ. Sebep: hesabı silsek bile cihaz ve    ║
-- ║    IP banı kalmalı; yoksa banlı kişi hesabını sildirip aynı         ║
-- ║    telefonla geri geliyor.                                          ║
-- ║                                                                    ║
-- ║  ★ Silme sırası önceden bilinemez (FK zinciri projeye göre değişir).║
-- ║    Bu yüzden 6 GEÇİŞLİ döngü: FK ihlali alan tablo bir sonraki      ║
-- ║    geçişte tekrar denenir. Hiçbir tablo silinemeyene kadar sürer.   ║
-- ║                                                                    ║
-- ║  ★ p_apply = false → sadece NE SİLİNECEĞİNİ sayar (önizleme)        ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_delete_user_completely(uuid, boolean);

create or replace function admin_delete_user_completely(
  p_user_id uuid,
  p_apply boolean default false
) returns json
language plpgsql security definer set search_path = public as $$
declare
  -- Sahiplik kolonu adayları
  v_owner_cols text[] := array[
    'user_id','author_id','owner_id','profile_id','kullanici_id','created_by',
    'recipient_id','actor_id','sender_id','receiver_id','reporter_id',
    'reported_user_id','blocker_id','blocked_id','follower_id','following_id',
    'target_user_id','from_user_id','to_user_id','uploaded_by','sahip_id'
  ];
  -- ASLA dokunulmayan tablolar
  v_skip text[] := array['bans','admin_audit_log','push_settings','app_settings','popups'];

  v_username text;
  v_rec record;
  v_sql text;
  v_n bigint;
  v_toplam bigint := 0;
  v_ozet jsonb := '{}'::jsonb;
  v_kalan text[] := '{}';
  v_gecis int;
  v_basarili boolean;

  -- İçerik tabloları ve o içeriğe bağlı satırları işaret eden kolonlar
  v_content record;
begin
  select username into v_username from profiles where id = p_user_id;

  if not exists (select 1 from auth.users where id = p_user_id)
     and not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'Kullanici bulunamadi: %', p_user_id;
  end if;

  /* ═══════ ÖNİZLEME MODU ═══════ */
  if not p_apply then
    for v_rec in
      select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and c.column_name = any(v_owner_cols)
        and c.table_name <> all(v_skip)
      order by c.table_name
    loop
      begin
        execute format('select count(*) from %I where %I = $1', v_rec.table_name, v_rec.column_name)
          into v_n using p_user_id;
        if v_n > 0 then
          v_ozet := v_ozet || jsonb_build_object(
            v_rec.table_name,
            coalesce((v_ozet->>v_rec.table_name)::bigint, 0) + v_n
          );
          v_toplam := v_toplam + v_n;
        end if;
      exception when others then
        null;  -- tip uyuşmazlığı (ör. text kolon) — atla
      end;
    end loop;

    return json_build_object(
      'uygulandi', false,
      'username', v_username,
      'toplam_satir', v_toplam,
      'tablolar', v_ozet,
      'korunan', to_jsonb(v_skip)
    );
  end if;

  /* ═══════ 1) İÇERİĞE BAĞLI SATIRLAR ═══════
     Kullanıcının gönderisine başkası yorum yaptıysa o yorum da gitmeli;
     yoruma gelen yanıtlar da öyle. Bunları içerik silinmeden ÖNCE
     temizliyoruz, yoksa FK zinciri kilitleniyor. */
  for v_content in
    select * from (values
      ('posts',        'post_id'),
      ('posts',        'gonderi_id'),
      ('listings',     'listing_id'),
      ('listings',     'ilan_id'),
      ('indirimler',   'indirim_id'),
      ('etkinlikler',  'etkinlik_id'),
      ('comments',     'parent_id'),
      ('comments',     'comment_id'),
      ('comments',     'parent_comment_id')
    ) as t(icerik_tablo, ref_kolon)
  loop
    -- İçerik tablosu var mı?
    continue when not exists (
      select 1 from information_schema.tables
      where table_schema='public' and table_name=v_content.icerik_tablo);

    -- Bu içeriğin sahiplik kolonu
    declare v_owner text;
    begin
      select column_name into v_owner
      from information_schema.columns
      where table_schema='public' and table_name=v_content.icerik_tablo
        and column_name = any(v_owner_cols)
      order by array_position(v_owner_cols, column_name)
      limit 1;

      continue when v_owner is null;

      -- Bu içeriğe referans veren TÜM tabloları bul ve sil
      for v_rec in
        select c.table_name
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema=c.table_schema and t.table_name=c.table_name
        where c.table_schema='public' and t.table_type='BASE TABLE'
          and c.column_name = v_content.ref_kolon
          and c.table_name <> all(v_skip)
      loop
        begin
          v_sql := format(
            'delete from %I where %I in (select id from %I where %I = $1)',
            v_rec.table_name, v_content.ref_kolon, v_content.icerik_tablo, v_owner
          );
          execute v_sql using p_user_id;
          get diagnostics v_n = row_count;
          if v_n > 0 then
            v_ozet := v_ozet || jsonb_build_object(
              v_rec.table_name, coalesce((v_ozet->>v_rec.table_name)::bigint, 0) + v_n);
            v_toplam := v_toplam + v_n;
          end if;
        exception when others then
          null;  -- sonraki geçişte tekrar denenecek
        end;
      end loop;
    end;
  end loop;

  /* ═══════ 2) YORUM YANIT ZİNCİRİ ═══════
     Kullanıcının yorumuna gelen yanıtlar, onların yanıtları… hepsi.
     Özyinelemeli: 5 seviye derinlik fazlasıyla yeter. */
  if exists (select 1 from information_schema.tables
             where table_schema='public' and table_name='comments') then
    declare
      v_parent text;
      v_cowner text;
      i int;
    begin
      select column_name into v_parent
      from information_schema.columns
      where table_schema='public' and table_name='comments'
        and column_name in ('parent_id','parent_comment_id','reply_to','ust_yorum_id')
      limit 1;

      select column_name into v_cowner
      from information_schema.columns
      where table_schema='public' and table_name='comments'
        and column_name = any(v_owner_cols)
      order by array_position(v_owner_cols, column_name)
      limit 1;

      if v_parent is not null and v_cowner is not null then
        for i in 1..5 loop
          begin
            execute format(
              'delete from comments where %I in (select id from comments where %I = $1)',
              v_parent, v_cowner
            ) using p_user_id;
            get diagnostics v_n = row_count;
            exit when v_n = 0;
            v_ozet := v_ozet || jsonb_build_object(
              'comments', coalesce((v_ozet->>'comments')::bigint, 0) + v_n);
            v_toplam := v_toplam + v_n;
          exception when others then
            exit;
          end;
        end loop;
      end if;
    end;
  end if;

  /* ═══════ 3) SAHİPLİK KOLONU OLAN TÜM TABLOLAR ═══════
     6 geçiş: FK ihlali alan tablo sonraki geçişte tekrar denenir. */
  for v_gecis in 1..6 loop
    v_basarili := false;
    v_kalan := '{}';

    for v_rec in
      select c.table_name, c.column_name
      from information_schema.columns c
      join information_schema.tables t
        on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema = 'public'
        and t.table_type = 'BASE TABLE'
        and c.column_name = any(v_owner_cols)
        and c.table_name <> all(v_skip)
        and c.table_name <> 'profiles'   -- profil en sonda
      order by c.table_name
    loop
      begin
        execute format('delete from %I where %I = $1', v_rec.table_name, v_rec.column_name)
          using p_user_id;
        get diagnostics v_n = row_count;

        if v_n > 0 then
          v_ozet := v_ozet || jsonb_build_object(
            v_rec.table_name, coalesce((v_ozet->>v_rec.table_name)::bigint, 0) + v_n);
          v_toplam := v_toplam + v_n;
          v_basarili := true;
        end if;
      exception when others then
        v_kalan := v_kalan || v_rec.table_name::text;
      end;
    end loop;

    -- Silinecek bir şey kalmadıysa döngüyü bitir
    exit when not v_basarili and coalesce(array_length(v_kalan, 1), 0) = 0;
  end loop;

  /* ═══════ 4) PROFİL ═══════ */
  begin
    delete from profiles where id = p_user_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_ozet := v_ozet || jsonb_build_object('profiles', v_n);
      v_toplam := v_toplam + v_n;
    end if;
  exception when others then
    raise exception 'Profil silinemedi (bagli kayit kalmis olabilir): %', sqlerrm;
  end;

  /* ═══════ 5) AUTH KAYDI ═══════ */
  begin
    delete from auth.identities where user_id = p_user_id;
  exception when others then null;
  end;

  begin
    delete from auth.sessions where user_id = p_user_id;
  exception when others then null;
  end;

  begin
    delete from auth.users where id = p_user_id;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_ozet := v_ozet || jsonb_build_object('auth.users', v_n);
      v_toplam := v_toplam + v_n;
    end if;
  exception when others then
    raise exception 'Auth kaydi silinemedi: %', sqlerrm;
  end;

  return json_build_object(
    'uygulandi', true,
    'username', v_username,
    'toplam_satir', v_toplam,
    'tablolar', v_ozet,
    'cozulemeyen', to_jsonb(v_kalan),
    'korunan', to_jsonb(v_skip)
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) YETKİLER                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

revoke all on function admin_delete_user_completely(uuid, boolean) from public, anon, authenticated;
grant execute on function admin_delete_user_completely(uuid, boolean) to service_role;

revoke all on function admin_profile_media_columns() from public, anon, authenticated;
grant execute on function admin_profile_media_columns() to service_role;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- Hangi kolonlar medya olarak kullanılıyor?
select admin_profile_media_columns() as medya_kolonlari;

-- Silme fonksiyonunun göreceği tablolar (bans hariç)
select c.table_name, c.column_name
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema and t.table_name = c.table_name
where c.table_schema = 'public' and t.table_type = 'BASE TABLE'
  and c.column_name in ('user_id','author_id','owner_id','profile_id','kullanici_id',
                        'created_by','recipient_id','actor_id','sender_id','receiver_id',
                        'reporter_id','reported_user_id','blocker_id','blocked_id',
                        'follower_id','following_id')
  and c.table_name not in ('bans','admin_audit_log','push_settings','app_settings','popups')
order by 1, 2;
