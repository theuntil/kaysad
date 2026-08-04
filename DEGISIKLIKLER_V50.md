# Panel — Reklam Önizleme + Mail Geliştirmeleri

## 1. Reklam görsel önizlemesi ✅

Yükleme çalışıyordu ama önizleme boş kalıyordu ve sorunun nerede
olduğu anlaşılmıyordu.

**Yeni `GorselOnizleme` bileşeni:**

| Durum | Ne gösteriyor |
|---|---|
| Yükleniyor | Spinner + "Yükleniyor…" |
| Görsel yok | "Görsel yok" |
| Yüklendi | Görselin kendisi |
| **Açılamadı** | "Görsel açılamadı — dosya yüklendi ama gösterilemiyor. Bucket herkese açık olmayabilir." **+ URL** |

`onError` yakalayıcısı sayesinde artık sessizce boş kalmıyor. Sorun
çıkarsa **URL ekranda görünüyor** — tarayıcıda açıp test edebilirsin.

★ URL değişince hata durumu sıfırlanıyor; yeni görsel yüklediğinde eski
hata takılı kalmıyor.

**Sorun devam ederse** kontrol et:
```sql
select id, public from storage.buckets where id = 'reklam';
```
`public = true` olmalı. Değilse:
```sql
update storage.buckets set public = true where id = 'reklam';
```

## 2. Mail detayı tam sayfa ✅

**Eskiden:** modal içinde açılıyordu — çift kaydırma çubuğu çıkıyor,
uzun mailler sıkışıyordu.

**Şimdi:** liste yerini detaya bırakıyor, mail tüm genişliği ve
yüksekliği kullanıyor. Üstte "← Gelen kutusu" düğmesi.

Düzen:
```
← Gelen kutusu   [Yıldızla] [Arşivle]      [Yanıtla] [Sil]

┌─────────────────────────────────────────┐
│ Konu (19pt bold)                        │
│ Gönderen · Tarih · Alıcı                │
│ [Yıldızlı] [Arşivlendi]                 │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ Eşleşen kullanıcı                       │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ Mail gövdesi (yalıtılmış iframe)        │
└─────────────────────────────────────────┘
```

## 3. Tümünü seç ✅

Toplu işlem çubuğu artık **her zaman görünür** (liste boş değilse).
Eskiden sadece seçim varken çıkıyordu — toplu seçmenin yolu yoktu.

- Üç durumlu kutu: boş · **kısmi** (indeterminate) · dolu
- Seçim varsa "N mail seçili", yoksa "Tümünü seç"

## 4. Açık mailde yıldız ve arşiv ✅

Detay ekranının üst çubuğunda:

| Düğme | Davranış |
|---|---|
| Yıldızla / Yıldızı kaldır | Duruma göre metin ve renk değişiyor |
| Arşivle / Arşivden çıkar | Aynı şekilde |

★ `isaretle()` artık **yerel durumu da** güncelliyor — sayfa yenilenene
kadar düğme eski hâlinde kalmıyor.

### Toplu yıldız/arşiv de eklendi

Seçim çubuğunda "Yıldızla" ve "Arşivle" düğmeleri. `Promise.all` ile
paralel gidiyor; 50 mail seçilse de birkaç yüz milisaniyede bitiyor.

---

## Denetim

```
✓ tsc --noEmit temiz
✓ next build başarılı
✓ dangerouslySetInnerHTML yok
✓ Eski modal bloğu kaldırıldı (ulaşılamaz kod)
✓ Kullanılmayan import yok
```

## Değişen dosyalar

```
src/components/AdEditPanel.tsx    ♻️ GorselOnizleme eklendi
src/components/MailInbox.tsx      ♻️ tam sayfa detay + toplu seçim + aksiyonlar
```
