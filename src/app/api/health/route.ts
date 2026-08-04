// Docker HEALTHCHECK ve yük dengeleyiciler için.
// ★ Kimlik doğrulama GEREKTİRMEZ (middleware matcher'ında dışlandı) ama
//   hiçbir hassas bilgi de sızdırmaz — sadece "ayaktayım" der.
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json({ status: "ok", ts: new Date().toISOString() })
}
