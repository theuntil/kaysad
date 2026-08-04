# Mail — ayrı ekranlar, ikon düğmeler, yüksek gövde

## 1. Ayrı route'lar ✅

**Önce:** ikisi de mail sayfasının içinde, istatistik kutularının ve
sekme çubuğunun altında açılıyordu.

**Şimdi:** kendi adresleri var.

| Ekran | Adres |
|---|---|
| Yeni mail | `/mail/yaz` |
| Mail detayı | `/mail/<id>` |

Kazanımlar:

- **Tarayıcı geri düğmesi çalışıyor** — durum değişimiyle açılan bir
  panelde çalışmıyordu
- **Maile doğrudan bağlantı verilebiliyor** — kopyala, paylaş, yer imi
- **İstatistik kutuları ve sekmeler görünmüyor** — sadece mail

★ Eski `/mail?yaz=1` bağlantıları `/mail/yaz`'a yönlendiriliyor;
kayıtlı sekmeler ve dış bağlantılar bozulmuyor. `?to=` ve `?user=`
parametreleri de taşınıyor.

Liste satırına tıklayınca artık `/mail/<id>` açılıyor. `MailInbox`
içindeki inline detay bloğu tamamen kaldırıldı.

## 2. Yıldız ve arşiv artık ikon ✅

**Önce:** `[Yıldızla]` / `[Yıldızı kaldır]` — metin düğme, durum
değişince yazı da değişiyordu.

**Şimdi:** 36×36 ikon düğme.

| Durum | Görünüm |
|---|---|
| Yıldızsız | Çizgi yıldız, sönük |
| Yıldızlı | **Dolu** yıldız, vurgu rengi + çerçeve |
| Arşivsiz | Çizgi kutu |
| Arşivli | **Dolu** kapak, vurgu rengi |

İki durumlu bir eylem için yazı değiştirmek hem yer kaplıyor hem
okumayı zorunlu kılıyor. Dolu/boş ikon tek bakışta anlaşılıyor.

★ `title` ve `aria-label` korunuyor — ikon görsel kısayol, anlamı
kaybettirmiyor. `aria-pressed` ile durum ekran okuyuculara da
bildiriliyor.

★ **İyimser güncelleme:** düğme anında tepki veriyor, sunucu hata
verirse geri alınıyor. Ağ beklemek kötü hissettiriyordu.

## 3. Gövde yüksekliği ✅

```diff
- <MailBodyFrame ... />
+ <div className="min-h-[70vh]">
+   <MailBodyFrame ... />
+ </div>
```

Eskiden gövde içerik yüksekliğine göre büzülüyordu — kısa maillerde bile
dar bir şeritte görünüyordu. Artık en az ekranın %70'i.

★ İçerik daha uzunsa iframe kendini büyütmeye devam ediyor; `min-height`
sadece taban koyuyor, tavan değil.

---

## Yeni dosyalar

```
src/app/(dashboard)/mail/yaz/page.tsx    🆕 yazma ekranı
src/app/(dashboard)/mail/[id]/page.tsx   🆕 detay route'u
src/components/MailDetailView.tsx        🆕 ikon düğmeler + yüksek gövde
```

## Değişen dosyalar

```
src/components/MailInbox.tsx          ♻️ inline detay kaldırıldı, route'a bağlandı
src/app/(dashboard)/mail/page.tsx     ♻️ yaz sekmesi kaldırıldı + yönlendirme
```

---

## Denetim

```
✓ tsc --noEmit temiz
✓ next build başarılı
✓ Mail dosyalarında kullanılmayan import yok
✓ Inline detay bloğu tamamen kaldırıldı (ölü kod yok)
```

## Kurulum

```bash
npm install && npm run build && npm start
```
