# MAİL VE TELEFON SERVİSLERİNİ PANELE BAĞLAMA

Panelden **Ayarlar → Alt sistemler** altındaki anahtarlar veritabanına yazılıyor.
İki Express servisin bu anahtarı okuyup kendini kapatması için aşağıdaki
değişikliği yapman yeterli. Kodu yeniden dağıtman gerekiyor, ama bir daha
anahtar değişince yeniden başlatmaya gerek kalmıyor.

---

## Ortak: servis kontrolü middleware'i

Her iki projede de `src/middleware/serviceGate.ts` adında yeni bir dosya aç:

```ts
// src/middleware/serviceGate.ts
import type { Request, Response, NextFunction } from "express"
import { supabase } from "../supabase"   // phone projesinde: "../ services/supabase"

const SERVICE = process.env.SERVICE_NAME ?? "mail"   // "mail" | "phone"

// ★ Her istekte veritabanına gitmemek için 30 saniye önbellek.
//   Paneli açıp anahtarı kapattığında en geç 30 saniyede etkili oluyor.
let cache: { value: boolean; at: number } | null = null
const TTL_MS = 30_000

async function isEnabled(): Promise<boolean> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value

  try {
    const { data, error } = await supabase.rpc("service_enabled", {
      p_service: SERVICE,
    })
    // ★ Hata olursa AÇIK kabul ediyoruz: veritabanı erişilemiyor diye
    //   çalışan servisi durdurmak daha kötü.
    const value = error ? true : data === true
    cache = { value, at: Date.now() }
    return value
  } catch {
    return true
  }
}

export async function serviceGate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (await isEnabled()) return next()

  return res.status(503).json({
    error: "SERVICE_DISABLED",
    message:
      SERVICE === "mail"
        ? "E-posta doğrulama servisi geçici olarak kapalı."
        : "Telefon doğrulama servisi geçici olarak kapalı.",
  })
}
```

`service_enabled()` fonksiyonu **bakım modunu da hesaba katıyor** — panel bakıma
alındığında iki servis de otomatik 503 döndürüyor.

---

## mail-main

### 1. `src/app.ts` (ya da `src/index.ts`)

```ts
import { serviceGate } from "./middleware/serviceGate"

// ...

// ★ Doğrulama rotalarının ÖNÜNE koy
app.use("/request-email-change", serviceGate, requestRouter)
app.use("/verify-email-change", serviceGate, verifyRouter)
```

### 2. `.env`

```env
SERVICE_NAME=mail
```

---

## phone-main

### 1. `src/app.ts`

```ts
import { serviceGate } from "./middleware/serviceGate"

app.use("/verification", serviceGate, verificationRouter)
```

### 2. `.env`

```env
SERVICE_NAME=phone
```

> `phone-main` projesindeki klasör adında boşluk var (`src/ services/`,
> `src/ middleware/`). Import yolunu ona göre yaz:
> `import { supabase } from "../ services/supabase"`

---

## Mobil uygulama tarafı

### Açılışta bakım ve sürüm kontrolü

```ts
const { data } = await supabase.rpc("app_status", {
  p_version: Application.nativeApplicationVersion,  // "1.2.0"
})

if (data.maintenance) {
  // Bakım ekranını göster
  showMaintenance(data.maintenance_message)
  return
}

if (data.update_required) {
  // Güncelleme ekranını göster
  showUpdate(data.update_message, Platform.OS === "ios"
    ? data.ios_store_url
    : data.android_store_url)
  return
}

// Servis anahtarlarına göre ilgili düğmeleri gizle
if (!data.services.phone) hidePhoneVerifyButton()
if (!data.services.mail)  hideEmailVerifyButton()
```

`app_status` **anon** rolüne açık — giriş yapılmadan da çağrılabiliyor.

### İçerik oluşturmadan önce sınır kontrolü

```ts
const { data } = await supabase.rpc("check_content_limit", {
  p_content_type: "listing",   // post | listing | discount | event
})

if (!data.allowed) {
  Alert.alert("Sınıra ulaşıldı", data.message)
  return
}

// data.used      → şu an kaç tane var
// data.limit     → sınır
// data.remaining → kalan hak
// data.limit_type → "daily" | "active"
// data.boosted   → kullanıcı boostlu mu
```

Profil ekranında dördünü birden almak için:

```ts
const { data } = await supabase.rpc("my_content_limits")
// { post: {...}, listing: {...}, discount: {...}, event: {...} }
```

---

## Sınır mantığı

| İçerik | Tip | Anlamı |
|---|---|---|
| Gönderi | **Günlük** | Bugün kaç gönderi paylaştı |
| İlan | **Aktif** | Şu an kaç açık ilanı var |
| İndirim | **Aktif** | Şu an kaç açık indirimi var (varsayılan: sadece işletme) |
| Etkinlik | **Aktif** | Şu an kaç açık etkinliği var |

Her içerik için **dört ayrı değer** var:

```
user              → standart kullanıcı
business          → işletme
boosted_user      → is_boosted = true olan kullanıcı
boosted_business  → is_boosted = true olan işletme
```

`profiles.is_boosted` alanı **true** olduğunda kullanıcı otomatik olarak
"boostlu" satırındaki sınırları alıyor. Bu alanı kullanıcı detay sayfasındaki
**Ayrıcalık** kutusundan açıp kapatabilirsin.

"Aktif" sayımı için panel şu kolonlardan ilkini kullanıyor:
`is_active` → `aktif` → `is_published` → `yayinda` → `status` → `durum`.
`status`/`durum` metin kolonlarında `deleted`, `expired`, `passive`,
`archived`, `silindi`, `pasif` değerleri sayılmıyor.

---

## Bakım modu

Panelden **Ayarlar → Bakım modu → Bakıma al**. Panel parolanı istiyor —
yanlışlıkla tıklamayla tüm uygulamayı kapatmak mümkün olmasın diye.

Bakım açıkken:
- `app_status().maintenance` → `true`
- `check_content_limit()` → `allowed: false, reason: "maintenance"`
- `service_enabled()` → tüm servisler için `false`

Yani mobil taraf tek bir kontrolle her şeyi kapatabiliyor.

---

## Doğrulama

```sql
-- Servis anahtarları
select service_enabled('mail')  as mail,
       service_enabled('phone') as phone,
       service_enabled('push')  as push;

-- Uygulama durumu (mobilin gördüğü)
select app_status('1.0.0');

-- Bir kullanıcının sınırları
select check_content_limit('<user-uuid>', 'listing');

-- Sınır tablosu
select * from content_limits order by content_type, role;
```
