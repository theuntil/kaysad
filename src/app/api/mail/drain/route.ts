// src/app/api/mail/drain/route.ts
//
// Mail kuyruğunu boşaltır. pg_cron ya da panel yoklaması çağırır.
// Push dispatch ile aynı secret'ı kullanıyor.

import { NextRequest, NextResponse } from "next/server"
import { drainMailQueue } from "@/actions/mail.actions"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-push-secret")
  if (!process.env.PUSH_WEBHOOK_SECRET || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Yetkisiz" }, { status: 401 })
  }

  const r = await drainMailQueue(30)
  return NextResponse.json(r)
}
