# Bu turda düzeltilenler

## 1. "Sunucuda parola doğrulaması yapılandırılmamış" ✅

Bakım modu `process.env.ADMIN_PASSWORD_HASH` okuyordu. Ama senin panelinde
parola **`ADMIN_PASSWORD_HASH_B64`** (base64) olarak tutuluyor — bcrypt
hash'indeki `$` işaretleri `.env` dosyasında bozulduğu için proje bilerek
böyle kurulmuş.

Artık giriş ekranıyla **aynı okuyucuyu** (`getAdminPasswordHash()`) kullanıyor.
İki yerde ayrı mantık tutmak zaten hataydı.

## 2. Medya yükleme "ağ hatası" ✅

`createSignedUploadAction` başarılı dönüyordu (loglarında görünüyor), sonra
tarayıcı doğrudan Storage'a yüklemeye çalışırken patlıyordu.

**Sebep:** Supabase'i kendi sunucunda barındırıyorsun
(`supabase.rovand.cloud`). Ters vekil sunucun `PUT` isteği için CORS
başlıklarını iletmiyor, tarayıcı isteği reddediyor. XHR bunu ayırt edemediği
için "ağ hatası" diyor.

**Çözüm — iki aşamalı yükleme:**

```
1. İmzalı URL denenir        → hızlı yol, sunucu bant genişliği harcamaz
       ↓ CORS'a takılırsa
2. /api/upload'a düşülür     → aynı kaynak, CORS devreye girmez
```

`/api/upload` bir **Route Handler**; Server Action'daki 1 MB gövde sınırı
burada yok. `maxDuration = 300` ile büyük video da yükleniyor. Kullanıcı farkı
görmüyor, sadece yükleniyor.

Üç yerde de aktif: medya galerisi, içerik medyası, reklam görseli.

## 3. Reklam anahtarı gerçekten çalışıyor ✅

Dürüst olmam gerekirse: **çalışmıyordu.** Anahtar sadece
`app_config.ads_service` alanına yazıyordu, hiçbir yer onu okumuyordu. RLS
politikası `status = 'active'` diyordu, anahtara bakmıyordu.

`panel_v4_8_reklam_anahtari.sql` bunu düzeltiyor:

| Ne | Nasıl |
|---|---|
| RLS politikası | Artık `ads_service` ve `maintenance` kontrol ediyor — **kapalıyken tablo boş görünüyor** |
| `get_active_ads()` | Mobilin kullanacağı fonksiyon; kapalıyken boş liste + sebep |
| `ad_track()` | Kapalıyken sayaç işlemiyor (yanlış rapor vermesin) |
| `boost_apply_flags()` | Kapalıyken boost bayrakları iniyor |
| Tetikleyici | Anahtar değişince boost bayrakları anında tazeleniyor |

★ **Mobil tarafta kod değişikliği gerekmiyor** — RLS seviyesinde engellendiği
için uygulama ne yaparsa yapsın reklam göremiyor.

Dosyanın sonunda **canlı test** var: anahtarı kapatıyor, boş döndüğünü
gösteriyor, geri açıyor.

## 4. "Yeni kayıt" anahtarı da çalışmıyordu ✅

Aynı sorun. Artık `auth.users` üzerinde `BEFORE INSERT` tetikleyicisi var:
kapalıyken yeni kayıt engelleniyor, **mevcut kullanıcılar etkilenmiyor**.

Mobil için `can_register()` fonksiyonu da eklendi — kayıt ekranını açmadan
önce sorup düzgün mesaj gösterebilirsin.

## 5. Öğrenci kutusu artık tıklanabilir ✅

Öğrenci durumunu kutudan açıp kapatabiliyorsun; diğer kimlik alanlarıyla
birlikte kaydediliyor.

**"Erişim" kutusunu kaldırdım.** Ban durumunu gösteriyordu ama tıklanamıyordu —
kafa karıştırıcıydı. Ban zaten sayfa başındaki kırmızı düğmeden yönetiliyor,
iki yerde göstermenin anlamı yok.

## 6. "Listeye dön" sol üstte ✅

`PageHeader` bileşenine `back` özelliği eklendi. Geri bağlantısı artık
başlığın **sol üstünde**, sağdaki işlem düğmelerinden ayrı. Altı detay
sayfasında da uygulandı: kullanıcı, reklam, şikâyet, cihaz, şehir, gönderim.

Mantık olarak da doğrusu bu: geri gitmek bir "işlem" değil, gezinme.

---

## Çalıştırma

```
1. KAYS_GUNCELLEME_v45_v46_v47.sql     (henüz çalıştırmadıysan)
2. panel_v4_8_reklam_anahtari.sql      ← YENİ
```

Sonra panelde:

```bash
npm install
npm run build
npm start
```

## Test

```sql
-- Reklam anahtarı çalışıyor mu?
update app_config set ads_service = false where id = 1;
select json_array_length(get_active_ads(null)->'ads');   -- 0 dönmeli
update app_config set ads_service = true where id = 1;
select json_array_length(get_active_ads(null)->'ads');   -- eski sayı

-- Kayıt anahtarı
select can_register();
```

Panelde:
- Ayarlar → Bakıma al → parolanı gir (artık çalışıyor)
- Medya → dosya yükle (büyük video dahil)
- Kullanıcı detayı → Öğrenci kutusuna tıkla → Kaydet
