# "URL'den açılıyor ama panelden görünmüyor" — çözüm

## Sebep

Sen tarayıcıda **doğru adresi elle yazıp** açıyorsun. Ama veritabanında
**kayıtlı olan adres farklı**:

```
Kayıtlı:  http://kong:8000/storage/v1/object/public/reklam/...   ← erişilemez
Senin:    https://supabase.rovand.cloud/storage/v1/object/...    ← çalışıyor
```

Yükleme sırasında adres `SUPABASE_URL`'den üretiliyordu — o da iç ağ
adresi. Panel sunucusu erişiyor (yükleme çalışıyor), tarayıcı erişemiyor.

**Üstüne bir de CSP engeli vardı:**

```
img-src 'self' data: https:     ← http: YOK
```

Kayıtlı adres `http://` olduğu için tarayıcı zaten engelliyordu. Çift
engel — bu yüzden hiçbir hata görünmüyordu.

---

## SQL hatan

```
ERROR: 42601: syntax error at or near "https"
```

Bu benim SQL'imin hatası değil — sorgunun **çıktısını** kopyalayıp
tekrar çalıştırmışsın. O satır bir sonuç, komut değil:

```sql
select 'https://SENIN-ADRESIN/storage/...' || name as ornek_url ...
```

Çıktıdaki URL'i **tarayıcıya** yapıştırman gerekiyordu, SQL editörüne
değil. Yanlış anlaşılmaya açık yazmışım.

---

## Yapılacaklar — sırayla

### 1. `.env`'e ekle

```env
SUPABASE_URL=http://kong:8000                     # var olan, dokunma
SUPABASE_PUBLIC_URL=https://supabase.rovand.cloud # ★ YENİ
```

Bundan sonra **yeni** yüklemeler doğru adresle kaydedilecek.

### 2. Eski kayıtları düzelt

`sql/adres_duzelt.sql`

Üç adım:

**a)** İlk sorguyu çalıştır — hangi kökler kayıtlı, gör:
```
kok                              adet
http://kong:8000                 47
https://supabase.rovand.cloud     3
```

**b)** Dosyadaki iki satırı kendi değerlerinle değiştir:
```sql
v_eski text := 'http://kong:8000';
v_yeni text := 'https://supabase.rovand.cloud';
```

**c)** `do $$ ... $$;` bloğunu çalıştır. Kaç kayıt düzeldiğini
`notice` olarak yazıyor.

★ `where ... like` koşulu var — sadece yanlış kökle başlayanlar
değişiyor, doğru olanlara dokunulmuyor.

★ `popups`, `media_library`, `profiles` tabloları da düzeltiliyor;
yoksa sessizce atlanıyor.

### 3. Paneli yeniden derle

```bash
npm run build && npm start
```

---

## Panel tarafında ne değişti

**a) Gösterim anında düzeltme**

`adresiDuzelt()` artık gerçekten uygulanıyor — reklam detay sayfasında
ve düzenleme panelinde. SQL'i çalıştırmasan bile **panelde** görseller
açılır.

> Ama SQL'i yine de çalıştır: mobil uygulama kayıtlı adresi olduğu gibi
> kullanıyor, orada düzeltme yapmıyor.

**b) CSP düzeltildi**

```diff
- "img-src 'self' data: https:"
+ "img-src 'self' data: blob: https: http:"

- "connect-src 'self' https://*.supabase.co"
+ "connect-src 'self' https: http:"

+ "frame-src 'self' blob: data:"
+ "media-src 'self' data: blob: https: http:"
```

| Değişiklik | Neden |
|---|---|
| `img-src` + `http:` | Kendi sunucusundaki depolama http olabiliyor |
| `connect-src` genişletildi | `*.supabase.co` senin alan adını kapsamıyordu — imzalı yükleme engellenip sessizce sunucu vekiline düşüyordu (yavaş) |
| `frame-src` eklendi | Mail gövdesi sandbox iframe'de; tanımsızsa `default-src 'self'`e düşüp bazı tarayıcılarda engelleniyor |

---

## Kontrol

**Ayarlar → Depolama tanısı → Kontrol et**

- "Sunucu adresi" ve "Genel adres" farklı görünmeli (doğru kurulum)
- Her bucket "herkese açık" olmalı
- **Örnek dosya testi** "açıldı" demeli

Hâlâ "açılamadı" diyorsa URL tıklanabilir — aç ve ham hatayı gör.

---

## Değişen dosyalar

```
next.config.mjs                       ♻️ CSP
src/app/(dashboard)/reklamlar/[id]/page.tsx  ♻️ adresiDuzelt uygulandı
src/components/AdEditPanel.tsx        ♻️ adresiDuzelt uygulandı
sql/adres_duzelt.sql                  🆕 eski kayıtları düzelt
sql/depolama_erisim.sql               🆕 bucket erişimi
src/lib/storage-url.ts                🆕 genelAdres · adresiDuzelt
src/components/StorageDiagnostics.tsx 🆕 tanı paneli
```
