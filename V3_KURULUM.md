# Panel V3 — Kurulum ve Değişiklikler

## 1. SQL sırası (Supabase SQL Editor)

Sırayı bozmadan çalıştır. Hepsi idempotent — tekrar çalıştırmak zarar vermez.

1. `sql/admin_panel_setup.sql` (zaten çalıştıysa atla)
2. `sql/panel_v3_veritabani.sql` — kullanıcı listesi, tutarlılık raporu, ban/cihaz banı, işletme filtresi, 81 il
3. `sql/panel_v3_gonderim.sql` — **YENİ**: birleşik gönderim (`admin_send_v3`, `admin_send_preview`, `admin_undo_send_v3`, `admin_list_sends`)

Her dosyanın sonunda doğrulama sorgusu var; `service_role: OK` görmen lazım.

> `business_basvuru_sistemi.sql` ve `KOMPLE_guvenlik_migration.sql` de çalışmış olmalı —
> onay sayfaları `admin_set_business` / `admin_set_student` fonksiyonlarını kullanıyor.

## 2. Panel

`npm install && npm run build && npm start` — ek bağımlılık yok.

## 3. Ne değişti

### Bildirim + Push birleşti → `/gonderim`
Tek form, tek **kanal anahtarı**:

| Kanal | notifications satırı | Telefona push |
|---|---|---|
| `İkisi de` | evet (`push_status='pending'`) | evet |
| `Uygulama içi` | evet (`push_status='skipped'`) | **hayır** |
| `Sadece push` | **hayır** | evet |

- Eski `/notifications` adresi `/gonderim`'e yönleniyor.
- `/push` sayfası duruyor ama artık sadece **ayar + log** için (tip bazlı aç/kapa, sessiz saat, gönderim kaydı).
  Oradaki eski composer'ı kullanmaya devam edersen aynı işi iki yerden yapıyor olursun; istersen o bölümü kaldırırız.

### Hedefleme
- Hesap türü: **Herkes / Öğrenci / İşletme** (`p_business_only` eklendi)
- Şehir: **81 ilin tamamı**, kullanıcısı olmayanlar dahil. Plaka koduyla arama, bölge ile toplu seçim, yanında kullanıcı sayısı.
- Gönder butonu **sayım yapılmadan açılmıyor**; sayımla gerçek arasında %25+ sapma varsa gönderim durur.
- Acil uyarıda "GONDER" yazma onayı var.

### Ana sayfa
Çıkanlar: okunmamış / toplam bildirim / okundu sayıları.
Girenler: toplam + aktif + yeni kullanıcı, işletme, banlı, **şehir dağılımı widget'ı**, tıklanabilir **bekleyen iş** kutuları.

### Yeni sayfalar
- `/kullanicilar` — auth + profiles birleşik liste, 9 filtre sekmesi, arama, şehir widget'ı, sayfalama
- `/kullanicilar/[id]` — **tutarlılık kontrolü** (profil yok / auth yok / mükerrer kayıt / e-posta–telefon uyuşmazlığı / doğrulama bayrağı / ban bayrağı ↔ ban kaydı çelişkisi), auth ve profiles yan yana, cihazlar, ban kayıtları, şikâyetler
- `/banlar` — hesap ve cihaz banları, süresi geçmişler; cihaz banında "kaç hesap bu cihazı kullanmış"
- `/cihazlar` — **sadece cihaz banı** (hesaba dokunmadan)
- `/onay/isletme` — bekleyen/onaylanan/reddedilen, red sebebi zorunlu
- `/onay/ogrenci` — belge kartta görüntülenir, red sebebi zorunlu

### Tema
Varsayılan **karanlık**, açık mod var. Tema çerezde, `<html>` sınıfı sunucuda basılıyor → açılışta renk sıçraması yok.

### Menü
Gruplu (Gönderim / Kullanıcılar / Güvenlik), bekleyen iş sayaçları menüde. Mobilde çekmece + 4 hızlı sekme. Hiçbir özellik gizlenmedi.

## 4. Bilinen sınır

`devices` tablosunda **IP kolonu yok** — cihaz banı `device_id` üzerinden çalışıyor.
IP bazlı ban istersen: `alter table devices add column ip text;` + mobil tarafın cihaz kaydında IP yazması gerekir. Sonra ban fonksiyonuna IP eşleşmesi eklenir.

## 5. Doğrulama (SQL)

```sql
-- Gönderim: uygulama içi kanalın push'a düşmediğini kontrol et
select push_status, count(*) from notifications
where type = 'promo' group by push_status;

-- Tutarsız kayıt sayısı
select (admin_user_counts()->>'tutarsiz')::int as tutarsiz;
```
