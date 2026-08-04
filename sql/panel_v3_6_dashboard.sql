-- ═══════════════════════════════════════════════════════════════════════
-- PANEL V3.6 — ANA SAYFA İSTATİSTİKLERİ
--
-- Eklenenler:
--   • Toplam cihaz + platform dağılımı (iOS / Android yüzdesi)
--   • En çok kullanıcısı olan 5 il
--   • Son gönderilen push'un sonuçları
--
-- ★ panel_v3_5'ten SONRA. İdempotent.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) CANLI SAYAÇLARA CİHAZ EKLENDİ                                  ║
-- ╚═══════════════════════════════════════════════════════════════════╝

create or replace function admin_live_counts()
returns json language plpgsql security definer set search_path = public as $$
declare
  v_post bigint := null; v_listing bigint := null;
  v_discount bigint := null; v_event bigint := null;
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='posts') then
    execute 'select count(*) from posts' into v_post;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='listings') then
    execute 'select count(*) from listings' into v_listing;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='indirimler') then
    execute 'select count(*) from indirimler' into v_discount;
  end if;
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='etkinlikler') then
    execute 'select count(*) from etkinlikler' into v_event;
  end if;

  return json_build_object(
    'kullanici', (select count(*) from auth.users),
    -- ★ Cihaz = tekil device_id (aynı cihazın birden çok kaydı olabilir)
    'cihaz',     (select count(distinct device_id) from devices),
    'post', v_post, 'ilan', v_listing, 'indirim', v_discount, 'etkinlik', v_event,
    'sikayet', (select count(*) from reports where status in ('pending','reviewing'))
  );
end;
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) EK İSTATİSTİKLER                                               ║
-- ║                                                                    ║
-- ║  ★ Platform dağılımı TEKİL CİHAZ üzerinden: aynı telefonun birden   ║
-- ║    çok satırı varsa (kullanıcı değiştirmiş) iki kez sayılmasın.     ║
-- ║  ★ "Push alabilen" ayrı sayılıyor — toplam cihaz sayısı yanıltıcı   ║
-- ║    olabiliyor, çoğu token'sız olabilir.                             ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop function if exists admin_dashboard_extra();

create or replace function admin_dashboard_extra()
returns json language sql security definer set search_path = public as $$
  select json_build_object(
    /* ── Cihaz ve platform ── */
    'cihaz_toplam', (select count(distinct device_id) from devices),
    'cihaz_push',   (select count(distinct device_id) from devices
                       where push_token is not null and push_token <> ''),
    'platformlar', (
      select coalesce(json_agg(x order by x.adet desc), '[]'::json) from (
        select coalesce(d.platform, 'bilinmiyor') as platform,
               count(distinct d.device_id) as adet,
               count(distinct d.device_id) filter (
                 where d.push_token is not null and d.push_token <> '') as push
        from devices d
        group by coalesce(d.platform, 'bilinmiyor')
      ) x
    ),

    /* ── En çok kullanıcısı olan 5 il ── */
    'top_sehirler', (
      select coalesce(json_agg(y order by y.kullanici desc), '[]'::json) from (
        select p.sehir, count(*) as kullanici
        from profiles p
        where p.sehir is not null and trim(p.sehir) <> ''
        group by p.sehir
        order by count(*) desc
        limit 5
      ) y
    ),

    /* ── Son gönderilen duyuru/push ── */
    'son_gonderim', (
      select case when z.mesaj is null then null else json_build_object(
        'tip', z.tip,
        'mesaj', z.mesaj,
        'tarih', z.son,
        'toplam', z.toplam,
        'okundu', z.okundu,
        'push_sent', z.push_sent,
        'push_failed', z.push_failed,
        'push_pending', z.push_pending
      ) end
      from (
        select n.type::text as tip, n.message as mesaj,
               max(n.created_at) as son,
               count(*) as toplam,
               count(*) filter (where n.is_read) as okundu,
               count(*) filter (where n.push_status = 'sent') as push_sent,
               count(*) filter (where n.push_status = 'failed') as push_failed,
               count(*) filter (where n.push_status = 'pending') as push_pending
        from notifications n
        where n.type in ('promo','earthquake','popup')
        group by n.type, n.message
        order by max(n.created_at) desc
        limit 1
      ) z
    ),

    /* ── Kullanıcı büyümesi (son 14 gün) ── */
    'buyume', (
      select coalesce(json_agg(g order by g.gun), '[]'::json) from (
        select date_trunc('day', u.created_at)::date as gun, count(*) as adet
        from auth.users u
        where u.created_at > now() - interval '14 days'
        group by date_trunc('day', u.created_at)::date
      ) g
    ),

    /* ── Etkileşim özeti ── */
    'push_acik_oran', (
      select case when count(distinct device_id) = 0 then 0
        else round(
          100.0 * count(distinct device_id) filter (
            where push_token is not null and push_token <> ''
              and coalesce(push_enabled, true))
          / count(distinct device_id), 1)
      end from devices
    )
  );
$$;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) YETKİLER                                                       ║
-- ╚═══════════════════════════════════════════════════════════════════╝

revoke all on function admin_dashboard_extra() from public, anon, authenticated;
grant execute on function admin_dashboard_extra() to service_role;

revoke all on function admin_live_counts() from public, anon, authenticated;
grant execute on function admin_live_counts() to service_role;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

select admin_live_counts() as canli;
select admin_dashboard_extra() as ek_istatistik;
