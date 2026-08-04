// src/lib/push-text.ts
//
// ┌─ BU DOSYA NE YAPIYOR ─────────────────────────────────────────────┐
// │                                                                    │
// │ Bir bildirim satırını (type, actor, message…) telefonda görünecek  │
// │ BAŞLIK + GÖVDE metnine çevirir. Ayrıca bildirime basıldığında      │
// │ açılacak uygulama içi adresi (route) üretir.                       │
// │                                                                    │
// └────────────────────────────────────────────────────────────────────┘
//
// ┌─ DİKKAT — İKİ YERDE AYNI MANTIK VAR ──────────────────────────────┐
// │ Mobil uygulamadaki `src/utils/notificationHelpers.ts` dosyası      │
// │ bildirim LİSTESİ metinlerini üretiyor. Burası PUSH metinlerini.    │
// │                                                                    │
// │ Bilinçli olarak ayrı: push metni daha kısa olmalı (bildirim        │
// │ balonuna sığmalı) ve başlık ayrı bir alan. Ama tipler AYNI —       │
// │ mobilde yeni bir bildirim tipi eklersen BURAYA DA eklemelisin,     │
// │ yoksa push'ta "Yeni bildirim" gibi genel bir metin görünür.        │
// │                                                                    │
// │ Yönlendirme (route) mantığı da mobildeki `getNotificationRoute`    │
// │ ile eşleşmeli — orada değişiklik yaparsan burayı da güncelle.      │
// └────────────────────────────────────────────────────────────────────┘

export interface PushSource {
  type: string
  message?: string | null
  entity_type?: string | null
  entity_id?: string | null
  secondary_id?: string | null
  actor_username?: string | null
}

export interface PushText {
  title: string
  body: string
}

/* ═══════════════════════════════════════════════════════════════
   BAŞLIK + GÖVDE
   `fallbackTitle` push_settings.title_template'ten gelir; boşsa
   burada üretilen varsayılan kullanılır.
═══════════════════════════════════════════════════════════════ */

export function buildPushText(row: PushSource, fallbackTitle?: string | null): PushText {
  const who = row.actor_username?.trim() || "Biri"
  const title = fallbackTitle?.trim() || "Kays"

  switch (row.type) {
    case "follow":
      return { title, body: `${who} seni takip etmeye başladı` }
    case "follow_request":
      return { title, body: `${who} seni takip etmek istiyor` }
    case "follow_accepted":
      return { title, body: `${who} takip isteğini kabul etti` }

    case "post_like":
      return { title, body: `${who} gönderini beğendi` }
    case "comment_like":
      return { title, body: `${who} yorumunu beğendi` }
    case "post_comment":
      return { title, body: `${who} gönderine yorum yaptı` }
    case "post_comment_reply":
      return { title, body: `${who} yorumuna yanıt verdi` }

    case "tag":
      return { title, body: `${who} seni bir gönderide etiketledi` }
    case "mention":
      if (row.entity_type === "event") return { title, body: `${who} bir etkinlik yorumunda senden bahsetti` }
      if (row.entity_type === "discount") return { title, body: `${who} bir indirim yorumunda senden bahsetti` }
      return { title, body: `${who} senden bahsetti` }

    case "message":
      // ★ Mesaj içeriğini push'a KOYMUYORUZ. Kilit ekranında görünür
      //   ve mahremiyet ihlali olur. Sadece kimin yazdığını söylüyoruz.
      return { title, body: `${who} sana mesaj gönderdi` }

    case "event_join":
      return { title, body: `${who} etkinliğine katıldı` }
    case "event_comment":
      return { title, body: `${who} etkinliğine yorum yaptı` }
    case "event_comment_reply":
      return { title, body: `${who} etkinlik yorumuna yanıt verdi` }
    case "event_ticket":
      return { title, body: "Etkinlik biletin hazır — QR kodunu görmek için dokun" }

    case "discount_join":
      return { title, body: `${who} indirimine katıldı` }
    case "discount_comment":
      return { title, body: `${who} indirimine yorum yaptı` }
    case "discount_comment_reply":
      return { title, body: `${who} indirim yorumuna yanıt verdi` }
    case "discount_ticket":
      return { title, body: "İndirim biletin hazır — QR kodunu görmek için dokun" }

    case "listing_favorite":
      return { title, body: `${who} ilanını favorilere ekledi` }

    case "account_ban":
      return { title, body: row.message?.trim() || "Hesabınla ilgili bir bildirim var" }

    // Panelden gönderilenler: mesaj metni doğrudan kullanılır
    case "promo":
    case "popup":
      return { title, body: row.message?.trim() || "Yeni bir duyuru var" }
    case "earthquake":
      return { title: fallbackTitle?.trim() || "ACİL UYARI", body: row.message?.trim() || "Deprem uyarısı" }

    default:
      // Bilinmeyen tip — mobilde eklenmiş ama buraya yazılmamış olabilir
      return { title, body: row.message?.trim() || "Yeni bir bildirimin var" }
  }
}

/* ═══════════════════════════════════════════════════════════════
   YÖNLENDİRME
   Bildirime basıldığında açılacak uygulama içi adres.
   ★ Mobildeki `getNotificationRoute` ile AYNI olmalı.
═══════════════════════════════════════════════════════════════ */

export function buildPushRoute(row: PushSource): string | null {
  const id = row.entity_id
  const sid = row.secondary_id

  if (row.type === "event_ticket" && id) return `/etkinlikler/${id}/qr`
  if (row.type === "discount_ticket" && id) return `/indirimler/${id}/qr`
  if (row.type === "event_join" && id) return `/etkinlikler/${id}/katilimcilar`
  if (row.type === "discount_join" && id) return `/indirimler/${id}/katilimcilar`
  if (row.type === "follow_request") return `/istekler`
  if (row.type === "post_like" && id) return `/postid/${id}?openLikes=1`

  // Yorum bazlı: yorumlar sheet'i açılsın, ilgili yorum vurgulansın
  if ((row.type === "post_comment" || row.type === "post_comment_reply" || row.type === "comment_like") && id) {
    return sid ? `/postid/${id}?openComments=1&highlight=${sid}` : `/postid/${id}?openComments=1`
  }

  if (row.type === "mention" && row.entity_type === "post" && id) {
    return sid ? `/postid/${id}?openComments=1&highlight=${sid}` : `/postid/${id}`
  }

  switch (row.entity_type) {
    case "post":         return id ? `/postid/${id}` : null
    case "event":        return id ? `/etkinlikler/${id}` : null
    case "discount":     return id ? `/indirimler/${id}` : null
    case "listing":      return id ? `/ilan/${id}` : null
    case "conversation": return id ? `/messages/${id}` : null
    case "profile":      return row.actor_username ? `/${row.actor_username}` : null
    // Popup: navigasyon yok, uygulama popup'ı açıyor
    case "popup":        return null
    default:             return null
  }
}

/* ═══════════════════════════════════════════════════════════════
   PUSH `data` ALANI
   Uygulama bildirime basıldığında bunu okuyup ilgili ekrana gider.
   ★ 4KB sınırı var — sadece gerekli alanları koyuyoruz.
═══════════════════════════════════════════════════════════════ */

export function buildPushData(row: PushSource, notificationId?: string | null) {
  const route = buildPushRoute(row)
  return {
    type: row.type,
    notification_id: notificationId ?? null,
    entity_type: row.entity_type ?? null,
    entity_id: row.entity_id ?? null,
    secondary_id: row.secondary_id ?? null,
    // Uygulama bunu okuyup router.push(route) yapabilir
    route: route ?? null,
  }
}
