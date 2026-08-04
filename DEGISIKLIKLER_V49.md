# Panel — Reklam ve Mail Güncellemesi

## 1. Yönlendirme sadeleşti ✅

Mobil tarafla aynı: **sadece web adresi ve isteğe bağlı**.

**Kalktı:** Kendi ilanı · Kendi etkinliği · Kendi indirimi · Kendi profili ·
Yönlendirme yok seçenekleri ve "Kayıt kimliği (UUID)" alanı.

**Kaldı:** tek bir adres alanı.

```
Web adresi
İsteğe bağlı — boş bırakılırsa reklam yönlendirmez

[ https://siteniz.com                    ]
```

Mantık: adres doluysa `target_type: "external"`, boşsa `"none"`.

Etkilenen: `AdCreate.tsx` (reklam ekleme), `AdEditPanel.tsx` (düzenleme),
reklam detay sayfasındaki bilgi satırı.

## 2. Reklam detayına düzenleme paneli ✅ 🆕

`src/components/AdEditPanel.tsx`

| Alan | İşlem |
|---|---|
| Reklam görseli | Ekle · Değiştir · Kaldır |
| Logo | Ekle · Değiştir · Kaldır |
| Başlık | Düzenle |
| Açıklama | Düzenle |
| Web adresi | Düzenle (boşaltınca yönlendirme kalkıyor) |
| Aylık fiyat | Düzenle (taban fiyat denetimli) |
| Süre | 1 / 2 / 3 ay |

Görsel yükleme **akıllı yolu** kullanıyor: imzalı URL → başarısızsa
sunucu vekili. Kendi sunucusunda barındırılan Supabase'deki CORS sorunu
bu ekranda da çıkmıyor.

Toplam tutar canlı hesaplanıyor. Değişiklik yoksa Kaydet pasif.

★ **Panel onay beklemiyor** — reklam verenin `ad_request_edit` akışından
farklı, çünkü onaylayan taraf zaten panel.

★ `total_price` **yazılmıyor** — üretilmiş kolon
(`generated always as (monthly_price * months) stored`).

## 3. Boost detay sayfası ✅ 🆕

`src/app/(dashboard)/reklamlar/boost/[id]/page.tsx`

Reklam detayıyla **tutarlı**: aynı metrik satırı, aynı kart yapısı, aynı
teklif geçmişi tablosu.

- Durum · Aylık tutar · Alan doluluğu · Kalan gün
- **Öne çıkarılan içeriğin kendisi** (görsel + başlık + kimlik)
- Seviye, süre, taban fiyat, tarihler
- Talep notu, red sebebi
- Talep sahibi kartı
- Teklif geçmişi (görüntülenen teklif vurgulu)

`BoostManager` kartlarına **Görüntüle** düğmesi eklendi.

## 4. Boost düzenleme ✅ 🆕

`src/components/BoostEditPanel.tsx`

Teklif tutarı düzenlenebiliyor, taban fiyat denetimli. Süre "1 ay —
değiştirilemez" olarak gösteriliyor.

İçerik düzenlenmiyor ve bu bilinçli: öne çıkarılan şey kullanıcının
kendi ilanı/indirimi/etkinliği, başlık ve görsel oradan geliyor.

## 5. 🔴 Mail CSS sızıntısı ✅

**Sorun:** `dangerouslySetInnerHTML` ile basılan mail HTML'i panele
sızıyordu:

- Mailin `<style>` bloğu tüm sayfayı etkiliyor
  (`body { background: transparent }` panelin arka planını
  şeffaflaştırıyordu)
- `* { }` seçicileri panelin kendi öğelerini eziyor
- Yüksek özgüllüklü kurallar tema renklerini bozuyor

Pazarlama mailleri genelde **tam bir HTML belgesi** gönderiyor; sayfanın
içine gömülünce iki belge çakışıyor.

**Çözüm:** `src/components/MailBodyFrame.tsx` — sandbox iframe.

```tsx
<iframe
  srcDoc={belge}
  sandbox="allow-popups allow-popups-to-escape-sandbox"
  referrerPolicy="no-referrer"
/>
```

| Önlem | Neden |
|---|---|
| Ayrı belge | Tarayıcı CSS'i orada hapsediyor, dışarı sızamıyor |
| `sandbox` | Script çalıştırma, form gönderme, üst pencereye erişim yok |
| `srcDoc` | İçerik ayrı isteğe çıkmıyor — uzak sunucuya "okundu" sinyali gitmiyor |
| `no-referrer` | Panel adresi maildeki sunuculara sızmıyor |

Yükseklik otomatik: iframe yüklenince içerik ölçülüp çerçeveye
uygulanıyor. Görseller geç yüklenebildiği için birkaç kez ölçülüyor,
kaydırma çubuğu çıkmıyor.

---

## Yeni dosyalar

```
src/components/AdEditPanel.tsx
src/components/BoostEditPanel.tsx
src/components/MailBodyFrame.tsx
src/app/(dashboard)/reklamlar/boost/[id]/page.tsx
```

## Yeni eylemler (`ad.actions.ts`)

```ts
updateAdAction(g: AdDuzenleGirdi)     // reklam düzenleme
fetchBoostDetail(id: string)          // boost detayı + içerik + geçmiş
updateBoostAction({ id, monthly_price })
```

---

## Denetim

```
✓ tsc --noEmit temiz
✓ next build başarılı
✓ eslint temiz
✓ dangerouslySetInnerHTML kalmadı
✓ total_price'a yazım yok
✓ eski hedefTip/hedefDeger kalmadı
```

## Kurulum

```bash
npm install
npm run build
npm start
```

SQL tarafında `reklam_guvenlik.sql` çalıştırılmış olmalı — taban fiyat
tetikleyicileri ve `ad_update_price` / `boost_update_price` RPC'leri
orada.
