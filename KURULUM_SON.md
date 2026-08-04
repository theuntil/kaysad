# Toplu mail hatası + son durum

## 🔴 "Kuyruğa yazılamadı: undefined" — benim hatam

İki hata birden vardı:

**1. Tablo adını uydurmuşum**

```diff
- sb.from("mail_outbox")   ← böyle bir tablo YOK
+ sb.from("mail_queue")    ← gerçek kuyruk tablosu
```

**2. Olmayan bir kolona yazıyordum**

```diff
  {
    to_email, user_id, subject, body_html, body_text, status,
-   created_by: session.sub,   ← mail_queue'da böyle bir kolon YOK
+   priority: 8,
  }
```

`undefined` görmenin sebebi: tablo bulunamayınca PostgREST farklı bir
hata biçimi döndürüyor ve `error.message` boş kalıyordu. Ben sadece onu
okuyordum.

### Hata mesajı da düzeltildi

```ts
const detay =
  error.message ||
  error.details ||
  error.hint ||
  error.code ||
  JSON.stringify(error)
```

Artık hangi biçimde gelirse gelsin okunabilir bir şey yazıyor.

### Bonus: öncelik

```ts
priority: 8
```

Tekil mailler varsayılan `5` ile giriyor. Toplu gönderim sıraya
**arkadan** giriyor — tek bir kullanıcıya giden şifre sıfırlama maili
2000 kişilik duyurunun arkasında beklemiyor.

---

## İkinci uydurma: `?sekme=outbox`

Gönderdikten sonra `/mail?sekme=outbox` adresine yönlendiriyordum.
Öyle bir sekme yok — geçerli olanlar: `inbox`, `unread`, `starred`,
`archived`, `ayar`.

Artık `/mail` (gelen kutusu) açılıyor.

---

## Sistematik kontrol yaptım

Aynı hatanın başka yerde olmadığından emin olmak için **koddaki tüm
tablo ve RPC çağrılarını SQL dosyalarındaki tanımlarla karşılaştırdım.**

```
═══ TANIMSIZ TABLO KULLANIMI ═══
  devices, notifications  → daha eski migration'larda tanımlı (mevcut kod)
  reklam                  → yanlış alarm, storage bucket'ı

═══ TANIMSIZ RPC ═══
  admin_set_active, admin_push_stats, …  → panel_v3_* dosyalarında (mevcut kod)
```

**Benim eklediğim kodda başka uydurma tablo/kolon/RPC yok.**

`mail_queue` kolon eşleşmesi de doğrulandı:

```
Kullanılan     : body_html, body_text, priority, status, subject, to_email, user_id
Tabloda olmayan: ✓ yok
```

---

## Kurulum

### SQL — sırayla

```
1. sql/reklam_guvenlik.sql          (taban fiyat, RLS, fiyat RPC'leri)
2. sql/boost_istatistik.sql         (boost analitiği)
3. sql/mail_sablon_magaza.sql       (mail alanları, toplu mail RPC'leri)
4. sql/mail_logo_magaza_duzelt.sql  (logo adresleri + mağaza)
```

⚠️ **4. dosyada mağaza adreslerini kendi bağlantılarınla değiştir:**

```sql
update app_config set
  ios_store_url     = 'https://apps.apple.com/tr/app/kays/idXXXXXXXXX',
  android_store_url = 'https://play.google.com/store/apps/details?id=com.kays.app'
where id = 1;
```

### Panel

```bash
npm install
npm run build
npm start
```

---

## Doğrulama listesi

**Reklam**
- [ ] Karta tıklayınca detay açılıyor (Detay düğmesi yok)
- [ ] Boost kartına tıklayınca detay açılıyor
- [ ] Reklam ekle → tür seçimi formun başında
- [ ] Boost detayında düzenleme + silme çalışıyor
- [ ] Görseller açılıyor (`/api/varlik/…` üzerinden)

**Mail**
- [ ] Yeni mail ayrı ekranda (`/mail/yaz`)
- [ ] Mail detayı ayrı ekranda (`/mail/<id>`)
- [ ] Yıldız/arşiv ikon düğme
- [ ] İlet çalışıyor
- [ ] Toplu mail gönderiliyor ← **bu turda düzeldi**
- [ ] Gelen mail paneli bozmuyor (iframe)

**Şablon** — kendine test maili gönder
- [ ] Logo görünüyor (karanlık modda beyaz sürüm)
- [ ] Uygulama tanıtım kartı var
- [ ] App Store / Play Store rozetleri `app_config`'e gidiyor
- [ ] Yükle düğmesi `kays.com.tr/indir`
- [ ] `kays.business` hiçbir yerde yazmıyor

★ Karanlık mod testini **telefonda** yap — web Gmail
`prefers-color-scheme` uygulamıyor.

---

## Denetim

```
✓ tsc --noEmit temiz
✓ next build başarılı
✓ 5 SQL dosyası $$ dengeli
✓ Uydurma tablo/kolon/RPC yok
✓ mail_queue kolon eşleşmesi tam
```
