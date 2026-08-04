# KAYS ADMIN — SİSTEM REHBERİ

Bu dosya, veritabanındaki her fonksiyonun/tetikleyicinin **ne işe yaradığını**, **kimin çağırdığını** ve **bozulduğunda nereye bakılacağını** anlatır. Bir şey çalışmadığında önce buraya bak.

---

## 0. SQL ÇALIŞTIRMA SIRASI

Sıra önemli — sonrakiler öncekilerin fonksiyonlarını kullanıyor.

```
 1. admin_panel_setup.sql
 2. business_basvuru_sistemi.sql        (işletme başvuruları)
 3. KOMPLE_guvenlik_migration.sql       (öğrenci, ban altyapısı)
 4. notifications_migration.sql         (bildirim tetikleyicileri)
 5. push_sistemi_veritabani.sql         (push altyapısı)
 6. popup_system_complete.sql           (popup)
 7. panel_v3_veritabani.sql
 8. panel_v3_gonderim.sql
 9. panel_v3_1_duzeltmeler.sql
10. panel_v3_2_onay_bildirimleri.sql
11. panel_v3_3_gelismis.sql
12. panel_v3_4_duzeltme_ve_raporlar.sql
13. panel_v3_5_silme_ve_medya.sql
14. panel_v3_6_dashboard.sql
15. panel_v4_1_push_olcek.sql           ★ push ölçeklendirme
16. panel_v4_2_reklam.sql               ★ reklam + boost
17. panel_v4_3_politika_icerik.sql      ★ politikalar + içerik
```

Hepsi idempotent — tekrar çalıştırmak zarar vermez.

**Gerekli eklentiler:** `pg_net` (trigger→panel HTTP), `pg_cron` (zamanlanmış işler). Supabase'de Database → Extensions'tan aç.

---

## 1. BİLDİRİM VE PUSH

### Akış

```
Olay olur (beğeni/yorum/mesaj/duyuru)
      ↓
notifications tablosuna satır  (push_status = 'pending')
      ↓
trg_notifications_push_stmt  ← STATEMENT seviyesi, INSERT başına 1 kez
      ↓
push_wake_panel()  → pg_net ile POST /api/push/dispatch  {"drain": true}
      ↓
Panel: admin_claim_push_batch(2000)  ← atomik çekme, satırlar 'sending'
      ↓
Expo API (100'lük gruplar)
      ↓
admin_record_push_results()  → push_status = 'sent' | 'failed'
```

### Fonksiyonlar

| Fonksiyon | Ne yapar | Kim çağırır |
|---|---|---|
| `push_wake_panel(force)` | Panele "kuyrukta iş var" der. Aynı saniyede ikinci çağrıyı yutar (debounce). | Trigger + cron |
| `trg_fn_notifications_push_stmt()` | Tetikleyici gövdesi; sadece `push_wake_panel()` çağırır | `trg_notifications_push_stmt` |
| `admin_claim_push_batch(limit)` | Kuyruktan toplu çeker, `sending` işaretler, cihaz+token eşleşmelerini döndürür | Panel `/api/push/dispatch` |
| `admin_finalize_orphan_push()` | Cihazı olmayan `sending` satırları `skipped` yapar | Panel, her turda |
| `admin_recover_stuck_push(dk)` | 5 dk'dan uzun `sending`de kalanları `pending`e döndürür | cron `push_recover` |
| `admin_queue_status()` | Kuyruk sayaçları | Panel `/push` |
| `admin_clear_push_queue(mod)` | `skip`: push iptal, bildirim kalır · `delete`: satırlar silinir | Panel butonu |
| `push_in_quiet_hours()` | Sessiz saatte miyiz | `admin_claim_push_batch` |

### ★ Kritik tasarım kararı: STATEMENT trigger

Eski hâli `for each row` idi. 500.000 kişilik duyuruda tek INSERT 500.000 satır yazıyor ve trigger her satır için ayrı HTTP isteği kuyruğa atıyordu. Şimdi `for each statement`: **1 satır da yazılsa 500.000 de, veritabanı tarafındaki maliyet aynı.**

### ★ FOR UPDATE SKIP LOCKED

`admin_claim_push_batch` satırları kilitleyerek çekiyor. İki panel örneği aynı anda çalışsa bile aynı bildirimi iki kez göndermezler. Yatay ölçeklendirme bunsuz mümkün değildi.

### Bozulduğunda

| Belirti | Bak |
|---|---|
| Push hiç gitmiyor | `admin_queue_status()` → `push_acik` false mu? `push_panel_url` ve `push_webhook_secret` dolu mu? |
| Gecikmeli gidiyor | `pg_net` kurulu mu? `select * from cron.job` → `push_drain` aktif mi? |
| Kuyruk büyüyor | `admin_recover_stuck_push(5)` çalıştır; `sending`de takılı satır var mı |
| Çift push | İki panel örneği var ve `SKIP LOCKED` migration'ı çalışmamış olabilir |
| Local'de push yok | Supabase `localhost`'a erişemez. `ngrok http 3000` → adresi `push_panel_url`'e yaz |

---

## 2. OTOMATİK TEMİZLİK

| Fonksiyon | Kural | Zaman |
|---|---|---|
| `cleanup_notifications(10, 10, 50000)` | 10 günden eski bildirimleri siler; **her kullanıcının son 10 bildirimi korunur** | Gece 04:00 |
| `cleanup_audit_log(30)` | 30 günden eski işlem kaydı | Gece 04:00 |
| `cleanup_push_log(7)` | 7 günden eski push logu | Gece 04:00 |
| `run_maintenance()` | Yukarıdakilerin hepsi + `admin_recover_stuck_push` | cron `kays_maintenance` |

★ Silme **parçalı**: tek turda 50.000 satır, en fazla 40 tur. 10 milyon satırlık tek DELETE tabloyu kilitler ve WAL'i şişirir.

★ Kuyrukta bekleyen (`pending`/`sending`) bildirimlere dokunulmuyor — gönderilmeden silinmesinler.

Panelden elle: `/push` → Temizlik bölümü.

---

## 3. REKLAM SİSTEMİ

### Tablolar

| Tablo | İçerik |
|---|---|
| `ad_slots` | Alanlar ve kapasiteleri (anasayfa 10, diğerleri 1) |
| `ad_campaigns` | Kampanya: içerik + fiyat + durum |
| `ad_offers` | Teklif geçmişi (kaçıncı teklif, fiyat, not, karar) |
| `ad_edits` | Onay bekleyen içerik değişiklikleri |
| `ad_stats_daily` | Gün başına gösterim/tıklama (ham olay değil, özet) |
| `boost_requests` | İlan/indirim/etkinlik öne çıkarma talepleri |

### Durum akışı

```
pending ──onay──> approved ──alan boşsa──> active ──süre bitti──> expired
   │                                          │
   └──red──> rejected                         └──panel──> paused
                │                                            │
                └──yeni teklif──> pending                    └──resume──> active

active + düzenleme talebi ──> edit_pending ──onay──> active
```

### Fonksiyonlar

**Reklam veren (authenticated):**

| Fonksiyon | Ne yapar |
|---|---|
| `ad_slot_status(slot)` | Alanın kapasitesi, kaç aktif, **en düşük aktif fiyat** |
| `ad_submit_offer(...)` | Teklif oluşturur. **Alan doluysa fiyat en düşük aktif tekliften yüksek olmak zorunda** |
| `ad_request_edit(id, patch)` | İçerik değişikliği talebi. Aktif reklamda onaya düşer, pending'de doğrudan uygulanır |
| `ad_track(id, 'view'\|'click')` | Gösterim/tıklama sayacı |
| `boost_submit(...)` | Boost teklifi (her zaman 1 ay) |

**Panel (service_role):**

| Fonksiyon | Ne yapar |
|---|---|
| `admin_ad_approve(id)` | Onaylar. **Alan doluysa `approved` bırakır, aktifleştirmez** — panel uyarır |
| `admin_ad_reject(id, sebep)` | Reddeder, sebep reklam verene görünür |
| `admin_ad_pause(id)` | Aktifi pasife alır (silmez) — yeni teklife yer açmak için |
| `admin_ad_resume(id)` | Pasifi geri yayına alır (kapasite kontrolüyle) |
| `admin_ad_edit_decide(editId, onay, sebep)` | Düzenleme onayı/reddi |
| `ad_expire_due()` | Süresi dolanları `expired` yapar, boost bayraklarını indirir |
| `admin_boost_decide(id, onay, sebep)` | Boost onay/red; onayda içerik bayrağı otomatik açılır |
| `boost_apply_flags()` | `boost_requests` → içerik tablolarındaki `boost`/`super_boost` senkronu |

### ★ Kapasite kuralı nerede

**Sadece SQL'de.** Panel kuralı bilmiyor, sonucu aktarıyor. `admin_ad_approve` alan doluysa `{"aktif_edilemedi": true, "sebep": "..."}` döner, panel bunu uyarı olarak gösterir. Kuralı iki yerde tutmak, ikisinin ayrı düşmesi demektir.

### ★ Boost bayrakları

`boost_apply_flags()` her karar sonrası çalışıyor ve içerik tablolarındaki bayrakları **sıfırdan** yeniden kuruyor: önce hepsini kapatıp aktif taleplere göre açıyor. Böylece süresi dolan boost'un bayrağı unutulmuyor.

### RLS

- `ad_campaigns`: aktif olanları **herkes** görür (uygulama gösteriyor); reklam veren **kendi** kampanyalarının hepsini görür
- `ad_offers`, `ad_edits`, `ad_stats_daily`, `boost_requests`: sadece sahibi
- **Yazma politikası yok** — her şey security definer fonksiyonlardan geçiyor, fiyat/durum istemciden değiştirilemiyor

---

## 4. POLİTİKALAR

| Nesne | Açıklama |
|---|---|
| `policies` tablosu | slug, başlık, içerik, özet, sürüm, yayın durumu |
| `trg_policies_touch` | `updated_at` günceller; **içerik ya da başlık değiştiyse** `version` artırır (sıralama değişikliği sürüm artırmaz) |
| `admin_list_policies()` | Panel listesi |
| `admin_save_policy(...)` | Oluştur/güncelle |
| `admin_delete_policy(id)` | Sil |

**RLS:** `is_published = true` olanları herkes okur. Yazma politikası **yok** → sadece service_role (panel) değiştirebilir.

Başlangıçta 14 politika geliyor (gizlilik, kullanım, çerez, KVKK, ilan, indirim, reklam, topluluk, çocuk güvenliği, telif, veri saklama…).

---

## 5. KULLANICI YÖNETİMİ

| Fonksiyon | Ne yapar |
|---|---|
| `admin_list_users(q, filtre, limit, offset)` | auth.users + profiles birleşik liste, tutarsızlık bayrağıyla |
| `admin_user_full(id)` | Detay: auth, profil, cihazlar, banlar, tutarsızlıklar |
| `admin_fix_mismatch(id, kodlar, uygula)` | **`uygula=false` → sadece plan.** `true` → düzeltir |
| `admin_update_identity(id, patch)` | E-posta/telefon **auth.users ve profiles'ta birlikte** günceller |
| `admin_set_role(id, rol)` | user ↔ business; `business_durum` tutarlılığını da düzeltir + bildirim gönderir |
| `admin_delete_user_completely(id, uygula)` | Kullanıcı + tüm verisi. **`bans` korunur** |
| `admin_set_profile_media(id, alan, url)` | avatar / background kolonunu günceller |

### ★ auth ana kaynaktır

`admin_fix_mismatch` e-posta/telefon çakışmasında **profiles'ı auth'a eşitler**, tersini yapmaz. Kullanıcı auth'taki değerle giriş yapıyor; ters yön girişi bozardı.

### ★ Tam silme nasıl çalışıyor

1. Kullanıcının içeriklerine (`posts`, `listings`, `indirimler`, `etkinlikler`, `comments`) **bağlı** satırlar silinir — başkasının yazdığı yorum da gider
2. Yorum yanıt zinciri 5 seviye özyinelemeyle temizlenir
3. Sahiplik kolonu (`user_id`, `author_id`, `blocker_id`, `sender_id`…) olan tüm tablolar **6 geçişli döngüde** silinir — FK ihlali alan tablo sonraki geçişte tekrar denenir
4. `profiles` → `auth.identities` → `auth.sessions` → `auth.users`

`bans`, `admin_audit_log`, `push_settings`, `app_settings`, `popups` **atlanır**.

---

## 6. BAN SİSTEMİ

| Fonksiyon | Ne yapar |
|---|---|
| `admin_create_ban(user, device_ids[], ips[], sebep, not, bitis, kim)` | **TEK KAYIT** — cihazlar ve IP'ler dizide |
| `admin_ban_user_full(...)` | Hesap + cihazları (+ istenirse IP'leri), yine tek kayıt |
| `admin_ban_device(id, ...)` | Tek cihaz |
| `admin_ban_ip(ip, ...)` | Tek IP |
| `is_device_banned(id)` | **Mobil buradan kontrol etmeli** — dizi + eski kolon birlikte taranır |
| `is_ip_banned(ip)` | Aynı |
| `check_access(device, ip)` | Mobil için tek kapı: cihaz/IP/kullanıcı banı birlikte |

### ★ Neden dizi

Eskiden 7 cihazlı kullanıcı banlandığında **7 ayrı satır** oluşuyordu ve ban listesi okunmaz hâle geliyordu. Şimdi `bans.device_ids` / `bans.ips` dizileri var, bir ban işlemi = bir satır.

Eski `device_id` / `ip` kolonları **korunuyor** ve dizinin ilk elemanı oraya da yazılıyor — bu kolonlara bakan eski mobil kod bozulmuyor.

---

## 7. ONAY VE BİLDİRİM

| Fonksiyon | Ne yapar |
|---|---|
| `admin_set_business(id, onay, sebep)` | İşletme onayı + **otomatik bildirim** |
| `admin_set_student(id, onay, sebep)` | Öğrenci onayı + **otomatik bildirim** |
| `admin_notify_user(id, tip, mesaj, ...)` | Tek kullanıcıya bildirim |
| `admin_send_v4(...)` | Toplu gönderim; `{ad}` `{sehir}` değişkenlerini **alıcı başına** doldurur |
| `admin_render_message(mesaj, user)` | Önizleme için değişken doldurma |
| `admin_push_targets_personal(...)` | Kişiselleştirilmiş push hedefleri |

### ★ Bildirim onayı engellemez

Onay fonksiyonlarındaki bildirim çağrısı `exception when others then null` ile sarılı. Bildirim tipi kısıtta yoksa ya da push_settings satırı eksikse **onay yine kaydedilir**.

---

## 8. ŞİKÂYETLER

| Fonksiyon | Ne yapar |
|---|---|
| `admin_report_counts()` | Cevaplanmamış (pending+reviewing) ve toplam |
| `admin_list_reports_v2(durum, q, limit, offset)` | Cevaplanmamışlar **her zaman üstte** |
| `admin_report_detail(id)` | İki taraf + şikâyet edilen içerik + aynı içeriğe gelen diğer şikâyetler |
| `admin_set_report_status(id, durum, not)` | `resolved` (kabul) / `dismissed` (red) / `reviewing` |
| `admin_delete_report(id)` | Kaydı siler |

★ **Kabul etmek içeriği silmez, kullanıcıyı banlamaz** — sadece şikâyeti kapatır. Onay penceresi bunu yazıyor.

---

## 9. İÇERİK YÖNETİMİ

| Fonksiyon | Ne yapar |
|---|---|
| `_admin_content_table(tip)` | post→posts, listing→listings, discount→indirimler, event→etkinlikler |
| `_admin_owner_column(tablo)` | Sahiplik kolonunu **otomatik bulur** (user_id/author_id/owner_id…) |
| `_admin_date_column(tablo)` | Sıralama kolonunu bulur |
| `admin_list_content(tip, q, limit, offset)` | Sayfalı liste, en yeni üstte |
| `admin_user_content(user, tip, ...)` | Bir kullanıcının içerikleri |
| `admin_update_content(tip, id, patch)` | Kolon adları `information_schema`'ya karşı doğrulanır; `id`/`user_id`/`created_at` korumalı |
| `admin_delete_content(tip, id)` | Siler |

### ★ Şema-bağımsız tasarım

Kolon adları koda gömülü **değil**. Tabloya yeni kolon eklediğinde panel kendiliğinden gösterir. Tablo adı değişirse sadece `_admin_content_table` güncellenir.

---

## 10. ZAMANLANMIŞ İŞLER (pg_cron)

| İş | Sıklık | Ne yapar |
|---|---|---|
| `push_drain` | Her dakika | `push_wake_panel(true)` — trigger çalışmazsa güvenlik ağı |
| `push_recover` | 5 dakikada bir | Takılı `sending` satırları kurtarır |
| `kays_maintenance` | Gece 04:00 | Bildirim/audit/log temizliği |
| `ad_expire` | Saat başı | Süresi dolan reklam ve boost'ları kapatır |

Kontrol: `select jobname, schedule, active from cron.job;`

---

## 11. ORTAM DEĞİŞKENLERİ

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...          # ★ ASLA istemciye sızmamalı
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2a$10$...            # bcrypt
SESSION_SECRET=<48+ karakter rastgele>
PUSH_WEBHOOK_SECRET=<rastgele>            # ★ app_settings'teki ile AYNI
SUPABASE_MEDIA_BUCKET=media               # profil görselleri
```

Veritabanı tarafındaki ayarlar (`app_settings` tablosu, panelden `/push`):
- `push_enabled` — ana anahtar
- `push_panel_url` — panelin public adresi, **sonda `/` yok**
- `push_webhook_secret` — `.env`'deki ile birebir aynı
- `push_quiet_start` / `push_quiet_end` — sessiz saat

---

## 12. ÖLÇEK NOTLARI

| Sınır | Değer | Not |
|---|---|---|
| Expo API | ~600 bildirim/saniye | Sağlayıcı limiti, aşılamaz. 500.000 push ≈ 14 dakika |
| Expo grup boyutu | 100 mesaj/istek | `expo-push.ts` otomatik böler |
| Kuyruk turu | 2.000 bildirim | `admin_claim_push_batch(limit)` |
| Temizlik turu | 50.000 satır | Kilit süresi kısa kalsın |

**Serverless kullanma.** Vercel'de fonksiyon 60 saniyede kesilir; 14 dakikalık gönderim için normal sunucu (VPS/Docker) gerekir. Kuyruk sayesinde yarıda kalsa bildirim kaybolmaz ama tek seferde bitmesi daha temiz.

---

## 13. HIZLI TANI

```sql
-- Tüm admin fonksiyonları ve yetkileri
select p.proname, has_function_privilege('service_role', p.oid, 'execute') as yetki
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname like 'admin_%'
order by 1;

-- Tetikleyiciler
select c.relname as tablo, t.tgname,
       case when t.tgtype & 1 = 1 then 'ROW' else 'STATEMENT' end as seviye
from pg_trigger t join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal order by 1, 2;

-- Kuyruk
select admin_queue_status();

-- Zamanlanmış işler
select jobname, schedule, active from cron.job order by jobname;

-- Eklentiler
select extname from pg_extension where extname in ('pg_net','pg_cron');
```

---

## 14. MAİL SİSTEMİ

### Mimari

```
GİDEN:
  Tetikleyici/panel → mail_queue (pending)
        ↓
  drainMailQueue()  ← /api/mail/drain veya push dispatch'e bindirilmiş
        ↓
  SMTP / Resend / Postmark / SendGrid
        ↓
  mail_queue.status = sent | failed

GELEN:
  Sağlayıcı → POST /api/mail/inbound?secret=...
        ↓
  mails tablosu
        ↓
  trg_mail_match → mail_match_sender() → matched_user_id
```

★ **IMAP kullanılmıyor.** IMAP kalıcı TCP bağlantısı ister; Next.js request/response modelinde çalışmaz. Üretimde doğru yöntem sağlayıcının inbound webhook'u. Kurulum: sağlayıcı panelinde `https://<panel>/api/mail/inbound?secret=<inbound_secret>` adresini tanımla.

★ **Kuyruk neden var:** tetikleyicinin içinde SMTP beklemek kullanıcı kaydını/girişini yavaşlatır. Kuyruğa yazmak mikrosaniye sürer.

### Tablolar

| Tablo | İçerik |
|---|---|
| `mail_settings` | Sunucu bilgileri, şablon, imza, inbound secret (RLS tamamen kapalı) |
| `mail_templates` | 11 sistem şablonu (güvenlik + reklam) |
| `mail_queue` | Giden kuyruk ve geçmiş |
| `mails` | Gelen kutusu + eşleştirme sonucu |

### Fonksiyonlar

| Fonksiyon | Ne yapar |
|---|---|
| `mail_enqueue(...)` | Ham mail kuyruğa |
| `mail_enqueue_template(key, user, vars)` | Şablondan mail; `{{ad}}` otomatik |
| `admin_claim_mail_batch(n)` | `FOR UPDATE SKIP LOCKED` ile atomik çekme |
| `admin_mark_mail(id, ok, err)` | Sonucu işaretler; 3 denemede `failed` |
| `mail_recover_stuck(dk)` | Takılı `sending` satırları geri alır |
| `mail_match_sender(email, ad)` | **Gönderen → kullanıcı eşleştirme** |
| `admin_list_mails(filtre, q, ...)` | Gelen kutusu |
| `admin_mail_detail(id)` | Detay + geçmiş + o kişiye gönderdiklerimiz |
| `admin_save_mail_settings(patch)` | Ayar; **boş şifre eskisini korur** |

### ★ Gönderen eşleştirme puanlaması

| Puan | Kural |
|---|---|
| 100 | `profiles.email` birebir |
| 95 | `auth.users.email` birebir |
| 70 | E-posta kullanıcı adı = `profiles.username` |
| 55 | Gönderen adı = `profiles.name` |
| 40 | İsim kısmi benzerlik |

40 altında öneri verilmiyor. Panel puana göre "Kesin / Yüksek / Orta / Düşük eşleşme" etiketi gösteriyor.

### Güvenlik mailleri

`trg_security_mail` — `auth.users` üzerinde `AFTER UPDATE`:

| Değişen alan | Şablon |
|---|---|
| `encrypted_password` | `security_password` |
| `email` | `security_email` |
| `phone` | `security_phone` |
| `last_sign_in_at` | `security_login` (cihaz + IP ile) |

★ Tüm gövde `exception when others then` ile sarılı — **mail hatası auth işlemini bozmaz**. Supabase'de `auth.users` üzerine trigger yetkisi yoksa migration bunu notice olarak söylüyor ve atlıyor.

### Reklam mailleri

| Tetikleyici / iş | Şablon |
|---|---|
| `trg_ad_status_mail` (active) | `ad_approved` |
| `trg_ad_status_mail` (rejected) | `ad_rejected` |
| `trg_ad_status_mail` (expired) | `ad_expired` |
| `ad_send_reminders()` cron 09:00 | `ad_expiring_7d`, `ad_expiring_1d`, `boost_expiring_1d` |
| `trg_boost_status_mail` | `boost_approved` |

`notified_7d` / `notified_1d` bayrakları aynı mailin iki kez gitmesini engelliyor.

---

## 15. MEDYA KÜTÜPHANESİ VE STORAGE TEMİZLİĞİ

| Nesne | Açıklama |
|---|---|
| `media_library` | Üst veri (etiket, açıklama, boyut). Dosyalar `medya` bucket'ında |
| `admin_list_media(...)`, `admin_media_stats()` | Panel |
| `storage_cleanup_queue` | **Silinecek dosya yolları** |
| `storage_parse_url(url)` | URL'den bucket + yol çıkarır |
| `storage_enqueue_delete(url, sebep)` | Kuyruğa ekler |
| `drainStorageCleanup()` | Panel worker'ı — dosyaları Storage'dan siler |

### ★ Neden kuyruk

SQL, Supabase Storage'a erişemez. Reklam görseli değiştiğinde/kampanya silindiğinde tetikleyici **silinecek yolu kuyruğa yazıyor**, panel worker'ı gerçek silmeyi yapıyor. Bu olmadan Storage'da kimsenin kullanmadığı dosyalar birikirdi.

Tetikleyiciler:
- `trg_ad_media_cleanup_upd` — `image_url`/`logo_url` değişince eskisini kuyruğa
- `trg_ad_media_cleanup_del` — kampanya silinince ikisini de
- `trg_media_cleanup` — kütüphaneden silinince dosyayı

### Dosya adlandırma

`<slug>-<YYYYAAGG>-<6 karakter>.<uzantı>` → `yaz-kampanyasi-20260801-k4p1x2.jpg`
Aynı dosyayı iki kez yüklesen bile çakışma olmuyor.

---

## 16. GÜNCEL SQL SIRASI

```
15. panel_v4_1_push_olcek.sql       push ölçeklendirme + temizlik
16. panel_v4_2_reklam.sql           reklam + boost
17. panel_v4_3_politika_icerik.sql  politikalar + içerik + rol
18. panel_v4_4_mail_medya.sql       mail + güvenlik mailleri + medya
```

### Yeni ortam değişkenleri

```env
SUPABASE_LIBRARY_BUCKET=medya       # medya galerisi
NEXT_PUBLIC_PANEL_URL=https://...   # webhook adresi gösterimi
```

### Gerekli bucket'lar

| Bucket | Kullanım | Erişim |
|---|---|---|
| `media` | Profil avatar/arka plan | public |
| `medya` | Medya galerisi | public |
| `reklam` | Reklam görselleri | public |
