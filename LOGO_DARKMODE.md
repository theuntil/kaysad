# Logolar karanlık modda düzeldi

## Sorun neredeydi

Yazılar uyum sağlıyordu ama logolar sağlamıyordu. Sebep: logo değişimi
**asimetrik** yazılmıştı.

```html
<!-- ÖNCE -->
<img class="ki-acik" src="...">          ← doğrudan img
<div class="ki-koyu" style="display:none">
  <img src="...">                        ← div içinde img
</div>
```

Bir taraf `<img>`, diğer taraf `<div>`. Bazı istemciler `<img>` üzerinde
`display:none !important` kuralını uygulamıyor — sonuçta aydınlık logo
karanlık modda da görünmeye devam ediyordu. Koyu zeminde koyu logo =
görünmez.

## Düzeltme

### 1. Simetrik yapı

```html
<div class="ki-acik">
  <img src="${logoAcik}">
</div>

<!--[if !mso]><! -->
<div class="ki-koyu" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
  <img src="${logoKoyu}">
</div>
<!--<![endif]-->
```

İkisi de `<div>` — aynı kural ikisine de aynı şekilde uygulanıyor.

### 2. Gizleme kuralı güçlendirildi

```css
.ki-acik {
  display:none !important;
  height:0 !important;
  max-height:0 !important;
  overflow:hidden !important;
  mso-hide:all;
}
.ki-koyu {
  display:block !important;
  height:auto !important;
  max-height:none !important;
  overflow:visible !important;
}
.ki-koyu img { display:block !important; }
```

Sadece `display` yeterli değil — bazı istemciler `max-height:0`ı
korumaya devam ediyor ve logo yer kaplamadan gizli kalıyor.

### 3. Outlook

`<!--[if !mso]>` koşullu yorumu: Outlook karanlık mod logosunu hiç
görmüyor, sadece aydınlık olanı çiziyor. Outlook zaten
`prefers-color-scheme` desteklemiyor; iki logoyu birden göstermesini
engelliyoruz.

### 4. Otomatik ters çevirme engellendi

```css
.ki-gorsel { -webkit-filter:none !important; filter:none !important; }
```

★ Apple Mail bazı görselleri karanlık modda **kendiliğinden ters
çeviriyor**. Uygulama simgesi ve mağaza rozetleri bundan bozuluyordu.
Bu kural onu durduruyor.

Sınıf üç yerde: uygulama simgesi, Apple rozeti, Play rozeti.

---

## Hangi görsel nerede

| Görsel | Aydınlık | Karanlık | Neden |
|---|---|---|---|
| Ana logo | `kays.png` | `kays1.png` | İki ayrı dosya, otomatik değişiyor |
| Uygulama simgesi | Aynı | Aynı | Simge kendi zemini olan bir kutu |
| Apple rozeti | Beyaz | Beyaz | Düğme zemini her iki temada koyu |
| Play rozeti | Beyaz | Beyaz | Aynı sebep |

★ Rozetler için ayrı sürüm gerekmiyor — düğmenin zemini `#1c1c1e`,
karanlıkta `#3a3a3c`. İkisi de koyu, beyaz logo okunuyor.

---

## Doğrulama

```
═══ LOGO DEĞİŞİMİ ═══
  Aydınlık logo sarmalayıcı : ✓ div
  Karanlık logo sarmalayıcı : ✓ div
  Simetrik yapı             : ✓

═══ KARANLIK MOD KURALLARI ═══
  .ki-acik ✓   .ki-koyu ✓   .ki-koyu img ✓
  .ki-gorsel ✓   .ki-ickart ✓   .ki-dugme ✓

═══ GİZLEME SAĞLAMLIĞI ═══
  display:none ✓   height:0 ✓   max-height:0 ✓
  overflow:hidden ✓   mso-hide ✓

═══ OUTLOOK ═══
  Koşullu yorum ✓   mso-hide:all ✓

═══ GÖRSELLERE SINIF ═══
  ki-gorsel sayısı : 3 ✓
```

---

## Test etmenin yolu

Karanlık modu gerçekten görmek için:

**iPhone / Mac:** Ayarlar → Görünüm → Koyu, sonra Mail'i aç
**Gmail Android:** Ayarlar → Genel → Tema → Koyu
**Web Gmail:** karanlık mod desteklemiyor, hep aydınlık görünür

★ Tarayıcıda test edersen yanılabilirsin — web istemcilerinin çoğu
`prefers-color-scheme` uygulamıyor. Gerçek testi telefonda yap.

---

## Kurulum

```bash
npm install && npm run build && npm start
```

## Değişen dosya

```
src/lib/mail-sablon.ts   ♻️ simetrik logo yapısı, güçlü gizleme,
                            Outlook koşullu yorumu, ters çevirme engeli
```
