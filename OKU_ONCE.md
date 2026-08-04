# Önce bunu oku — henüz hiçbir şey uygulamadan

## Önceki tavsiyemde iki hata vardı

**1. `img-src`'a `http:` eklemek işe yaramaz.**

Panelin `https://kays.business` üzerinde. HTTPS bir sayfada HTTP görsel
tarayıcı tarafından **karışık içerik** sayılıp engelleniyor. Bu CSP'den
bağımsız, **kapatılamayan** bir kural.

Yani kayıtlı görsel adresleri **mutlaka `https://` olmalı**. Başka yolu
yok.

**2. `supabase.rovand.cloud` adresini ben uydurdum.**

Sen böyle bir şey söylemedin. Aşağıdaki 1. adımda gerçek adresini
bulacağız.

---

## Adım 1 — Supabase'inin gerçek dış adresini bul

Panelin `.env` dosyasına bak:

```bash
grep SUPABASE_URL .env
```

Üç ihtimal var:

**a) Zaten https ve dış adres**
```env
SUPABASE_URL=https://db.siteniz.com
```
→ Sorun burada değil. **Adım 2'yi atla**, Adım 3'e geç.

**b) İç ağ adresi**
```env
SUPABASE_URL=http://kong:8000
SUPABASE_URL=http://supabase-kong:8000
SUPABASE_URL=http://10.0.0.5:8000
```
→ Supabase'ine **dışarıdan** hangi adresle giriyorsun? Supabase Studio'yu
açtığın adres bu. Onu not al.

**c) `.env` yok / farklı yerde**
```bash
docker compose config | grep -i supabase_url
```

---

## Adım 2 — Kayıtlı adresleri kontrol et

Supabase SQL Editor'de çalıştır:

```sql
with adresler as (
  select image_url as u from ad_campaigns where image_url is not null
  union all
  select logo_url from ad_campaigns where logo_url is not null
)
select
  substring(u from '^https?://[^/]+') as kok,
  count(*) as adet
from adresler
group by 1
order by 2 desc;
```

Çıktı örneği:
```
kok                     adet
http://kong:8000          47     ← sorun bu
https://db.siteniz.com     3
```

**Bu çıktıyı bana at.** Kesin çözümü ona göre veririm.

> ⚠️ Bu bir **sorgu**. Çıktısını tekrar SQL'e yapıştırma — geçen sefer
> aldığın `syntax error at or near "https"` hatası ondandı. Çıktı sadece
> okumak için.

---

## Adım 3 — Hızlı test

Kayıtlı bir görselin tam adresini al:

```sql
select image_url from ad_campaigns
where image_url is not null
limit 1;
```

Çıktıyı **tarayıcının adres çubuğuna** yapıştır.

| Sonuç | Anlamı |
|---|---|
| Görsel açıldı | Adres doğru — sorun başka yerde, bana söyle |
| "Bu siteye ulaşılamıyor" | İç ağ adresi — Adım 1b'deki dış adres gerekli |
| `{"error":"..."}` | Bucket herkese açık değil → `depolama_erisim.sql` |
| Adres `http://` ile başlıyor | Karışık içerik — https'e çevrilmeli |

---

## Şimdilik ne yapabilirsin

Paketteki değişiklikler **zararsız ve geriye dönük uyumlu**:

| Değişiklik | Riski |
|---|---|
| `adresiDuzelt()` gösterimde | Yok — adres zaten doğruysa dokunmuyor |
| CSP `connect-src` genişletildi | Yok — imzalı yükleme artık engellenmiyor |
| CSP `frame-src` eklendi | Yok — mail iframe'i için gerekli |
| Depolama tanısı paneli | Yok — sadece okuyor |
| Reklam düzenleme paneli | Yok |
| Boost detay + düzenleme | Yok |
| Mail tam sayfa + toplu seçim | Yok |

**SQL dosyalarını henüz çalıştırma.** Önce Adım 2'nin çıktısını gör.

Paneli kurup **Ayarlar → Depolama tanısı → Kontrol et**'e basarsan zaten
sana durumu söyleyecek — Adım 1 ve 2'yi kendisi yapıyor.

---

## Özet

Sorun neredeyse kesin şu: **veritabanındaki görsel adresleri iç ağ
adresi ya da http.** Panel sunucusu onlara erişiyor (yükleme çalışıyor),
tarayıcın erişemiyor (görsel açılmıyor).

Çözüm iki parça:
1. Yeni yüklemeler doğru adresle kaydedilsin → `SUPABASE_PUBLIC_URL`
2. Eski kayıtlar düzelsin → `adres_duzelt.sql`

Ama önce gerçek adresini bilmem lazım.
