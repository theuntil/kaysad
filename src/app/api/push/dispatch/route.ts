// src/app/api/push/dispatch/route.ts
//
// ┌─ BU ENDPOINT NE YAPIYOR ──────────────────────────────────────────┐
// │ notifications tablosuna satır düştüğünde DB trigger (pg_net) bu    │
// │ adrese POST atar. Biz de kuyruğu işleyip Expo'ya gönderiyoruz.     │
// │                                                                    │
// │ Not: gelen `notification_id` sadece log için — tek tek işlemek     │
// │ yerine kuyruğun tamamını işliyoruz. Sebep: aynı anda 10 beğeni     │
// │ gelirse 10 ayrı istek yerine tek işlemede hepsi gider (Expo'nun    │
// │ 100'lük gruplama avantajını kullanır).                              │
// └────────────────────────────────────────────────────────────────────┘
//
// ┌─ GÜVENLİK ────────────────────────────────────────────────────────┐
// │ Oturum cookie'si YOK (çağıran PostgreSQL). x-push-secret başlığı   │
// │ ile doğrulanıyor. Secret tanımlı değilse tüm istekler reddedilir.  │
// └────────────────────────────────────────────────────────────────────┘

import { NextResponse, type NextRequest } from "next/server"
import { verifyPushWebhook } from "@/lib/push-webhook"
import { processPendingPush } from "@/actions/push.actions"
import { drainMailQueue } from "@/actions/mail.actions"
import { drainStorageCleanup } from "@/actions/library.actions"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = verifyPushWebhook(req)
  if (!auth.ok) {
    console.warn("[push/dispatch] reddedildi:", auth.reason)
    return NextResponse.json({ ok: false, error: "yetkisiz" }, { status: 401 })
  }

  // ★ Aynı uyandırmada mail kuyruğunu ve storage temizliğini de işliyoruz.
  //   Ayrı cron kurmak yerine tek tetiklemeye bindirdik; hata olursa
  //   push sonucunu ETKİLEMİYOR (void + catch).
  void drainMailQueue(20).catch(() => null)
  void drainStorageCleanup(50).catch(() => null)

  let notificationId: string | null = null
  try {
    // ★ V4: trigger artık belirli bir bildirim değil "kuyruğu boşalt"
    //   komutu gönderiyor ({ drain: true }). Eski {notification_id}
    //   biçimi de çalışmaya devam ediyor.
    const body = await req.json().catch(() => ({}))
    notificationId = body?.notification_id ?? null
  } catch {
    // gövde okunamadıysa sorun değil, kuyruğu yine işleriz
  }

  const res = await processPendingPush({
    source: "auto",
    skipAuth: true,
    sentBy: "trigger",
    limit: 200,
  })

  console.log("[push/dispatch]", { notificationId, ...res })

  return NextResponse.json(
    { ok: res.ok, islenen: res.islenen ?? 0, gonderilen: res.gonderilen ?? 0, error: res.error },
    { status: res.ok ? 200 : 500 }
  )
}
