# "Görsel açılamadı" — sebep ve çözüm

## Önce sorunun cevabı: bucket açık ne demek?

**"Herkese açık" ≠ "herkes düzenleyebilir".**

| İşlem | Kim yapabilir |
|---|---|
| **Okuma** | Herkes — adresini bilen görseli görebilir |
| **Yükleme** | Sadece `service_role` (panel ve servisler) |
| **Değiştirme** | Sadece `service_role` |
| **Silme** | Sadece `service_role` |

Bucket açık olmazsa uygulama ve panel görselleri **hiç gösteremez** —
tarayıcı oturum taşımıyor, düz bir HTTP isteği atıyor.

Yükleme yetkisi sende kalıyor. Rastgele biri bucket'ına dosya atamaz.

`sql/depolama_erisim.sql` tam olarak bu ayarı kuruyor.

---

## Panelden neden göremiyorsun?

Muhtemel sebep bucket değil, **adres**.

`getPublicUrl()` görselin adresini **`SUPABASE_URL`'den** üretiyor.
Kendi sunucunda barındırdığın için bu değişken büyük ihtimalle iç ağ
adresi:

```env
SUPABASE_URL=http://kong:8000        # Docker ağı içinden
```

Panel sunucusu buna erişiyor — **yükleme çalışıyor**. Ama tarayıcın
`kong` diye bir adresi çözemiyor — **görsel açılmıyor**.

Aynı sorun mobilde de var: kaydedilen URL iç ağ adresi olduğu için
telefonda da açılmıyor.

### Çözüm

`.env` dosyana **tek satır** ekle:

```env
SUPABASE_URL=http://kong:8000                    # sunucu içi (var olan)
SUPABASE_PUBLIC_URL=https://supabase.rovand.cloud # ★ YENİ — tarayıcı/telefon
```

Paneli yeniden başlat. Artık:
- Sunucu iç adresten bağlanıyor (hızlı, güvenli)
- Görsel adresleri dış adresten üretiliyor (tarayıcı ve telefon erişiyor)

Tek sunucu kurulumundaysan ikisi zaten aynı — `SUPABASE_PUBLIC_URL`
yazmasan da olur.

★ **Eski kayıtlar da düzeliyor.** `adresiDuzelt()` gösterim anında
adresi güncel köke taşıyor; veritabanını toplu güncellemene gerek yok.

---

## Kesin teşhis: Ayarlar → Depolama tanısı

Tahmin etmene gerek yok. **Ayarlar** sayfasının altına bir tanı paneli
ekledim. "Kontrol et"e bas, sana şunu söylüyor:

| Ne gösteriyor | Ne anlama geliyor |
|---|---|
| Sunucu adresi | Panelin bağlandığı adres |
| Genel adres | Görsel URL'lerinin üretildiği adres |
| Bucket durumu | var/yok · açık/kapalı · dosya sayısı |
| **Örnek dosya testi** | Gerçek bir görseli yüklemeyi dener |

Son satır önemli: ayarlar doğru görünse bile görsel açılmıyorsa
**"açılamadı"** yazıyor ve URL'i tıklanabilir veriyor — tarayıcıda açıp
ham hatayı görebilirsin.

Teşhisler:

| Teşhis | Çözüm |
|---|---|
| "Bucket bulunamadı" | `panel_v4_5_bucket_imap_stats.sql` çalıştırılmamış |
| "Bucket herkese açık DEĞİL" | `sql/depolama_erisim.sql` çalıştır |
| "Genel adres bir İÇ AĞ adresi" | `SUPABASE_PUBLIC_URL` ekle |
| "Ayarlar doğru görünüyor" | Örnek dosya testine bak |

---

## Sırayla yap

**1.** SQL çalıştır:
```
sql/depolama_erisim.sql
```

**2.** Doğrula — üçü de `public = t` olmalı:
```sql
select id, public from storage.buckets
where id in ('galeri','reklam','media');
```

**3.** Panelde **Ayarlar → Depolama tanısı → Kontrol et**

**4.** "Genel adres bir İÇ AĞ adresi" diyorsa `.env`'e ekle:
```env
SUPABASE_PUBLIC_URL=https://supabase.rovand.cloud
```

**5.** Yeniden başlat:
```bash
npm run build && npm start
```

---

## Değişen dosyalar

```
src/lib/storage-url.ts               🆕 genelAdres() · adresiDuzelt()
src/components/StorageDiagnostics.tsx 🆕 tanı paneli
src/actions/upload.actions.ts        ♻️ diagnoseStorage() eklendi
src/actions/ad.actions.ts            ♻️ genelAdres kullanıyor
src/actions/media.actions.ts         ♻️ aynı
src/actions/library.actions.ts       ♻️ aynı
src/app/api/upload/route.ts          ♻️ aynı
src/app/(dashboard)/ayarlar/page.tsx ♻️ tanı paneli eklendi
sql/depolama_erisim.sql              🆕
```

`getPublicUrl()` çağrısı projede **hiç kalmadı** — hepsi `genelAdres()`
üzerinden geçiyor.
