# Mağaza rozetleri + tıklanabilir kartlar

## 1. Mağaza düğmeleri gerçek logolarla ✅

Şablonun altında App Store ve Google Play rozetleri artık **gerçek
logo görselleriyle** basılıyor:

```
┌─────────────────────────────────────┐
│         Uygulamayı indir            │
│                                     │
│   [ App Store ]  [ Google Play ]    │
└─────────────────────────────────────┘
```

| Görsel | Adres |
|---|---|
| Logo — aydınlık | `…/kays-20260803-0nfgkh.png` |
| Logo — karanlık | `…/kays1-20260803-91s4m6.png` |
| Apple ikonu | `…/aplle-logo-20260803-aomaxx.png` |
| Play ikonu | `…/playstore-logo-20260803-6hb9lc.webp` |

★ Beyaz logo + koyu zemin (#1c1c1e): tek görsel iki temada da okunuyor,
tema başına ayrı ikon gerekmiyor.

★ Boyut hem `width`/`height` özniteliğiyle **hem** CSS ile veriliyor —
Outlook satır içi CSS'teki boyutu yok sayabiliyor.

### ⚠️ Play ikonu `.webp`

Verdiğin Play Store ikonu `.webp` formatında. Bunu bilmen gerek:

| İstemci | WebP |
|---|---|
| Apple Mail, iOS Mail | ✓ |
| Gmail (web, Android) | ✓ |
| **Outlook masaüstü** | ✗ görünmez |
| **Outlook 2016/2019** | ✗ görünmez |

Outlook kullanıcılarında Play düğmesinin ikonu boş çıkar — yazı görünür,
düğme çalışır ama logo gelmez.

**Önerim:** aynı görseli PNG olarak da yükleyip adresi onunla
değiştirmen. Tek satır değişiyor:

```ts
// src/lib/mail-sablon.ts
export const MAGAZA_IKON = {
  apple: `${DEPO}/aplle-logo-20260803-aomaxx.png`,
  play:  `${DEPO}/playstore-logo-….png`,   // ← webp yerine png
}
```

### Adresler panelden

Rozetlerin gideceği adres **Ayarlar → Mail → Marka ve mağaza**'dan
geliyor:

- App Store adresi
- Play Store adresi

Boş bırakırsan o düğme mailde **hiç görünmüyor** — çalışmayan bağlantı
göstermek kötü.

SQL'de doldurmak istersen:
```sql
update mail_settings set
  app_store_url  = 'https://apps.apple.com/tr/app/...',
  play_store_url = 'https://play.google.com/store/apps/details?id=...'
where id = 1;
```

## 2. Reklam kartları tamamen tıklanabilir ✅

"Detay" düğmesi kaldırıldı. Kartın herhangi bir yerine tıklamak detaya
götürüyor.

**Nasıl yapıldı:** görünmez bir bağlantı katmanı kartın üstüne
yayılıyor (`absolute inset-0 z-0`). Onay/red düğmeleri ve kullanıcı
bağlantısı `relative z-10` ile üstte kalıyor — onlara tıklamak detaya
**götürmüyor**.

> Tüm kartı `<Link>` içine sarmak geçersiz HTML üretirdi: `<a>` içine
> `<button>` konulamaz.

Başlık da ayrı bağlantı olmaktan çıktı — kart zaten tıklanabilir,
iç içe `<a>` hem gereksiz hem kafa karıştırıcıydı. Üstüne gelince
başlık vurgulanıyor.

## 3. Boost kartları tıklanabilir ✅

Aynı desen. Ayrıca **gerçek bir eksik kapandı:** "Görüntüle" düğmesi
sadece `pending` durumunda görünüyordu — yani **aktif bir boost'un
detayına ulaşmanın yolu yoktu.**

Artık her durumdaki boost'un detayı açılıyor.

### Boost detay sayfası — reklam detayıyla eşit

| Bölüm | Var |
|---|---|
| Durum · Aylık · Alan doluluğu · Kalan gün | ✓ |
| Gösterim · Tıklama · Tıklanma oranı | ✓ |
| Son 30 gün grafiği | ✓ |
| Öne çıkarılan içerik (görsel + başlık + kimlik) | ✓ |
| Seviye, süre, taban fiyat, tarihler | ✓ |
| Talep notu, red sebebi | ✓ |
| Talep sahibi kartı | ✓ |
| Teklif geçmişi | ✓ |
| **Düzenleme paneli** | ✓ |

---

## Denetim

```
✓ tsc --noEmit temiz
✓ next build başarılı
✓ SQL $$ blokları dengeli (8)
```

## Değişen dosyalar

```
src/lib/mail-sablon.ts             ♻️ gerçek logolar + MAGAZA_IKON
src/components/AdsManager.tsx      ♻️ kart tıklanabilir, Detay kalktı
src/components/BoostManager.tsx    ♻️ kart tıklanabilir, Görüntüle kalktı
sql/mail_sablon_magaza.sql         ♻️ varsayılan logo adresleri
```

## Kurulum

```bash
npm install && npm run build && npm start
```

SQL'i daha önce çalıştırdıysan tekrar çalıştırman gerekmiyor —
logo adresleri `coalesce(nullif(...))` ile yazılıyor, yani zaten
doluysa dokunmuyor. Değiştirmek istersen panelden gir.
