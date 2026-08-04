# Kays Admin Panel

Popup ve bildirim sistemlerini yöneten, Docker ile çalışan yönetim paneli.

**Yığın:** Next.js 16 · React 19 · TypeScript · Tailwind · Supabase (service_role)

---

## 1. Ne yapabilirsin

**Popup yönetimi**
- Oluştur / düzenle / sil, yayına al / durdur
- 30+ ayar: görünüm, aksiyon, sıklık, hedefleme, zamanlama, öncelik
- **Canlı önizleme** — telefon çerçevesi içinde, kaydetmeden önce nasıl görüneceğini gör
- İstatistikler: gösterim, tıklama, oran
- Gösterim geçmişini sıfırlama (yeniden yayın / test)
- Popup'ı bildirim olarak gönderme

**Bildirim yönetimi**
- Toplu bildirim gönder: kampanya (`promo`), acil uyarı (`earthquake`), popup bildirimi (`popup`)
- Şehir ve öğrenci filtreleri
- **Zorunlu alıcı sayımı** — göndermeden önce kaç kişiye gideceğini görmek zorunlu
- Gönderilmiş broadcast'lerin listesi + okunma oranı
- Yanlış gönderimi **geri alma**

**İşlem kaydı**
- Panelde yapılan her işlem kaydedilir (başarısız giriş denemeleri dahil)

---

## 2. Kurulum

### Adım 1 — Veritabanı

Supabase → SQL Editor'de çalıştır:

```
sql/admin_panel_setup.sql
```

Bu dosya `admin_audit_log` tablosunu ve panelin ihtiyaç duyduğu 7 RPC'yi kurar.
İdempotent — tekrar çalıştırabilirsin.

> **Ön koşul:** Popup sistemi (`popups`, `popup_views`) ve bildirim sistemi
> (`notifications`) zaten kurulu olmalı.

### Adım 2 — Şifre hash'i üret

```bash
npm install
npm run hash-password
```

Çıkan **`ADMIN_PASSWORD_HASH_B64=...`** satırını kopyala.

> Şifre `.env`'de düz metin olarak tutulmaz — sadece bcrypt hash'i.
>
> **Neden base64:** bcrypt hash'leri `$2a$12$...` şeklinde `$` içerir.
> Next.js ise `.env` değerlerine değişken genişletmesi uygular ve `$2a`
> gibi parçaları silip hash'i bozar — tırnak işaretleri de kurtarmaz.
> Base64 formatında `$` olmadığı için bu sorun hiç yaşanmaz.

### Adım 3 — `.env` dosyası

```bash
cp .env.example .env
```

Doldur:

| Değişken | Nereden |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Aynı sayfa, **service_role** anahtarı |
| `ADMIN_USERNAME` | İstediğin kullanıcı adı |
| `ADMIN_PASSWORD_HASH_B64` | Adım 2'deki çıktı (base64 — önerilen) |
| `SESSION_SECRET` | `openssl rand -base64 48` |
| `SESSION_TTL_HOURS` | Oturum süresi (varsayılan 8) |
| `ALLOWED_ORIGINS` | Server Action'ların kabul edeceği origin'ler (aşağıya bak) |
| `ALLOWED_DEV_ORIGINS` | Sadece `npm run dev` için LAN erişimi |

Doldurduktan sonra doğrula:

```bash
npm run check-env
```

### Adım 4 — Docker

```bash
docker build -t kays-admin .

docker run -d \
  --name kays-admin \
  -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  kays-admin
```

Panel: `http://SUNUCU_IP:3000`

### Geliştirme (Docker'sız)

```bash
npm install
npm run dev     # http://localhost:3000
```

---

## 3. DigitalOcean'da HTTPS

Panel HTTP dinliyor; **HTTPS'i önüne bir ters vekil koyarak** sağla.
`service_role` erişimi olan bir paneli şifrelenmemiş HTTP üzerinden
kullanmak, oturum cookie'sinin ağda açık gitmesi anlamına gelir.

En hızlı yol — Caddy (otomatik Let's Encrypt):

```bash
# /etc/caddy/Caddyfile
admin.kays.com.tr {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
docker run -d --name caddy --network host \
  -v /etc/caddy/Caddyfile:/etc/caddy/Caddyfile \
  -v caddy_data:/data \
  caddy:2-alpine
```

**Ek önlem:** Panel portunu dışarıya hiç açmayıp sadece localhost'a bağla:

```bash
docker run -d -p 127.0.0.1:3000:3000 ... kays-admin
```

Böylece panele yalnızca ters vekil üzerinden (yani HTTPS ile) erişilir.

> `secure` cookie bayrağı `NODE_ENV=production` olduğunda otomatik açılır.
> HTTPS olmadan cookie tarayıcı tarafından reddedilir ve **giriş yapamazsın** —
> bu bilinçli bir koruma.

---

## 4. Güvenlik mimarisi

```
Tarayıcı
   │ imzalı HttpOnly cookie (JWT/HS256)
   ▼
Next.js Server ◄── service_role key BURADA (tarayıcıya hiç gitmez)
   │
   ▼
Supabase
```

**Katmanlar**

1. **Şifre** — bcrypt hash (cost 12), `.env`'de düz metin yok; base64 formatı Next'in `$` genişletmesinden korunmak için
2. **Oturum** — JWT/HS256, HttpOnly + `secure` + `sameSite=lax` cookie
3. **Algoritma sabitleme** — `algorithms: ["HS256"]` (alg confusion saldırısına karşı)
4. **Sabit zamanlı karşılaştırma** — kullanıcı adı için timing attack koruması
5. **Yanlış kullanıcı adında da bcrypt çalışır** — "kullanıcı yok" ile "şifre yanlış" arasındaki zaman farkı sızmasın
6. **Brute-force** — IP başına 15 dakikada 5 deneme, sonra 15 dakika kilit
7. **İki katmanlı yetki** — `proxy.ts` (her istek) **+** her server action'da `assertSession()`
8. **Kara liste route koruması** — yeni sayfa eklediğinde otomatik korumalı olur
9. **Açık yönlendirme koruması** — `?next=` parametresi sadece kendi path'lerimizi kabul eder
10. **`service_role` izolasyonu** — `supabase-admin.ts` tarayıcıda çalışırsa anında hata fırlatır
11. **Güvenlik başlıkları** — CSP, X-Frame-Options: DENY, nosniff, Referrer-Policy: same-origin
12. **Broadcast koruması** — alıcı sayısı doğrulanmadan gönderim yapılamaz; gönderim anında sayı yeniden hesaplanır, %25'ten fazla sapmada işlem durur
13. **Audit log** — client'a RLS ile tamamen kapalı
14. **Non-root container** — `USER nextjs` (uid 1001)
15. **`robots: noindex`** — arama motorlarına kapalı
16. **Server Action origin doğrulaması** — Next'in CSRF koruması açık; izinli origin'ler `ALLOWED_ORIGINS` ile açıkça beyaz listeye alınır (varsayılan: sadece kendi host'u)

**Doğrulanmış testler**

| Test | Sonuç |
|---|---|
| Oturumsuz korumalı sayfa | 307 → `/login` |
| Bilinmeyen route | 307 → `/login` (kara liste çalışıyor) |
| Geçerli oturum | 200 |
| Süresi geçmiş token | 307 (reddedildi) |
| Sahte imzalı token | 307 (reddedildi) |
| Kurcalanmış cookie | 307 (reddedildi) |
| `service_role` HTML'e sızıyor mu | Hayır |
| `SESSION_SECRET` HTML'e sızıyor mu | Hayır |
| `npm audit` | 0 zafiyet |

---

## 5. Bakım

### Şifre değiştirme

```bash
npm run hash-password
# .env'deki ADMIN_PASSWORD_HASH'i güncelle
docker restart kays-admin
```

### Tüm oturumları geçersiz kılma

`SESSION_SECRET`'i değiştir ve yeniden başlat — mevcut tüm cookie'ler anında geçersiz olur.

### Güncelleme

```bash
git pull
docker build -t kays-admin .
docker stop kays-admin && docker rm kays-admin
docker run -d --name kays-admin -p 127.0.0.1:3000:3000 --env-file .env --restart unless-stopped kays-admin
```

### Ortam değişkeni kontrolü

```bash
npm run check-env
```

### Bağımlılık denetimi

```bash
npm audit --omit=dev
```

> `package.json`'daki `overrides` alanı `postcss` ve `sharp`'ı yamalı
> sürümlere sabitliyor. Next sürümünü yükseltirken bu override'ları
> gözden geçir — gerekmez hale gelmiş olabilirler.

---

## 6. Sorun giderme

**"Eksik ortam değişkeni: …"**

Önce teşhis aracını çalıştır — sorunun tam olarak nerede olduğunu söyler:

```bash
npm run check-env
```

Kontrol ettiği şeyler: dosya var mı, adı doğru mu (macOS'ta gizli `.txt`
uzantısı tuzağı), ayrıştırılabiliyor mu, her zorunlu değişken geçerli mi,
`service_role` yerine yanlışlıkla `anon` anahtarı konmuş mu, şifre düz metin
mi yoksa bcrypt hash mi.

En sık sebep: **`.env`'i oluşturduktan sonra dev sunucusunu yeniden
başlatmamak.** Env değişkenleri yalnızca sunucu açılışında okunur; hot
reload onları yeniden yüklemez. `Ctrl+C` → `npm run dev`.

Diğer olasılıklar:
- Dosya proje kökünde değil (`package.json` ile aynı dizinde olmalı)
- Dosya adı `.env.txt` veya `env` (macOS Finder / VS Code uzantı gizliyor)
- Docker'da `--env-file .env` verilmemiş

**"ADMIN_PASSWORD_HASH bir bcrypt hash'i değil" / "bozulmuş görünüyor"**

İki olası sebep:

1. **Düz metin şifre yazmışsın** → `npm run hash-password` ile hash üret

2. **Hash'i olduğu gibi yapıştırmışsın** → Next.js `.env` değerlerindeki `$`
   işaretlerini değişken sayıp siliyor, hash bozuluyor. Tırnak da kurtarmıyor.
   `npm run hash-password` çalıştır ve çıkan **`ADMIN_PASSWORD_HASH_B64`**
   satırını kullan — base64'te `$` yok, sorun yaşanmaz.

**Aynı değişken .env'de iki kez yazılı**

Next.js **sonuncusunu** kullanır. Eski satırları sil — `npm run check-env`
bunu tespit edip hangi satırların çakıştığını söyler.

**"SESSION_SECRET en az 32 karakter olmalı"**
`openssl rand -base64 48` ile üret.

**Giriş yapıyorum ama sürekli login'e dönüyorum**
`NODE_ENV=production` iken cookie `secure` bayraklı gelir ve HTTPS zorunlu olur.
Ters vekil/HTTPS kurulumunu kontrol et.

**docker-compose ile `$` sorunu**
`ADMIN_PASSWORD_HASH` içindeki `$` karakterlerini `$$` olarak kaçır.
`--env-file` kullanıyorsan kaçırma gerekmez.

**"Invalid Server Actions request" / `... does not match origin ... null`**

`next.config.mjs`'deki `Referrer-Policy` **`no-referrer` olmamalı.**

Fetch spesifikasyonu gereği, referrer policy `no-referrer` olduğunda tarayıcı
GET/HEAD dışındaki isteklerde `Origin` başlığını **`null`** gönderir. Server
Actions POST kullandığı için Next'in CSRF kontrolü bu isteği reddeder — yani
paneldeki hiçbir form çalışmaz.

Doğru değer `same-origin`: gizlilik açısından neredeyse aynı korumayı verir
(dış sitelere referrer sızmaz) ama kendi origin'imize yapılan isteklerde
`Origin` başlığı doğru gönderilir. Repoda zaten böyle ayarlı.

> `ALLOWED_ORIGINS` bu hatayı **çözmez** — Next, `origin` değerini listeyle
> karşılaştırır ve `null` hiçbir listede yer almaz. `ALLOWED_ORIGINS` farklı
> bir sorun içindir (aşağı bak).

**Ters vekil arkasında "Invalid Server Actions request"**

Dıştaki alan adı ile içteki host farklı olduğunda gerekir. `.env`'e ekle:

```
ALLOWED_ORIGINS=admin.kays.com.tr
```

LAN IP ile geliştirme yapıyorsan:

```
ALLOWED_ORIGINS=localhost:3000,127.0.0.1:3000,192.168.1.3:3000
ALLOWED_DEV_ORIGINS=192.168.1.3,localhost,127.0.0.1
```

> ★ Buraya sadece **kendi kontrolündeki** adresleri yaz. Tanımadığın bir
> alan adı eklemek, o siteden gelen isteklerin senin oturumunla panelde
> işlem yapmasına izin verir — korumanın amacı tam olarak bunu engellemek.

**"Supabase bağlantısı kurulamadı"**
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` hatalı ya da `popups` tablosu yok.

**Audit sayfası hata veriyor**
`sql/admin_panel_setup.sql` çalıştırılmamış.

---

## 7. Yapı

```
src/
├── proxy.ts                  # Yetki katmanı 1 (her istek)
├── lib/
│   ├── auth.ts               # bcrypt, JWT, rate limit, sabit zamanlı karşılaştırma
│   ├── session.ts            # Yetki katmanı 2 (server component/action)
│   ├── supabase-admin.ts     # service_role istemcisi (sunucu-only guard'lı)
│   ├── audit.ts              # İşlem kaydı
│   ├── types.ts
│   └── utils.ts
├── actions/                  # Server action'lar (tüm yazma işlemleri)
│   ├── auth.actions.ts
│   ├── popup.actions.ts
│   └── notification.actions.ts
├── app/
│   ├── login/                # Server component (searchParams await)
│   ├── (dashboard)/          # Korumalı alan
│   │   ├── page.tsx          # Genel bakış
│   │   ├── popups/           # Liste · yeni · düzenle
│   │   ├── notifications/    # Broadcast + geçmiş
│   │   └── audit/            # İşlem kaydı
│   └── api/health/           # Docker HEALTHCHECK (auth'suz, bilgi sızdırmaz)
└── components/
    ├── ui/                   # Temel bileşenler (harici kütüphane yok)
    ├── LoginForm.tsx
    ├── Sidebar.tsx           # Masaüstü yan panel + mobil alt sekme
    ├── PopupForm.tsx         # 30+ alan, koşullu gösterim
    ├── PopupPreview.tsx      # Canlı telefon önizlemesi
    ├── PopupList.tsx
    ├── PopupActions.tsx
    ├── BroadcastForm.tsx     # Zorunlu sayım + iki aşamalı onay
    └── BroadcastHistory.tsx

sql/admin_panel_setup.sql     # Audit tablosu + 7 RPC
```

---

## 8. Yeni modül ekleme

Panel ileride başka yönetim işleri için genişletilebilir:

1. `src/app/(dashboard)/yeni-modul/page.tsx` oluştur
2. `src/components/Sidebar.tsx` içindeki `NAV` dizisine bir satır ekle
3. Yazma işlemleri için `src/actions/yeni-modul.actions.ts` — **ilk satırda `assertSession()`**

Yetki koruması otomatik gelir (`proxy.ts` kara liste kullanıyor, beyaz liste değil).

---

## 9. Notlar

**`PopupPreview` mobil koddan bağımsız bir kopyadır.** Mobil taraftaki
`PopupModal.tsx`'in görünümünü değiştirirsen buradaki renk/boyut
değerlerini de güncelle, yoksa önizleme yanıltıcı olur.

**Rate limit bellek içidir.** Tek instance için yeterli; çoklu instance'a
geçerseniz Redis'e taşınması gerekir.

**`outputFileTracingRoot` silinmemeli.** `next.config.mjs`'deki bu ayar,
standalone çıktısının düz (`.next/standalone/server.js`) olmasını sağlıyor.
Kaldırılırsa çıktı iç içe klasörde oluşur ve Docker'daki
`CMD ["node", "server.js"]` "Cannot find module" hatası verir.
