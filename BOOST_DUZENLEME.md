# Boost tam düzenleme + mail şablonu sorunu

## 1. 🔴 Mail şablonu — sebebini buldum

**Sen haklıydın, değişiklikler devreye girmiyordu.**

Kodun mantığı şu:

```
default_template DOLU  → onu kullan
default_template BOŞ   → koddaki güncel varsayılanı üret
```

Veritabanında **eski şablon kayıtlıydı**. Ben kodu değiştirdim ama
DB'deki değer kazanıyordu. Yeni tasarım hiç çalışmadı.

### Çözüm

`sql/mail_sablon_magaza.sql` sonuna eklendi:

```sql
-- Önce yedekle (fikrini değiştirirsen geri alabilesin)
alter table mail_settings add column if not exists default_template_yedek text;
update mail_settings set default_template_yedek = default_template ...

-- Sonra temizle
update mail_settings set default_template = null where id = 1;
```

★ Alanı `null` yapmak "şablon yok" demek değil — **"koddaki güncel
varsayılanı kullan"** demek.

★ Eski şablon `default_template_yedek` kolonunda duruyor. Geri almak
istersen:
```sql
update mail_settings set default_template = default_template_yedek where id = 1;
```

### Panelde de düğme var

Ayarlar → Mail → Şablon alanının yanında **"Varsayılana dön"**.
Alanı temizliyor, kaydedince yeni tasarım devreye giriyor.

---

## 2. Boost tam düzenleme ✅

Eskiden sadece fiyat değiştirilebiliyordu. Artık:

| Alan | Durum |
|---|---|
| Öne çıkarılan içerik | ✓ tür + kayıt seçimi |
| Seviye | ✓ Öne Çıkar / Süper |
| Aylık fiyat | ✓ taban denetimli |
| Süre | ✓ 1 / 2 / 3 / 6 / 12 ay |
| Durum | ✓ altı durum |
| Red sebebi | ✓ durum "reddedildi" ise |
| Not | ✓ |
| Süreyi yeniden başlat | ✓ |
| **Silme** | ✓ |

### İçerik değişimi güvenli

Tür değişince talep sahibinin o türdeki kayıtları listeleniyor,
görselli kartlardan seçiliyor.

★ **Sunucu tarafında sahiplik yeniden doğrulanıyor:**
```ts
if (String(icerik.user_id) !== String(mevcut.user_id)) {
  return { ok: false, error: "Bu içerik talep sahibine ait değil." }
}
```
Panelden bile olsa yanlışlıkla başkasının ilanı öne çıkarılamıyor.

### Tarih tutarlılığı

| Durum | Davranış |
|---|---|
| "Yeniden başlat" işaretli | Başlangıç bugün, bitiş +N ay |
| Pasiften aktife geçiş | Tarihler otomatik yazılıyor |
| Sadece süre değişti | Başlangıç korunuyor, bitiş kaydırılıyor |

Yoksa "3 aya çıkardım ama bitiş tarihi eski kaldı" durumu oluşurdu.

### Silme

★ Aktifse **önce pasife alınıp** `boost_apply_flags` çağrılıyor, sonra
siliniyor. Doğrudan silmek içerik üzerindeki boost bayrağını bırakırdı
— ilan listede öne çıkmış görünmeye devam ederdi.

İki yerden erişilebiliyor: kapalı paneldeki "Sil" ve açık paneldeki
sağ alt "Sil". İkisi de onay istiyor.

---

## Kurulum

**1. SQL** (şablon temizliği burada):
```
sql/mail_sablon_magaza.sql
```

Sonundaki doğrulama şunu demeli:
```
sablon_durumu: BOS — koddaki guncel varsayilan kullanilacak
```

**2. Panel:**
```bash
npm install && npm run build && npm start
```

**3. Test:** kendine bir mail gönder. Yeni tasarımı görmelisin —
yuvarlak köşeli kart, logo, altta mağaza düğmeleri.

Mağaza düğmeleri görünmüyorsa **Ayarlar → Mail → Marka ve mağaza**
kısmındaki App Store / Play Store adreslerini doldur. Boşsa düğme
basılmıyor.

---

## Denetim

```
✓ tsc --noEmit temiz
✓ next build başarılı
✓ SQL $$ blokları dengeli (8)
```

## Değişen dosyalar

```
src/components/BoostEditPanel.tsx     ♻️ tam düzenleme + silme
src/actions/ad.actions.ts             ♻️ updateBoostAction genişletildi
                                         deleteBoostAction eklendi
src/components/MailSettingsPanel.tsx  ♻️ "Varsayılana dön" düğmesi
src/app/(dashboard)/reklamlar/boost/[id]/page.tsx  ♻️ yeni props
sql/mail_sablon_magaza.sql            ♻️ eski şablon temizliği
```
