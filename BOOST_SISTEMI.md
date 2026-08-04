# Manuel öne çıkarma + boost analitiği

## 1. Panelden boost verme ✅

`src/components/BoostCreate.tsx`

**Reklamlar → Öne Çıkanlar sekmesi → "Öne çıkarma ekle"**

Akış, `AdCreate` ile aynı düzende — dört adım:

```
1 — Kullanıcı        UserPicker ile ara (ad, e-posta, telefon, UUID)
2 — İçerik           İlan / İndirim / Etkinlik sekmesi
                     ↓
                     Kullanıcının kayıtları görselli kart olarak listeleniyor
                     Üstüne tıkla, seç
3 — Seviye           Öne Çıkar  ·  Süper Öne Çıkar
4 — Ücret ve süre    Aylık fiyat + 1/2/3 ay + not
                     [ ] Hemen yayına al
```

★ **UUID yazdırmıyoruz.** Kullanıcı seçilince onun içerikleri otomatik
geliyor. Panelde UUID kopyalayıp yapıştırmak hataya çok açık.

★ İçerik türü sekmesi değişince liste anında yenileniyor, seçim
temizleniyor.

### Sunucu tarafı denetimler

`createBoostAction` zaten vardı, arayüzü eksikti. Denetimleri:

| Kontrol | Davranış |
|---|---|
| İçerik seçilen kullanıcıya ait mi | Değilse reddediliyor |
| Aynı içerik zaten yayında mı | "Bekleyen ya da aktif öne çıkarma var" |
| Taban fiyat | Altındaysa reddediliyor (arayüzde de uyarı) |
| Süre 1–3 ay | Dışındaysa reddediliyor |

★ "Hemen yayına al" işaretlenirse `starts_at` / `ends_at` yazılıyor ve
`boost_apply_flags` çağrılıyor. İşaretlenmezse `pending` olarak
oluşuyor, listeden ayrıca onaylanıyor.

---

## 2. Boost analitiği ✅

### Neden yeni tablo gerekti

`ad_stats_daily` birincil anahtarı `campaign_id` ve `ad_campaigns`'e
yabancı anahtarla bağlı — boost için kullanılamıyor.

**`sql/boost_istatistik.sql`** aynı yapıyı boost için kuruyor:

| Nesne | İş |
|---|---|
| `boost_stats_daily` | Gün bazında gösterim/tıklama |
| `boost_track(id, event)` | Mobil çağırıyor — `view` / `click` |
| `boost_stats(id, gun)` | Özet + günlük dizi |
| RLS `boost_stats_own` | Sahibi kendi istatistiğini görüyor |

★ Gün bazında toplanıyor, olay bazında değil. Boost başına günde tek
satır — milyonlarca satır birikmiyor.

★ `boost_track` sadece **aktif** boost'a yazıyor. Bekleyen ya da süresi
dolmuş kayda gösterim işlenmiyor.

### Detay sayfasında

**Reklamlar → Öne Çıkanlar → Görüntüle**

```
[Durum] [Aylık] [Alan doluluğu] [Kalan gün]
[Gösterim] [Tıklama] [Tıklanma oranı]

┌─ Son 30 gün ─────────────────────────┐
│  ▁▃▅▂▇▄▆▃▅▂▇▄▁▃▅▂▇▄▆▃▅▂▇▄▁▃▅▂▇▄     │
│  açık = gösterim · koyu = tıklama    │
└──────────────────────────────────────┘
```

★ Grafik kütüphanesiz — yükseklik oranlı div'ler. Tek grafik için 40
KB'lık paket yüklemeye değmez. Çubuğun üstüne gelince tarih ve sayılar
çıkıyor.

★ **SQL çalıştırılmasa bile sayfa açılıyor** — RPC yoksa istatistik
sıfır görünüyor, hata vermiyor.

---

## Kurulum

**1.** SQL çalıştır (Supabase SQL Editor):
```
sql/boost_istatistik.sql
```

**2.** Panel:
```bash
npm install && npm run build && npm start
```

---

## Mobil tarafı (isteğe bağlı)

Boost istatistiği toplanması için mobilde iki çağrı gerekiyor:

```ts
// İçerik listede görününce
await supabase.rpc("boost_track", { p_boost_id: id, p_event: "view" })

// Üstüne dokununca
await supabase.rpc("boost_track", { p_boost_id: id, p_event: "click" })
```

Bunlar eklenmezse panel grafiği boş kalır ama başka hiçbir şey
bozulmaz.

---

## Denetim

```
✓ tsc --noEmit temiz
✓ next build başarılı
✓ SQL $$ blokları dengeli
✓ total_price'a yazım yok
✓ Yeni any tipi yok
```

## Değişen dosyalar

```
src/components/BoostCreate.tsx        🆕 manuel oluşturma arayüzü
sql/boost_istatistik.sql              🆕 istatistik tablosu + RPC
src/actions/ad.actions.ts             ♻️ fetchBoostDetail'e istatistik
src/app/(dashboard)/reklamlar/boost/[id]/page.tsx  ♻️ analitik + grafik
```

`createBoostAction` ve `fetchUserContent` zaten vardı — yeniden
yazmadım, mevcut olanları kullandım.
