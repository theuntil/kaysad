# "Diğer her yer çalışıyor, sadece reklam görseli açılmıyor"

## O hata mesajı yanıltıcıydı — benim yazdığım

"Bucket herkese açık olmayabilir" cümlesini ben yazdım ve **tahmine
dayanıyordu**. Görsel yüklenemediğinde tek sebep bu değil; körlemesine
bucket'ı suçluyordu. Düzelttim.

---

## Elimizdeki üç ipucu

1. Sitede başka hiçbir yerde sorun yok → **adres kökü doğru**
2. URL'i tarayıcıda açınca görsel geliyor → **dosya var, bucket açık**
3. Ama `kays.business` sayfasının içinde açılmıyor

Bu üçü birlikte tek bir şeye işaret ediyor: **sunucunun yanıt başlığı.**

Bir görselin doğrudan açılıp sayfaya gömülememesi neredeyse her zaman
şu başlıktan olur:

```
Cross-Origin-Resource-Policy: same-origin
```

Bu başlık "beni sadece kendi alan adım gömebilir" demek. Adres çubuğuna
yazınca gömme yok → çalışıyor. `kays.business` içinde `<img>` olarak
istenince gömme var → tarayıcı engelliyor.

Genelde Supabase'in önündeki **ters vekil** (nginx / Caddy / Cloudflare)
"güvenlik başlıkları" olarak ekliyor.

---

## Kesin teşhis

**Ayarlar → Depolama tanısı → Kontrol et → "Sunucudan test et"**

Panel sunucusu görseli gerçekten indirip başlıkları okuyor:

```
HTTP 200 OK
content-type: image/png
cross-origin-resource-policy: same-origin   ← sorun buysa burada görünür
boyut: 184320 bayt
```

İki test aynı anda çalışıyor:

| Test | Neyi ölçüyor |
|---|---|
| **Tarayıcı testi** | Sayfaya gömülebiliyor mu? |
| **Sunucudan test** | Dosya var mı, hangi başlıklar dönüyor? |

**Çelişirlerse** (sunucu "geçerli görsel" der, tarayıcı "açılamadı" derse)
sebep kesinlikle bir yanıt başlığıdır.

---

## Çözüm — `cross-origin-resource-policy` çıkarsa

Supabase'in önündeki vekilde bu başlığı **kaldır** ya da
`cross-origin` yap.

### nginx

```nginx
location /storage/ {
    proxy_pass http://kong:8000;

    # ★ Varsa bu satırı SİL:
    # add_header Cross-Origin-Resource-Policy "same-origin";

    # ★ Ya da açıkça izin ver:
    add_header Cross-Origin-Resource-Policy "cross-origin" always;
}
```

### Caddy

```caddy
handle /storage/* {
    header Cross-Origin-Resource-Policy "cross-origin"
    reverse_proxy kong:8000
}
```

### Cloudflare

Rules → Transform Rules → Response Header Modification
→ `/storage/*` yolunda `Cross-Origin-Resource-Policy` başlığını
`cross-origin` yap ya da kaldır.

Sonra tarayıcı önbelleğini temizle (Ctrl+Shift+R).

---

## Başka bir şey çıkarsa

| Sunucu testi ne diyorsa | Anlamı |
|---|---|
| `HTTP 400` / `404` | Dosya yolu yanlış ya da bucket kapalı |
| `HTTP 403` | Hotlink koruması ya da bucket kapalı |
| `boyut: 0 bayt` | Yükleme bozuk tamamlanmış, tekrar yükle |
| `content-type: text/html` | Görsel değil, hata sayfası dönüyor |
| "geçerli bir görsel" | Sunucuda sorun yok → F12 → Console'daki engelleme mesajını oku |

---

## Son ihtimal: tarayıcı konsolu

Sunucu testi "sorun yok" derse cevap konsolda:

**F12 → Console** → reklam sayfasını yenile → kırmızı satırı oku.

Tipik mesajlar:

| Konsol mesajı | Sebep |
|---|---|
| `blocked by Cross-Origin-Resource-Policy` | Yukarıdaki başlık |
| `Mixed Content: ... requested an insecure` | Adres `http://` — https olmalı |
| `Refused to load ... violates ... Content Security Policy` | CSP — bana at, düzeltirim |
| `net::ERR_BLOCKED_BY_CLIENT` | Reklam engelleyici eklenti (`/reklam/` yolu!) |

★ **Son satır ciddi bir ihtimal.** Dosya yolun `/reklam/image/...`
şeklinde. uBlock, AdBlock gibi eklentiler "reklam", "ads", "banner"
geçen adresleri engelliyor. Diğer görsellerin (`galeri`, `media`)
sorunsuz açılması da tam olarak buna uyuyor.

**Hızlı test:** reklam sayfasını **gizli sekmede** (eklentiler kapalı) aç.
Görsel geliyorsa sebep bu.

Kalıcı çözüm: eklentiye `kays.business` için istisna ekle, ya da bucket
adını nötr bir şeyle değiştir (`promo` gibi).

---

## Değişen dosyalar

```
src/actions/upload.actions.ts         ♻️ testStorageUrl() eklendi
src/components/StorageDiagnostics.tsx ♻️ sunucu testi eklendi
src/components/AdEditPanel.tsx        ♻️ yanıltıcı hata mesajı düzeltildi
```
