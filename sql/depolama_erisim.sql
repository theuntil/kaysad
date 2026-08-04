-- ═══════════════════════════════════════════════════════════════════════
-- DEPOLAMA ERİŞİMİ — "herkes okur, kimse yazamaz"
--
-- ┌─ İSTENEN DAVRANIŞ ────────────────────────────────────────────────┐
-- │ OKUMA  → herkese açık (uygulama ve panel görseli gösterebilsin)   │
-- │ YAZMA  → sadece service_role (panel ve servisler)                  │
-- │ SİLME  → sadece service_role                                       │
-- │                                                                    │
-- │ Yani: "herkese açık" demek herkes DÜZENLEYEBİLİR demek DEĞİL.     │
-- │ Sadece dosyanın adresini bilen görebilir. Yükleme ve silme        │
-- │ yetkisi sende kalıyor.                                             │
-- └───────────────────────────────────────────────────────────────────┘
--
-- ★ İdempotent — tekrar çalıştırmak zarar vermez.
-- ═══════════════════════════════════════════════════════════════════════


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  1) BUCKET'LARI HERKESE AÇIK YAP                                   ║
-- ║                                                                    ║
-- ║  ★ `public = true` olunca Supabase şu ucu RLS kontrolü olmadan     ║
-- ║    servis ediyor:                                                  ║
-- ║      /storage/v1/object/public/<bucket>/<yol>                      ║
-- ║                                                                    ║
-- ║  ★ Yazma bundan ETKİLENMİYOR — o hâlâ politikalara bağlı.          ║
-- ╚═══════════════════════════════════════════════════════════════════╝

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('galeri', 'galeri', true, 209715200),   -- 200 MB
  ('reklam', 'reklam', true, 20971520),    --  20 MB
  ('media',  'media',  true, 52428800)     --  50 MB
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit;


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  2) OKUMA POLİTİKASI                                               ║
-- ║                                                                    ║
-- ║  ★ Public bucket'ta genel uç zaten RLS'i atlıyor. Ama imzalı URL   ║
-- ║    ve SDK üzerinden okuma bu politikayı kullanıyor — ikisi de      ║
-- ║    çalışsın diye açıkça tanımlıyoruz.                              ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop policy if exists "kays_public_read" on storage.objects;

create policy "kays_public_read"
on storage.objects for select
to public
using (bucket_id in ('galeri', 'reklam', 'media'));


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  3) YAZMA / GÜNCELLEME / SİLME — SADECE service_role               ║
-- ║                                                                    ║
-- ║  ★ Kritik kısım burası. Okuma herkese açık ama yazma değil:        ║
-- ║    rastgele biri senin bucket'ına dosya atamaz, var olanı          ║
-- ║    değiştiremez, silemez.                                          ║
-- ║                                                                    ║
-- ║  ★ Panel ve mail/telefon servisleri service_role ile bağlanıyor,   ║
-- ║    onlar etkilenmiyor.                                             ║
-- ║                                                                    ║
-- ║  ★ Mobil uygulama yükleme yapıyorsa (reklam görseli) imzalı URL    ║
-- ║    kullanıyor — o da service_role tarafından üretiliyor.           ║
-- ╚═══════════════════════════════════════════════════════════════════╝

drop policy if exists "kays_service_write" on storage.objects;
drop policy if exists "kays_service_update" on storage.objects;
drop policy if exists "kays_service_delete" on storage.objects;

create policy "kays_service_write"
on storage.objects for insert
to service_role
with check (bucket_id in ('galeri', 'reklam', 'media'));

create policy "kays_service_update"
on storage.objects for update
to service_role
using (bucket_id in ('galeri', 'reklam', 'media'));

create policy "kays_service_delete"
on storage.objects for delete
to service_role
using (bucket_id in ('galeri', 'reklam', 'media'));


-- ╔═══════════════════════════════════════════════════════════════════╗
-- ║  DOĞRULAMA                                                         ║
-- ╚═══════════════════════════════════════════════════════════════════╝

-- ── Bucket'lar açık mı? Üçü de `public = t` olmalı ──
select id, name, public, file_size_limit
from storage.buckets
where id in ('galeri', 'reklam', 'media')
order by id;

-- ── Politikalar yerinde mi? ──
select policyname, cmd, roles
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'kays_%'
order by policyname;

-- ── Örnek bir dosya adresi (tarayıcıda açıp test et) ──
select
  'https://SENIN-SUPABASE-ADRESIN/storage/v1/object/public/reklam/' || name as ornek_url
from storage.objects
where bucket_id = 'reklam'
order by created_at desc
limit 3;
