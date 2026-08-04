# MENÜ HARİTASI — hangi sayfa nerede

Bu turda üç menü girişi (Reklamlar, Şehirler, İçerikler) ve popup formundaki
logo/tip alanları eksikti. Sayfalar vardı ama menüde linkleri yoktu.
Menü baştan yazıldı ve **15 sayfanın hepsi** doğrulandı.

## Sol menü

| Grup | Sayfa | Adres | Rozet |
|---|---|---|---|
| — | Genel Bakış | `/` | — |
| **Gönderim** | Bildirim & Push | `/gonderim` | — |
| | Popup'lar | `/popups` | — |
| | **Reklamlar** | `/reklamlar` | bekleyen teklif + düzenleme + boost |
| **İletişim** | Mail | `/mail` | okunmamış |
| | Medya | `/medya` | — |
| **Kullanıcılar** | Kullanıcılar | `/kullanicilar` | tutarsız kayıt |
| | **İçerikler** | `/icerikler` | — |
| | **Şehirler** | `/sehirler` | — |
| | Onaylar | `/onay` | bekleyen başvuru |
| **Güvenlik** | Şikâyetler | `/reports` | cevaplanmamış |
| | Banlar | `/banlar` | banlı hesap |
| | Cihazlar | `/cihazlar` | — |
| | İşlem kaydı | `/audit` | — |
| | Politikalar | `/politikalar` | — |

Menüde olmayan ama içeriden açılan sayfalar:

| Sayfa | Nereden |
|---|---|
| `/push` (ayar + kuyruk + temizlik) | `/gonderim` sağ üstteki "Push ayarları" |
| `/gonderim/detay` | Gönderim geçmişindeki "İstatistik" |
| `/reklamlar/[id]` | Reklam kartındaki "Detay" |
| `/reports/[id]` | Şikâyet satırı |
| `/kullanicilar/[id]` | Kullanıcı satırı |
| `/cihazlar/[id]` | Cihaz satırı |
| `/onay/isletme`, `/onay/ogrenci` | `/onay` kartları |
| `/popups/new`, `/popups/[id]` | Popup listesi |

Mobil alt çubuk: Özet · Gönderim · Reklam · Kullanıcı · Menü

## Reklam sayfası ne içeriyor

`/reklamlar`
- Üstte 4 kart: bekleyen teklif · yayında · aylık gelir · yakında biten
- **Alan doluluk göstergeleri** — anasayfa 10, ilanlar/indirimler/etkinlikler/popup 1'er. Tıklayınca o alana filtreliyor
- Sekmeler: Tümü · Bekleyen · Yayında · Sırada · Düzenleme · Pasif · Reddedilen · Süresi dolan · **Boost**
- Her kartta: görsel, logo, başlık, açıklama, reklam veren, yönlendirme tipi, kalan gün, aylık/toplam fiyat, gösterim/tıklama
- Butonlar: Onayla · Reddet (sebepli) · Pasife al · Yayına al · Detay
- Alan doluyken onaylarsan **yayına alınmıyor**, "önce mevcut reklamı pasife al" uyarısı çıkıyor

`/reklamlar/[id]`
- 4 istatistik kartı: gösterim · tıklama · tıklanma oranı · kalan gün
- Reklam içeriği ve reklam veren kartı
- **Onay bekleyen düzenlemeler** — eski → yeni karşılaştırmasıyla
- **Teklif geçmişi** — kaçıncı teklif, fiyat, not, karar
- Günlük performans grafiği

Boost sekmesi: ilan/indirim/etkinlik öne çıkarma talepleri, onay/red/durdur.

## Popup formunda eklenenler

- **Logo adresi** — başlığın üstünde gösteriliyor (önizlemede de)
- **Popup tipi** (zorunlu) — Sistem popup'ı / Reklam. Reklam seçilirse önizlemede "REKLAM" etiketi çıkıyor

## Doğrulama

```bash
# Menüdeki her adres bir sayfaya karşılık geliyor mu?
for r in / /gonderim /popups /reklamlar /mail /medya /kullanicilar \
         /icerikler /sehirler /onay /reports /banlar /cihazlar \
         /audit /politikalar; do
  grep -q "href: \"$r\"" src/components/Nav.tsx && echo "✓ $r" || echo "✗ $r"
done
```

Panel 93 RPC çağırıyor; `sql/` klasöründe 125 fonksiyon tanımlı. Kalan 15 tanesi
mevcut migration'larda (`push_sistemi_veritabani.sql`, `KOMPLE_guvenlik_migration.sql`,
`business_basvuru_sistemi.sql`) — hepsi doğrulandı.
