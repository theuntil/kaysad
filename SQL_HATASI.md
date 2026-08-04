# `cannot change return type of existing function` — çözüldü

## Hata

```
ERROR: 42P13: cannot change return type of existing function
HINT: Use DROP FUNCTION admin_save_mail_settings(jsonb) first.
```

## Sebep — benim hatam

`admin_save_mail_settings` mevcut hâlde **güncellenen satırı**
döndürüyor:

```sql
create or replace function admin_save_mail_settings(p_patch jsonb)
returns mail_settings ...        -- ← mevcut
```

Ben yeniden yazarken `returns void` yapmışım. PostgreSQL
`create or replace` ile **dönüş tipini değiştirmeye izin vermiyor** —
o fonksiyonu çağıran her şey bozulabileceği için.

## Düzeltme

İki şey birden:

**1. Orijinal dönüş tipi korundu**

```sql
returns mail_settings
...
  where id = 1
  returning * into v_row;

  return v_row;
```

Panel kaydettikten sonra sunucudan tekrar okumadan güncel değerleri
gösterebiliyor — bu davranışı bozmamak gerekiyordu.

**2. Yine de `drop` eklendi**

```sql
drop function if exists admin_save_mail_settings(jsonb);
```

Tip aynı olduğu için teknik olarak gerekmiyor, ama dosya **tekrar
çalıştırılabilir** kalsın diye duruyor. İleride tip değişirse aynı
hataya düşülmüyor.

## Diğer fonksiyonları da kontrol ettim

Yeni SQL dosyalarındaki tüm `create or replace function`'ları eski
dosyalardaki aynı adlılarla karşılaştırdım:

```
✓ admin_mail_alicilar        drop var
✓ admin_mail_alici_sayisi    drop var
✓ admin_mail_sehirler        drop var
✓ admin_save_mail_settings   drop var  ← düzeltildi
✓ boost_track                drop var
✓ boost_stats                drop var
✓ ad_slot_status             drop var
✓ ad_update_price            drop var
✓ boost_update_price         drop var
✓ boost_slot_status          drop var
```

`trg_fn_ad_taban_fiyat` ve `trg_fn_boost_taban_fiyat` tetikleyici
fonksiyonu — `returns trigger`, yeni ve tip değişmiyor, sorun yok.

**Başka tip çakışması yok.**

---

## Şimdi çalıştır

```
sql/mail_sablon_magaza.sql
```

Sonundaki doğrulama sorgusu yeni kolonları göstermeli:

```sql
select app_store_url, play_store_url, logo_light_url, logo_dark_url,
       site_url, brand_name
from mail_settings where id = 1;
```

Sonra panel:
```bash
npm install && npm run build && npm start
```
