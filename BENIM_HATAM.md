# Sorunun sebebi benim eklediğim koddu

## Ne oldu

Geçen turda `adresiDuzelt()` diye bir fonksiyon yazdım ve **sadece
reklam bölümüne** bağladım. Mantığı şuydu:

```ts
const kok = genelKok()            // SUPABASE_PUBLIC_URL || SUPABASE_URL
if (u.startsWith(kok)) return u
return kok + u.slice(u.indexOf("/storage/v1/"))   // ← yeniden yaz
```

Sende `SUPABASE_PUBLIC_URL` tanımlı değil. O yüzden `genelKok()` iç
adrese düşüyor ve fonksiyon **tam tersini** yapıyordu:

```
Veritabanında kayıtlı:  https://supabase.rovand.cloud/storage/...  ← çalışıyor
Fonksiyondan çıkan:     http://kong:8000/storage/...               ← bozuk
```

Yani **çalışan adresi bozuyordu.**

## Neden sadece reklam bölümü etkilendi

`adresiDuzelt()`'i yalnızca iki yere bağlamıştım:
- Reklam detay sayfası
- Reklam düzenleme paneli

Galeri, medya, profil görselleri bu fonksiyondan geçmiyor — o yüzden
sorunsuz çalışıyorlardı. Senin gözlemin ("reklam kısmı dışında her yer
çalışıyor") tam olarak bunu gösteriyordu.

## Tanı aracı da yanlış ölçüyordu

Depolama tanısı örnek adresleri `genelAdres()` ile **kendisi
üretiyordu** — o da aynı iç adrese düşüyordu. Bu yüzden `galeri` de
"açılamadı" diyordu, oysa galeri gerçekte çalışıyor.

Test yanlış şeyi ölçüyordu.

---

## Düzeltmeler

### 1. `adresiDuzelt()` artık çok muhafazakâr

Yeniden yazma için **üç koşulun hepsi** gerekiyor:

1. `SUPABASE_PUBLIC_URL` **açıkça** tanımlanmış (varsayılana düşmüş
   değil — niyet belli olmalı)
2. Adresin kökü tam olarak `SUPABASE_URL`'e eşit (yani gerçekten
   bilinen iç adres)
3. İkisi birbirinden farklı

Tereddüt varsa adrese **dokunmuyor**.

> Çalışan bir adresi bozmak, bozuk bir adresi düzeltmemekten çok daha
> kötü. İlk sürüm bu dengeyi yanlış kurmuştu.

Doğrulama testi:

| Senaryo | Sonuç |
|---|---|
| `SUPABASE_PUBLIC_URL` yok (senin durumun) | ✓ dokunmadı |
| `SUPABASE_PUBLIC_URL` yok, adres zaten dış | ✓ dokunmadı |
| `SUPABASE_PUBLIC_URL` var, kayıtlı adres doğru | ✓ dokunmadı |
| `SUPABASE_PUBLIC_URL` var, kayıtlı adres iç ağ | ✓ düzeltti |

### 2. Tanı aracı gerçek adresleri kullanıyor

Artık adres üretmiyor — **veritabanında kayıtlı** gerçek adresi
okuyor:

| Bucket | Kaynak |
|---|---|
| `reklam` | `ad_campaigns.image_url` / `logo_url` |
| `media` | `profiles.avatar_url` |
| `galeri` | `media_library.url` |

Uygulamanın gerçekten kullandığı adres bu; test edilmesi gereken de bu.

---

## Sende ne yapman gerekiyor

**Sadece paneli güncelle ve yeniden derle.**

```bash
npm install
npm run build
npm start
```

Reklam görselleri düzelmeli.

### Yapman GEREKMEYENLER

| Dosya | Neden gerek yok |
|---|---|
| `adres_duzelt.sql` | Kayıtlı adreslerin **zaten doğru** — dokunma |
| `depolama_erisim.sql` | Bucket'lar zaten açık, diğer görseller çalışıyor |
| `SUPABASE_PUBLIC_URL` | `SUPABASE_URL`'in zaten dış adres, gerek yok |

Bunları önceki mesajlarımda önermiştim ama **senin kurulumun zaten
doğruymuş.** Sorun kodda değil ayarda sandım, yanılmışım.

---

## Değişen dosyalar

```
src/lib/storage-url.ts          ♻️ adresiDuzelt muhafazakâr yapıldı
src/actions/upload.actions.ts   ♻️ tanı gerçek adresleri okuyor
```

Diğer değişiklikler (reklam düzenleme paneli, boost detay sayfası, mail
tam sayfa görünümü, toplu seçim, yıldız/arşiv, CSP) olduğu gibi duruyor
ve etkilenmedi.
