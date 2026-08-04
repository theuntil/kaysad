// src/app/api/push/sweep/route.ts
//
// ┌─ BU ENDPOINT NE YAPIYOR ──────────────────────────────────────────┐
// │ YEDEK KATMAN. pg_cron her dakika bu adrese POST atar.              │
// │                                                                    │
// │ Neden gerekli: trigger anında tetikler ama panel o an kapalıysa,   │
// │ ağ koptuysa veya hata olduysa bildirim kuyrukta kalır. Sweep       │
// │ bunları yakalar — hiçbir bildirim kaybolmaz.                        │
// │                                                                    │
// │ dispatch ile aynı işi yapar, tek fark log'da source='sweep'        │
// │ görünmesi (hangi yolla gittiğini ayırt etmek için).                │
// └────────────────────────────────────────────────────────────────────┘

import { NextResponse, type NextRequest } from "next/server"
import { verifyPushWebhook } from "@/lib/push-webhook"
import { processPendingPush } from "@/actions/push.actions"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = verifyPushWebhook(req)
  if (!auth.ok) {
    console.warn("[push/sweep] reddedildi:", auth.reason)
    return NextResponse.json({ ok: false, error: "yetkisiz" }, { status: 401 })
  }

  const res = await processPendingPush({
    source: "sweep",
    skipAuth: true,
    sentBy: "cron",
    limit: 300,
  })

  console.log("[push/sweep]", res)

  return NextResponse.json(
    { ok: res.ok, islenen: res.islenen ?? 0, gonderilen: res.gonderilen ?? 0, error: res.error },
    { status: res.ok ? 200 : 500 }
  )
}
