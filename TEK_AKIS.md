# Tek akış + sade kartlar

Yanlış anlamışım — ayrı bir düğme yapmıştım. Düzelttim.

## 1. Tek oluşturma akışı ✅

**Önce:** Sekmeye göre değişen iki ayrı düğme
(`AdCreate` / `BoostCreate`)

**Şimdi:** Tek "Reklam ekle" düğmesi. Tür **formun en başında**
seçiliyor:

```
┌─ Yeni reklam ────────────────────────────────────┐
│                                                   │
│  Ne oluşturuyorsun?                               │
│  ┌──────────────────┬──────────────────────────┐ │
│  │ Reklam           │ Öne Çıkarma              │ │
│  │ Kendi görseliyle │ Mevcut içeriği üste taşı │ │
│  └──────────────────┴──────────────────────────┘ │
│                                                   │
│  Kullanıcı            [ara…]                      │
│                                                   │
│  ── seçime göre değişen alanlar ──                │
└───────────────────────────────────────────────────┘
```

Seçime göre form kendini ayarlıyor:

| Alan | Reklam | Öne Çıkarma |
|---|---|---|
| Kullanıcı | ✓ | ✓ |
| Reklam alanı | ✓ | — |
| İçerik seçici | — | ✓ (İlan/İndirim/Etkinlik) |
| Seviye | — | ✓ (Öne Çıkar / Süper) |
| Başlık, görsel, logo, adres | ✓ | — |
| Fiyat, süre, not | ✓ | ✓ |
| Hemen yayına al | ✓ | ✓ |

Boost'ta başlık ve görsel yok — bunlar kullanıcının kendi içeriğinden
geliyor. Ayrı alan koymak veriyi ikizler ve tutarsızlaştırırdı.

`BoostCreate.tsx` silindi. Tek dosya, tek akış.

## 2. Reklam kartları sadeleşti ✅

**Önceki hâlde** üç sütun, altı rozet ve iç içe kutular vardı; göz
nereye bakacağını bilemiyordu.

| | Önce | Sonra |
|---|---|---|
| Sütun | 3 | 2 |
| Rozet | 6'ya kadar | 1 (durum) |
| İç kutu | 2 | 0 |
| Görsel | 160×92 | 76×76 |

**Yeni düzen tek bir okuma çizgisi kuruyor:**

```
┌────┐  ● Yayında · Ana Sayfa · 3 gün önce      12.000 ₺
│    │  Yaz Kampanyası                          aylık · 3 ay
│gör │  @isletme · 24 gün kaldı · 1.2K gösterim
└────┘
        Düzenleme onayı bekliyor
        [Onayla] [Reddet] [Detay]
```

Ne değişti:

- **Alan adı rozet değil, düz metin** — durum rozeti tek başına
  kalınca gerçekten dikkat çekiyor
- **Fiyat kutusuz** — çerçeve olmadan da sağa yaslı ve kalın olduğu
  için ayrışıyor
- **Meta tek satırda** — kullanıcı, kalan gün, istatistik
- **Uyarılar sadece varsa** — düzenleme bekliyor, teklif sayısı, red
  sebebi. Yoksa hiç yer kaplamıyor.

★ Bilgi kaybı yok. Teklif sayısı ve düzenleme uyarısı rozetten metne
indi — daha az gürültü, aynı içerik.

## 3. Boost detay sayfası ✅

Zaten vardı, yerinde duruyor:
`/reklamlar/boost/[id]`

- Durum · Aylık · Alan doluluğu · Kalan gün
- Gösterim · Tıklama · Tıklanma oranı
- Son 30 gün grafiği
- Öne çıkarılan içerik kartı
- Talep sahibi
- Teklif geçmişi
- Teklif düzenleme

Öne Çıkanlar listesindeki **Görüntüle** düğmesinden açılıyor.

---

## Denetim

```
✓ tsc --noEmit temiz
✓ next build başarılı
✓ Kullanılmayan import/değişken yok
✓ BoostCreate.tsx silindi
```

## Değişen dosyalar

```
src/components/AdCreate.tsx           ♻️ tür seçimi + boost akışı
src/components/AdsManager.tsx         ♻️ kart sadeleştirildi
src/app/(dashboard)/reklamlar/page.tsx ♻️ tek düğme
src/components/BoostCreate.tsx        ✖️ silindi
```

## Kurulum

```bash
npm install && npm run build && npm start
```

Boost istatistiği için (henüz çalıştırmadıysan):
```
sql/boost_istatistik.sql
```
