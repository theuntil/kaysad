# V4 — Bu turda yapılanlar ve yapılmayanlar

## ✅ Tamamlanan

### 1. Push ölçeklendirme (1M kullanıcı)
- **Trigger `for each row` → `for each statement`.** Gerçek bir arızaydı: 500.000 satırlık INSERT'te 500.000 HTTP isteği kuyruğa atılıyordu. Artık INSERT başına 1 uyandırma.
- `admin_claim_push_batch` — **FOR UPDATE SKIP LOCKED** ile atomik çekme. İki panel örneği çift push atmıyor; yatay ölçeklendirme mümkün.
- `push_status = 'sending'` ara durumu + `admin_recover_stuck_push` (panel çökerse 5 dk sonra kurtarır).
- Debounce: aynı saniyede ikinci uyandırma yutuluyor.
- Kısmi indeks (`where push_status = 'pending'`) — 10M satırlık tabloda kuyruk taraması anlık.
- pg_cron: `push_drain` (dakikada bir), `push_recover` (5 dk).

### 2. Otomatik temizlik
- `cleanup_notifications(10, 10)` — 10 günden eski siler, **kişi başı son 10 korunur**.
- `cleanup_audit_log(30)`, `cleanup_push_log(7)`.
- Gece 04:00'te `run_maintenance` ile otomatik; `/push` sayfasından elle de çalıştırılıyor.
- Parçalı silme (50.000/tur) — tablo kilitlenmiyor.

### 3. Kuyruk temizleme butonu
`/push` → iki mod: **push'u iptal et** (bildirim uygulamada kalır) / **kuyruğu sil** (satırlar gider). Farkı onay penceresinde yazıyor.

### 4. Politikalar
`/politikalar` — 14 hazır politika, sürüm takibi (içerik değişince otomatik artar), yayın/taslak durumu. RLS: yayındakileri herkes okur, yazma sadece panel.

### 5. İşlem kaydı temizliği
Otomatik (30 gün) + `/push` sayfasında elle buton.

### 6. Popup
Logo URL alanı (başlığın üstünde gösteriliyor) + **zorunlu tip**: Sistem popup'ı / Reklam. Önizlemede ikisi de görünüyor.

### 7. Reklam sistemi (tam)
- 5 alan: anasayfa (10 kapasite), ilanlar/indirimler/etkinlikler/popup (1'er)
- 1/2/3 ay teklif; **alan doluysa yeni teklif en düşük aktif fiyattan yüksek olmak zorunda**
- Onay/red (sebepli), teklif geçmişi, kaçıncı teklif
- **Alan doluyken onaylanan reklam yayına alınmıyor** — `approved` bekliyor, panel "önce mevcut reklamı pasife al" diyor
- Pasife alma reklamı silmiyor
- Düzenleme onayı: aktif reklam içeriği doğrudan değişmiyor, eski→yeni karşılaştırmasıyla onaya düşüyor
- Gösterim/tıklama (günlük özet tablosu), günlük performans grafiği
- Yönlendirme: harici URL / kendi ilanı / etkinliği / indirimi / profili
- RLS: reklam veren kendi durumunu görüyor (Bekliyor, Onaylandı, Reddedildi, Aktif, Süresi doldu…)

### 8. Boost sistemi
İlan/indirim/etkinlik için `boost` (kendi şehri) ve `super_boost` (tüm şehirler). Aynı teklif mantığı, süre her zaman 1 ay, alan başına 2 kapasite. Onaylandığında içerik tablosundaki bayrak **otomatik** açılıyor (`boost_apply_flags`), süre dolunca iniyor.

### 9. Kullanıcı detayı
Rol değiştirme (user ↔ business) — `business_durum` tutarlılığı da düzeltiliyor ve kullanıcıya bildirim gidiyor.

### 10. İçerikler sayfası
`/icerikler` — gönderi/ilan/indirim/etkinlik sekmeleri, en yeni üstte, arama, sayfalama, kart görünümü, detay/düzenleme/silme.

### 11. SİSTEM_REHBERİ.md
354 satır: her fonksiyonun ne yaptığı, kimin çağırdığı, bozulduğunda nereye bakılacağı, SQL çalıştırma sırası, ölçek sınırları, hızlı tanı sorguları.

---

## ⏳ Bu turda yapılmayanlar

Dürüst olmak gerekirse aşağıdakiler tek turda "prod hazır" yazılamayacak kadar büyük. Yarım yazmak yerine ayırdım:

### Mail sistemi
**Neden ayrı bir iş:** gelen mailleri okumak IMAP gerektiriyor, IMAP kalıcı bağlantı ister — Next.js server action'ında yapılamaz. Doğru mimari: ayrı bir worker (Docker) IMAP'i dinler, mailleri bir `mails` tablosuna yazar, panel o tabloyu okur. Gönderim (SMTP/Resend) daha kolay ama zengin editör + şablon + AI eşleştirme kendi başına bir hafta.

Gerekenler: `mail_settings`, `mails`, `mail_templates` tabloları · IMAP worker · SMTP gönderim · editör · AI eşleştirme (gönderen → kullanıcı önerisi).

### Güvenlik mailleri
Mail altyapısına bağlı. Tetikleyiciler hazır yazılabilir ama gönderecek kanal olmadan anlamsız.

### Reklam bitiş mailleri
`ad_campaigns.notified_7d/1d/end` kolonları **hazır** — mail sistemi gelince tetikleyici yazmak kısa iş.

### Medya galerisi
`/medya` sayfası + `media` bucket listeleme. Orta büyüklükte, tek başına yapılabilir.

### Reklam medyası otomatik silme
Kampanya silinince/görsel değişince Storage'dan silme. `media.actions.ts`'teki `parseStorageUrl` deseni aynen kullanılabilir.

---

## Sonraki tur için öneri sırası
1. Medya galerisi + reklam medyası temizliği (küçük, hemen biter)
2. Mail gönderimi (SMTP) + şablon + kullanıcı detayında "Mail gönder" butonu
3. Güvenlik ve reklam bildirim mailleri (2 bitince tetikleyiciler kolay)
4. IMAP worker + gelen kutusu (en büyük parça, ayrı Docker servisi)
