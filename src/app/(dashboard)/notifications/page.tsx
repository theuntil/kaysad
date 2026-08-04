// src/app/(dashboard)/notifications/page.tsx
//
// Eski "Bildirimler" sayfası artık /gonderim ile birleşti. Sayfayı
// silmiyoruz: tarayıcı geçmişinde, yer imlerinde ve eski linklerde bu
// adres duruyor — 404 yerine yeni sayfaya yönlendiriyoruz.

import { redirect } from "next/navigation"

export default function NotificationsRedirect() {
  redirect("/gonderim")
}
