# Mail — medya seçici, toplu gönderim, yeni şablon

## Önce SQL

```
sql/mail_sablon_magaza.sql
```

Sonra:
```bash
npm install && npm run build && npm start
```

---

## 1. Medya seçici popup ✅

`window.prompt("Görsel adresi:")` gitti. Yerine kendi popup'ımız:

```
┌─ Görsel seç ──────────────────────────┐
│  [ ara…                    ] [ Ara ]  │
│                                        │
│  ▢ ▢ ▢ ▢   ← medya kütüphanesi        │
│  ▢ ▢ ▢ ▢      (sadece görseller)      │
│                                        │
│           [Vazgeç]  [Yeni yükle]      │
└────────────────────────────────────────┘
```

- Kütüphanedeki görseller ızgara hâlinde, tıklayınca ekleniyor
- "Yeni yükle" ile buradan da yüklenebiliyor — yüklenen dosya
  kütüphaneye giriyor, bir daha aranmıyor
- Yükledikten sonra **doğrudan ekleniyor**, ikinci tıklama yok

★ Sadece `image/*` gösteriliyor — mail gövdesine PDF gömülmez.

## 2. Bağlantı ve buton popup'ı ✅

Yine `prompt` yerine kendi modalımız. İki alan: görünen yazı + adres,
`https://` doğrulamalı.

★ Seçili metin varsa onu bağlantıya çeviriyor, yoksa yeni metin
ekliyor — iki durum da doğru çalışıyor.

★ Buton artık `<table>` ile üretiliyor. Outlook `<a>` üstündeki
`padding`'i yok sayıyor; tablo hücresi her istemcide çalışıyor.

## 3. Toplu mail ✅ 🆕

**Mail → Toplu mail** (`/mail/toplu`)

```
┌─ 1. Kimlere gidecek ──────────────────────┐
│  Şehir ▾    Hesap türü ▾    Doğrulama ▾   │
│                                            │
│  ┌────────────────────────────────────┐   │
│  │  1.247  alıcıya gidecek            │   │
│  └────────────────────────────────────┘   │
│                                            │
│  Ek adresler: [                       ]   │
└────────────────────────────────────────────┘

┌─ 2. Mail içeriği ─────────────────────────┐
│  Konu · HTML/Metin · İçerik · Şablon      │
└────────────────────────────────────────────┘

┌─ 3. Gönder ───────────────────────────────┐
│  [Gönder] → onay adımı → kuyruğa          │
└────────────────────────────────────────────┘
```

**Filtreler:** şehir (Karabük, İstanbul…), hesap türü (işletme /
bireysel), e-posta doğrulaması.

★ **Alıcı sayısı canlı** — filtre değişince 350 ms sonra güncelleniyor.
"Karabük + işletme = 34 kişi" göndermeden önce görünüyor. Her tuşta
sunucuya gitmiyor.

★ **Şehir listesi gerçek veriden** — sabit liste değil, sadece
kullanıcısı olan şehirler çıkıyor.

★ **Onay adımı** — kaç kişiye gideceği tekrar gösterilip
onaylatılıyor. Toplu mail geri alınamaz.

★ Banlı kullanıcılar ve e-postasız hesaplar otomatik eleniyor.
Tekrar eden adresler teke indiriliyor.

★ **Kuyruğa yazılıyor, anında gönderilmiyor.** 2000 kişiye tek istekte
mail atmak hem zaman aşımına uğrar hem SMTP sunucusunu tetikler.
500'lük parçalar hâlinde `mail_outbox`'a yazılıyor.

## 4. Gönderdikten sonra listeye dönüş ✅

Tekil ve toplu, ikisi de `/mail?sekme=outbox`'a yönlendiriyor.
Formda kalmak "gitti mi?" sorusunu doğuruyordu.

## 5. İlet ✅ 🆕

Mail detayında **İlet** düğmesi. Konuya `Ilt:` ekleniyor, özgün mail
sol çizgiyle alıntılanıyor, alıcı boş bırakılıyor.

**Yanıtla** da geliştirildi — artık gövdeyi de alıntılıyor.

## 6. Gövde yüksekliği — gerçekten düzeldi ✅

Önceki denememde sarmalayıcıya `min-h-[70vh]` vermiştim ama **işe
yaramadı**: iframe kendi ölçtüğü içerik yüksekliğini `style.height`
ile dayatıyor ve sarmalayıcının içinde küçük kalıyordu.

Taban artık **iframe'in kendi yüksekliğine** uygulanıyor:

```tsx
<MailBodyFrame minYukseklik={640} />
```

```ts
setYukseklik(Math.min(Math.max(h + 8, minYukseklik ?? 0), MAX))
```

## 7. Yeni varsayılan şablon ✅

`src/lib/mail-sablon.ts`

**Karanlık mod uyumlu:**
```css
@media (prefers-color-scheme: dark) {
  .ki-zemin { background:#000 !important; }
  .ki-kart  { background:#1c1c1e !important; }
  .ki-acik  { display:none !important; }
  .ki-koyu  { display:block !important; }
}
```

**Logo URL ile** — path değil. İki tema için iki görsel:

| Tema | Görsel |
|---|---|
| Aydınlık | `https://kays.business/kays.png` |
| Karanlık | `https://kays.business/kays1.png` |

**Mağaza düğmeleri** altta: App Store + Google Play. Adresler
**panel ayarlarından** geliyor, şablonda gömülü değil. Adres boşsa o
düğme hiç basılmıyor — çalışmayan bağlantı göstermek kötü.

**Tasarım:** tek sütun, 600px, bol boşluk, 18px yuvarlak köşeli kart,
Apple sistem fontu.

> **Mail HTML'i neden `<table>` ile yazılıyor:** Outlook flexbox ve
> grid desteklemiyor, Gmail `<style>` bloğunu atıyor. Stiller satır
> içi; `<style>` yine de var çünkü medya sorgusu sadece orada
> yazılabiliyor — karanlık mod için şart. "Modern CSS yaz" seçeneği yok.

### Ayarlar → Mail → Marka ve mağaza

| Alan | Not |
|---|---|
| Logo — aydınlık | Tam URL |
| Logo — karanlık | Koyu zeminde okunan sürüm |
| App Store adresi | Boşsa düğme yok |
| Play Store adresi | Boşsa düğme yok |
| Site adresi | Alt bilgide |
| Marka adı | "… tarafından gönderildi" |

★ Şablon alanını **boş bırakırsan** varsayılan otomatik kullanılıyor.

---

## Denetim

```
✓ tsc --noEmit temiz
✓ next build başarılı
✓ window.prompt kalmadı
✓ SQL $$ blokları dengeli (8)
```

## Yeni dosyalar

```
src/components/MediaPicker.tsx        🆕 medya + bağlantı popup'ı
src/components/MailBulkForm.tsx       🆕 toplu mail
src/lib/mail-sablon.ts                🆕 varsayılan şablon
src/app/(dashboard)/mail/toplu/page.tsx 🆕
sql/mail_sablon_magaza.sql            🆕
```

## Değişen dosyalar

```
src/components/MailComposer.tsx       ♻️ popup'lar, yanıt/ilet, yönlendirme
src/components/MailDetailView.tsx     ♻️ İlet düğmesi, gövde yüksekliği
src/components/MailBodyFrame.tsx      ♻️ minYukseklik desteği
src/components/MailSettingsPanel.tsx  ♻️ marka ve mağaza alanları
src/actions/mail.actions.ts           ♻️ toplu mail + şablon bağlama
src/lib/mailer.ts                     ♻️ MailSettings genişletildi
src/app/(dashboard)/mail/page.tsx     ♻️ toplu mail düğmesi
src/app/(dashboard)/mail/yaz/page.tsx ♻️ yanıt/ilet hazırlığı
```
