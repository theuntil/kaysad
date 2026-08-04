# Mail şablonu — son düzenlemeler

## ⚠️ Önce bir şey söyleyeyim

**Gönderdiğin eskiz görseli bana ulaşmadı** — mesajda ekli değil.
Tarifinden anladığım kadarıyla App Store liste satırı görünümünde bir
tanıtım kartı yaptım: simge · ad · alt başlık · yıldız puanı · düğme.

Görseli tekrar gönderirsen birebir uydururum.

---

## 1. Gri zemin kaldırıldı ✅

```diff
- background:#f2f2f7    ← gri
+ background:#ffffff    ← beyaz
```

Eski hâlde kartla zemin arasındaki fark çok azdı; mail istemcisinin
kendi beyaz zemininde **gri bir dikdörtgen** gibi duruyordu. Beyaz
zemin istemciyle kaynaşıyor.

★ Karanlık modda yine `#000000` — `ki-zemin` sınıfı üzerinden.

## 2. Mağaza logoları düzeldi ✅

**Sorun:** logolar `width="22" height="22"` ile **kareye
zorlanıyordu**. Apple ve Play logolarının en-boy oranı kare değil, bu
yüzden basık görünüyorlardı.

```diff
- <img width="22" height="22" style="width:22px;height:22px;">
+ <img height="24" style="height:24px;width:auto;max-width:30px;">
```

Artık sadece yükseklik sabit, genişlik oranı koruyor:

| Öznitelik | Kimin için |
|---|---|
| `height="24"` | Outlook |
| `width:auto` | Diğer istemciler |
| `max-width:30px` | Aşırı geniş logo taşırmasın |

## 3. Uygulama tanıtım kartı ✅ 🆕

Mağaza düğmelerinin **üstünde**:

```
┌──────────────────────────────────────────────┐
│  ┌────┐  Kays                      ┌───────┐ │
│  │ 🟦 │  Alışveriş & Yerel Fırsatlar│ Yükle │ │
│  └────┘  ★★★★★ 4.8                └───────┘ │
└──────────────────────────────────────────────┘

           Uygulamayı indir
     [ App Store ]  [ Google Play ]
```

| Öğe | Not |
|---|---|
| Simge | Verdiğin `ddd-20260803-kj80hl.png`, 60×60, `border-radius:14px` (iOS oranı) |
| Ad | Marka adı — ayarlardan |
| Alt başlık | "Alışveriş & Yerel Fırsatlar" |
| Puan | ★★★★★ 4.8 |
| Düğme | "Yükle" — App Store adresine gidiyor |

★ **Yıldızlar Unicode karakter**, görsel değil. Mail istemcileri
yıldız görselini bazen engelliyor; karakter her yerde çiziliyor.

★ Outlook `border-radius`'u çizmiyor, simge kare görünüyor — kabul
edilebilir bir gerileme, başka yolu yok.

> **Not:** "Yüklü" yerine **"Yükle"** yazdım. Mail alan kişi
> uygulamayı henüz yüklememiş olabilir; "Yüklü" yanıltıcı olurdu.
> İstersen tek kelime değiştiririm.

## 4. Köşeler yuvarlandı ✅

```diff
- border-radius:18px
+ border-radius:26px      ← ana kart
```

İç tanıtım kartı `18px`, simge `14px`, düğmeler `999px` (tam yuvarlak).
Dıştan içe küçülen bir hiyerarşi — iç içe kutular birbirine yapışık
görünmüyor.

## 5. Karanlık mod tamamlandı ✅

Yeni öğeler için de kural eklendi:

```css
.ki-ickart    { background:#2c2c2e !important; }  /* tanıtım kartı */
.ki-dugme     { background:#3a3a3c !important; }  /* Yükle düğmesi */
.ki-dugmeyazi { color:#0a84ff !important; }
```

---

## Doğrulama

Şablonu çalıştırıp çıktısını denetledim:

```
✓ Gri zemin (#f2f2f7) kaldırıldı
✓ Beyaz zemin
✓ Kart yarıçapı 26px
✓ Uygulama simgesi
✓ Simge yarıçapı 14px
✓ Yükle düğmesi
✓ Yıldız puanı
✓ Logo width:auto (ezilme yok)
✓ App Store rozeti
✓ Google Play rozeti
✓ Karanlık: iç kart
✓ Karanlık: düğme

Sıralama: ✓ kart → mağaza düğmeleri
```

---

## Kurulum

```bash
npm install && npm run build && npm start
```

SQL gerekmiyor. Kendine test maili gönderip bak.

**Kontrol:** Ayarlar → Mail → Şablon alanı **boş** olmalı. Doluysa
"Varsayılana dön"e bas ve kaydet.

## Değişen dosya

```
src/lib/mail-sablon.ts   ♻️ zemin, logo boyutu, tanıtım kartı, köşeler
```
