# Şablon neden uygulanmadı + tam boost düzenleme

## 1. Mail şablonu — sebebi buldum

**Yerel/uzak farkı değil.** Şablon seçimi kodda şöyle:

```ts
s.default_template?.trim() || varsayilanSablon(...)
```

Veritabanında **eski bir şablon kayıtlıysa** yeni varsayılan **hiç
devreye girmiyor**. Panelde bir kez şablon kaydettiysen (ya da kurulum
SQL'i bir tane yazdıysa) o kullanılıyor.

### Kontrol

```sql
select
  case when coalesce(trim(default_template), '') = ''
       then 'VARSAYILAN kullanılıyor'
       else 'ÖZEL şablon kayıtlı (' || length(default_template) || ' karakter)'
  end as sablon_durumu
from mail_settings where id = 1;
```

### Çözüm — üç yol

**a) Panelden (en kolay)**

Ayarlar → Mail → Şablon bölümünde artık bir durum kutusu var:

```
┌──────────────────────────────────────────────────────┐
│ [Özel şablon aktif]  Aşağıdaki şablon kullanılıyor.  │
│                      [Varsayılana dön]  [Önizle]     │
└──────────────────────────────────────────────────────┘
```

"Varsayılana dön" → kayıtlı şablon siliniyor, yeni tasarım devreye
giriyor.

**b) SQL ile**
```sql
update mail_settings set default_template = null where id = 1;
```

**c) Şablon alanını panelde boşaltıp kaydet**

### Önizleme

"Önizle" düğmesi şablonu **yeni sekmede** açıyor — logolar, mağaza
düğmeleri ve karanlık mod hepsi gerçek hâliyle görünüyor.

> Neden iframe değil: iframe içinde `prefers-color-scheme` medya
> sorgusu doğru tetiklenmiyor, karanlık mod görünümü kaybolurdu.

Kutu hangi şablonun aktif olduğunu **açıkça** söylüyor — bir daha
"uygulandı mı?" diye tahmin etmene gerek yok.

---

## 2. Boost düzenleme artık tam ✅

Eskiden sadece fiyat değiştirilebiliyordu. Şimdi:

| Alan | Durum |
|---|---|
| Aylık fiyat | ✓ taban fiyat denetimli |
| **Süre (ay)** | ✓ 1 · 2 · 3 · 6 · 12 |
| **Seviye** | ✓ Öne Çıkar ↔ Süper Öne Çıkar |
| **Durum** | ✓ altı durum arası geçiş |
| **Not** | ✓ |
| **Süreyi uzat** | ✓ +7 / +15 / +30 / +90 gün |
| **Yeniden başlat** | ✓ bugünden itibaren |

### Süreyi uzat — tek tıkla

En sık yapılan iş olduğu için formu doldurmadan:

```
Süreyi uzat
Mevcut bitişe ekleniyor. Süre dolmuşsa bugünden sayılıyor.

[+7 gün] [+15 gün] [+30 gün] [+90 gün]

Şu anki bitiş: 14 Eylül 2026
```

★ **Süre dolmuşsa bugünden sayıyor.** Mevcut bitişe eklemek, süresi
geçmiş bir kayıtta "10 gün ekle" dediğinde hâlâ dolmuş bırakıyordu.

### Durum değişiminde tutarlılık

| Geçiş | Ne oluyor |
|---|---|
| → Aktif (tarih yoksa) | Bugünden başlatılıyor, bitiş = bugün + süre |
| → Reddedildi | Yayın tarihleri temizleniyor |

Yoksa "aktif ama bitiş tarihi yok" gibi tutarsız kayıtlar oluşuyordu.
Değişiklik kaydedilmeden önce uyarı kutusunda gösteriliyor.

### İçerik neden düzenlenmiyor

Öne çıkarılan şey kullanıcının kendi ilanı/indirimi/etkinliği. Başka
bir içeriğe geçirmek **yeni bir talep** demek — mevcut kaydın teklif
geçmişini ve istatistiğini bozar. Bilinçli olarak dışarıda bıraktım.

---

## Denetim

```
✓ tsc --noEmit temiz
✓ next build başarılı
✓ SQL $$ blokları dengeli (8)
```

## Değişen dosyalar

```
src/components/BoostEditPanel.tsx     ♻️ tam düzenleme
src/components/MailSettingsPanel.tsx  ♻️ şablon durumu + önizleme
src/actions/ad.actions.ts             ♻️ updateBoostAction genişletildi
src/actions/mail.actions.ts           ♻️ previewMailTemplate, resetMailTemplate
src/app/(dashboard)/reklamlar/boost/[id]/page.tsx  ♻️ tüm alanlar aktarılıyor
sql/mail_sablon_magaza.sql            ♻️ şablon durumu sorgusu
```

## Kurulum

```bash
npm install && npm run build && npm start
```

Sonra: **Ayarlar → Mail → Şablon → "Varsayılana dön"**
