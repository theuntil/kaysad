# Reklam görselleri — kalıcı çözüm

## Neden sadece `reklam` bucket'ı?

Bu ayrıntı sorunu çözdü:

| Bucket | Durum |
|---|---|
| `galeri` | ✓ çalışıyor |
| `media` | ✓ çalışıyor |
| **`reklam`** | ✗ açılmıyor |

**Hiçbir RLS ya da CSP kuralı bucket ADINA göre davranmaz.** İkisi de
yol/köken bakar, kelime bakmaz. Ama reklam engelleyici eklentiler
kelime bakar:

```
https://db.site.com/storage/v1/object/public/reklam/image/x.png
                                             ^^^^^^
```

uBlock, AdBlock, Brave Shields ve Türkçe filtre listeleri "reklam",
"ads", "banner" geçen istekleri engelliyor.

Gözlemlediğin her şey buna uyuyor:

| Gözlem | Açıklama |
|---|---|
| Yükleme çalışıyor | Sunucu tarafı, tarayıcı karışmıyor |
| URL'i açınca görsel geliyor | Üst düzey gezinme — eklentiler engellemiyor |
| Sayfada açılmıyor | `<img>` isteği — eklenti engelliyor |
| Diğer bucket'lar çalışıyor | Adlarında tetikleyici kelime yok |
| "Sonradan oldu" | Eklenti güncellemesi ya da yeni filtre listesi |

`reklam_guvenlik.sql` bunun sebebi **değil** — o dosya depolamaya hiç
dokunmuyor, sadece `ad_campaigns`, `boost_requests` ve `ad_slots`
tablolarını değiştiriyor.

---

## Çözüm: görsel panel üzerinden geçiyor

Tarayıcı eklentisine bağımlı olmayan kalıcı çözüm.

**Önce:**
```
https://db.site.com/storage/v1/object/public/reklam/image/x.png
```

**Şimdi:**
```
https://kays.business/api/varlik/cmVrbGFtL2ltYWdlL3gucG5n
```

Yol base64url ile kodlanıyor — adreste "reklam" kelimesi kalmıyor.

Üç sorunu birden kapatıyor:

| Sorun | Nasıl çözülüyor |
|---|---|
| Reklam engelleyici | Adreste tetikleyici kelime yok |
| `Cross-Origin-Resource-Policy` | Aynı köken, çapraz istek yok |
| İç ağ adresi | Sunucu kendisi getiriyor |

### Güvenlik

Kodlama **gizlilik için değil** — sadece kelime saklamak için. Asıl
koruma başka yerde:

```ts
const IZINLI_BUCKETLAR = new Set(["reklam", "galeri", "media"])
```

- Sadece bu üç bucket okunabiliyor → **SSRF engellendi**, rastgele bir
  adrese yönlendirilemiyor
- `..` içeren yollar reddediliyor
- Yanıt `image/*` değilse geçirilmiyor → HTML yansıtma (XSS) engeli
- 25 MB tavan → bellek koruması
- `Cache-Control: immutable` → dosya adları benzersiz, sonsuza kadar
  önbelleklenebilir; ek yük yok

### Ne değişmedi

**Veritabanına kaydedilen adres aynı kalıyor.** Vekil sadece panel
gösteriminde devrede. Mobil uygulama doğrudan Supabase'den okumaya
devam ediyor — orada eklenti sorunu yok.

---

## Yapman gereken

```bash
npm install
npm run build
npm start
```

Başka hiçbir şey yok. SQL çalıştırma, `.env` değiştirme, ayar yapma —
gerek yok.

---

## Doğrulama

**1.** Reklam detay sayfasını aç — görsel gelmeli.

**2.** Görsele sağ tık → "Resim adresini kopyala". Şöyle olmalı:
```
https://kays.business/api/varlik/cmVrbGFt...
```

**3.** Emin olmak için: gizli sekmede de aç. İkisinde de çalışmalı.

---

## Hâlâ açılmıyorsa

**F12 → Network** sekmesini aç, sayfayı yenile, `/api/varlik/` ile
başlayan isteği bul:

| Durum | Anlamı |
|---|---|
| `200` ama görsel yok | Bana söyle — `content-type` ne? |
| `404` | Dosya Supabase'de yok |
| `403` | Bucket beyaz listede değil |
| `502` | Panel sunucusu Supabase'e ulaşamıyor |
| İstek hiç yok | Eklenti `/api/varlik/` yolunu da engelliyor (nadir) |
| `500` | `SUPABASE_URL` tanımlı değil |

---

## Değişen dosyalar

```
src/app/api/varlik/[anahtar]/route.ts  🆕 görsel vekili
src/lib/storage-url.ts                 ♻️ panelGorsel() eklendi
src/app/(dashboard)/reklamlar/[id]/page.tsx  ♻️ panelGorsel kullanıyor
src/components/AdEditPanel.tsx         ♻️ aynı
src/components/AdsManager.tsx          ♻️ aynı
src/components/BoostManager.tsx        ♻️ aynı
```
