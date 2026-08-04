-- ═══════════════════════════════════════════════════════════════════════
-- BOOST İSTATİSTİKLERİ
--
-- ┌─ NEDEN GEREKLİ ───────────────────────────────────────────────────┐
-- │ Reklam kampanyalarının `ad_stats_daily` tablosu var ama boost'un  │
-- │ yoktu. Bu yüzden boost detay sayfasında performans gösterilemiyor.│
-- │                                                                    │
-- │ `ad_stats_daily` yeniden kullanılamıyor: birincil anahtarı        │
-- │ `campaign_id` ve `ad_campaigns`'e yabancı anahtarla bağlı.        │
-- │ Aynı yapıyı boost için ayrı kuruyoruz.                            │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ panel_v4_2_reklam.sql'den SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) GÜNLÜK İSTATİSTİK TABLOSU                                      ║
-- ║                                                                    ║
-- ║  ★ Gün bazında toplanıyor, olay bazında DEĞİL. Milyonlarca satır   ║
-- ║    yerine boost başına günde tek satır; sorgular hızlı kalıyor.    ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create table if not exists boost_stats_daily (
  boost_id   uuid not null references boost_requests(id) on delete cascade,
  gun        date not null default current_date,
  gosterim   bigint not null default 0,
  tiklama    bigint not null default 0,
  primary key (boost_id, gun)
);

create index if not exists idx_boost_stats_gun
  on boost_stats_daily (gun desc);

create index if not exists idx_boost_stats_boost
  on boost_stats_daily (boost_id, gun desc);


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) OLAY KAYDI                                                     ║
-- ║                                                                    ║
-- ║  ★ Mobil uygulama çağırıyor: içerik listede görününce 'view',      ║
-- ║    üstüne dokununca 'click'.                                       ║
-- ║                                                                    ║
-- ║  ★ Sadece AKTİF boost sayılıyor — bekleyen ya da süresi dolmuş     ║
-- ║    kayda gösterim yazılmıyor.                                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists boost_track(uuid, text);

create or replace function boost_track(
  p_boost_id uuid,
  p_event text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_event not in ('view', 'click') then
    return;
  end if;

  -- ★ Aktif değilse sessizce yok say
  if not exists (
    select 1 from boost_requests
    where id = p_boost_id and status = 'active'
  ) then
    return;
  end if;

  insert into boost_stats_daily (boost_id, gun, gosterim, tiklama)
  values (
    p_boost_id,
    current_date,
    case when p_event = 'view'  then 1 else 0 end,
    case when p_event = 'click' then 1 else 0 end
  )
  on conflict (boost_id, gun) do update set
    gosterim = boost_stats_daily.gosterim
               + case when p_event = 'view'  then 1 else 0 end,
    tiklama  = boost_stats_daily.tiklama
               + case when p_event = 'click' then 1 else 0 end;
end;
$$;

grant execute on function boost_track(uuid, text) to anon, authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) RLS — sahibi kendi istatistiğini görsün                        ║
-- ╚═══════════════════════════════════════════════════════════════════╝

alter table boost_stats_daily enable row level security;

drop policy if exists boost_stats_own on boost_stats_daily;

create policy boost_stats_own on boost_stats_daily
  for select using (
    exists (
      select 1 from boost_requests b
      where b.id = boost_stats_daily.boost_id
        and b.user_id = auth.uid()
    )
  );


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  4) ÖZET FONKSİYONU                                                ║
-- ║                                                                    ║
-- ║  ★ Panel ve mobil aynı fonksiyonu kullanıyor — iki yerde ayrı      ║
-- ║    hesap yapılmıyor, sayılar tutarlı kalıyor.                      ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists boost_stats(uuid, integer);

create or replace function boost_stats(
  p_boost_id uuid,
  p_gun integer default 30
) returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'gosterim', coalesce((
      select sum(gosterim) from boost_stats_daily
      where boost_id = p_boost_id), 0),
    'tiklama', coalesce((
      select sum(tiklama) from boost_stats_daily
      where boost_id = p_boost_id), 0),
    'gunluk', coalesce((
      select json_agg(json_build_object(
        'gun', gun, 'gosterim', gosterim, 'tiklama', tiklama
      ) order by gun)
      from boost_stats_daily
      where boost_id = p_boost_id
        and gun >= current_date - p_gun), '[]'::json)
  );
$$;

grant execute on function boost_stats(uuid, integer) to authenticated;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select table_name from information_schema.tables
where table_name = 'boost_stats_daily';

select proname from pg_proc
where proname in ('boost_track', 'boost_stats')
order by proname;

-- ★ Örnek: aktif bir boost'un istatistiği
select boost_stats(id) as ornek
from boost_requests
where status = 'active'
limit 1;
