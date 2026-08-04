# Mağaza bağlantıları + karanlık logo

## 🔴 1. Karanlık logo neden kırıktı

İlk yazdığım SQL `logo_dark_url` alanına şunu koymuştu:

```
https://kays.business/kays1.png     ← böyle bir dosya YOK
```

Sonraki sürümde doğru adresi yazdım ama `coalesce(nullif(...))`
kullanıyordu — **alan zaten dolu olduğu için üzerine yazmadı.**
Karanlık modda logo kırık geliyordu.

### Düzeltme

`sql/mail_logo_magaza_duzelt.sql` **koşulsuz** yazıyor:

```sql
update mail_settings set
  logo_light_url = '…/kays-20260803-0nfgkh.png',
  logo_dark_url  = '…/kays1-20260803-91s4m6.png'
where id = 1;
```

## 🔴 2. Mağaza bağlantıları artık `app_config`'ten

Haklıydın — rozetler `mail_settings.app_store_url` okuyordu, orası
boştu ve site adresine düşüyordu.

```diff
- mail_settings.app_store_url    → App Store rozeti
- mail_settings.play_store_url   → Play rozeti
+ app_config.ios_store_url       → App Store rozeti
+ app_config.android_store_url   → Play rozeti
```

★ Mağaza adresi uygulamanın kendi ayarı. `mail_settings` içinde ikinci
bir kopya tutmak kaçınılmaz olarak ikisinin ayrışmasına yol açıyordu —
birini güncelleyip diğerini unutmak çok kolay.

★ Mail ayarları panelinden o iki alan **kaldırıldı**, yerine not
konuldu: "Mağaza adresleri Uygulama ayarlarından alınıyor."

★ `mail_settings.app_store_url` / `play_store_url` kolonları duruyor
ama artık okunmuyor; SQL onları `null` yapıyor ki "hangisi geçerli?"
karışıklığı olmasın.

## 3. "Yükle" düğmesi → indirme sayfası

```
Yükle  →  https://kays.com.tr/indir
```

Mağazaya değil indirme sayfasına gidiyor. Mail alan kişinin cihazı
bilinmiyor; indirme sayfası doğru mağazaya kendisi yönlendiriyor.

★ Mağaza adresleri tanımlı değilse rozetler de indirme sayfasına
düşüyor — site anasayfasına değil. Mağaza rozetine basıp anasayfaya
düşmek kafa karıştırıcı.

---

## Doğrulama testi

```
═══ 1. app_config DOLU ═══
  App Store rozeti → ✓ ios_store_url
  Play rozeti      → ✓ android_store_url
  Yükle düğmesi    → ✓ indirme sayfası
  kays.business    → ✓ yok

═══ 2. app_config BOŞ ═══
  Rozet hedefleri: ["…/indir", "…/indir", "…/indir"]
  İndirme sayfasına düşüyor: ✓

═══ 3. Yükle düğmesi hedefi ═══
  → https://kays.com.tr/indir ✓

═══ 4. Karanlık logo ═══
  kays1 (beyaz) var: ✓
  ki-koyu sarmalayıcı: ✓
```

---

## Kurulum — sırayla

**1.** SQL çalıştır:
```
sql/mail_logo_magaza_duzelt.sql
```

**2.** ⚠️ Dosyadaki şu iki satırı **kendi adreslerinle değiştir**:

```sql
update app_config set
  ios_store_url     = 'https://apps.apple.com/tr/app/kays/idXXXXXXXXX',
  android_store_url = 'https://play.google.com/store/apps/details?id=com.kays.app'
where id = 1;
```

Yer tutucu adresler yazılı — olduğu gibi çalıştırırsan rozetler
çalışmayan bir bağlantıya gider.

**3.** Panel:
```bash
npm install && npm run build && npm start
```

**4.** Doğrulama sorgusunun çıktısı:
```
aydinlik_logo : DOGRU
karanlik_logo : DOGRU
sablon        : BOS (guncel varsayilan kullanilacak)
```

---

## Değişen dosyalar

```
src/lib/mail-sablon.ts             ♻️ ios/android_store_url + indirUrl
src/actions/mail.actions.ts        ♻️ sablonKaynagi() — app_config okuyor
src/components/MailSettingsPanel.tsx ♻️ mağaza alanları kaldırıldı
sql/mail_logo_magaza_duzelt.sql    🆕
```
