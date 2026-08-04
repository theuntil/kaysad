# "App Store kısmı neden yok" — iki sebep vardı

## Sebep 1 — asıl neden 🔴

Şablon **dört ayrı yerde** üretiliyordu:

| Yol | Ne zaman | Durum |
|---|---|---|
| `sendMailAction` | Tekil gönderim | ✓ yeni şablon |
| `sendBulkMailAction` | Toplu gönderim | ✓ yeni şablon |
| **`drainMailQueue`** | **Kuyruk işçisi** | **✗ ATLANMIŞ** |
| `sendTestMailAction` | Test | ✓ yeni şablon |

Kuyruk işçisi şunu yapıyordu:

```ts
wrapTemplate(s.default_template, { ... })   // ← HAM değer
```

`default_template` boşsa (ki SQL'de temizledik) mail **hiç
sarmalanmadan** gidiyordu. **Normal mailler kuyruktan geçtiği için**
yeni tasarımı hiç görmedin.

### Düzeltme

Tek üretici yazdım — `sablonHazirla(s)`. Dördü de onu çağırıyor:

```ts
// src/lib/mail-sablon.ts
export function sablonHazirla(s) {
  const ozel = s?.default_template?.trim()
  if (ozel) return ozel
  return varsayilanSablon({ /* ayarlardan */ })
}
```

Artık tek yer, tek davranış. Bir yolu güncelleyip diğerini unutmak
mümkün değil.

## Sebep 2 — mağaza adresi boştu

Şablonu şöyle yazmıştım:

```ts
if (a.appStoreUrl) { dugmeler.push(...) }   // ← adres yoksa düğme yok
```

Ayarlarda App Store / Play Store adreslerini doldurmadıysan düğmeler
hiç basılmıyordu. "Çalışmayan bağlantı gösterme" niyetiyle yazmıştım
ama sen her mailde görünmesini istiyorsun.

### Düzeltme

Artık **koşulsuz** basılıyor:

```ts
const appHref = a.appStoreUrl?.trim() || a.siteUrl
const playHref = a.playStoreUrl?.trim() || a.siteUrl

const dugmeler = [
  magazaDugmesi(appHref, MAGAZA_IKON.apple, "İndir", "App Store"),
  magazaDugmesi(playHref, MAGAZA_IKON.play, "İndir", "Google Play"),
]
```

Adres ayarlanmamışsa site adresine düşüyor — düğme yine görünüyor.

> Mağaza adreslerini **Ayarlar → Mail → Marka ve mağaza**'dan
> doldurursan düğmeler doğru yere gider.

---

## kays.business kaldırıldı ✅

Alt bilgideki görünen adres satırı silindi. Artık mailde hiçbir yerde
`kays.business` **yazmıyor**.

★ Adres sadece bağlantı hedefi olarak duruyor (mağaza adresi
ayarlanmadıysa yedek olarak) — ekranda görünmüyor.

★ Alt satırda sadece marka adı var: "Bu e-posta Kays tarafından
gönderildi." Marka adını da değiştirebilirsin.

---

## Doğrulama testi

Şablonu gerçekten çalıştırıp çıktısını kontrol ettim:

```
═══ 1. Mağaza adresi TANIMSIZ (senin durumun) ═══
  App Store düğmesi  : ✓ VAR
  Google Play düğmesi: ✓ VAR
  Apple logosu       : ✓
  Play logosu        : ✓

═══ 2. Mağaza adresi TANIMLI ═══
  App Store bağlantısı: ✓
  Play bağlantısı     : ✓

═══ 3. kays.business GÖRÜNEN metinde ═══
  Metinde kays.business: ✓ YOK

═══ 4. Karanlık mod ve logolar ═══
  prefers-color-scheme: ✓
  Aydınlık logo       : ✓
  Karanlık logo       : ✓

═══ 5. Yer tutucular ═══
  {{icerik}} ✓   {{konu}} ✓   {{imza}} ✓
```

---

## Kurulum

```bash
npm install && npm run build && npm start
```

SQL'i daha önce çalıştırdıysan tekrar gerekmiyor.

**Kontrol:** Ayarlar → Mail → Şablon alanı **boş** olmalı. Doluysa
"Varsayılana dön"e bas ve kaydet — dolu şablon yeni tasarımı ezer.

---

## Değişen dosyalar

```
src/lib/mail-sablon.ts       ♻️ koşulsuz mağaza + sablonHazirla()
                                + site adresi kaldırıldı
src/actions/mail.actions.ts  ♻️ dört gönderim yolu tek üreticiye bağlandı
```
