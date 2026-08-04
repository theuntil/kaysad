// src/proxy.ts
//
// ═══════════════════════════════════════════════════════════════════════
// KORUMA KATMANI 1/2 — Proxy (Next 16'da eski adıyla "middleware")
//
// ★ Next 16'da bu dosya konvansiyonu `middleware.ts` → `proxy.ts` olarak
//   yeniden adlandırıldı; export edilen fonksiyon da `middleware` → `proxy`.
//   Davranış aynı: her istekte, sayfa render edilmeden önce çalışır.
//
// Her istekte, sayfa render edilmeden ÖNCE oturumu doğrular. Oturum yoksa
// /login'e yönlendirir. Edge runtime'da çalıştığı için `jose` kullanıyoruz
// (bcryptjs Edge'de çalışmaz — o yüzden şifre doğrulama server action'da).
//
// ★ Bu tek katman DEĞİL: her server action ve korumalı sayfa ayrıca
//   `assertSession()` / `requireSession()` çağırıyor. Middleware bir
//   matcher hatası yüzünden atlanırsa bile veri sızmaz.
// ═══════════════════════════════════════════════════════════════════════

import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth"

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl

  const token = req.cookies.get(SESSION_COOKIE)?.value
  const session = await verifySessionToken(token)

  // Giriş sayfasındaysa ve oturum GEÇERLİYSE → panele al
  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/", req.url))
    }
    return NextResponse.next()
  }

  // Korumalı alan
  if (!session) {
    const loginUrl = new URL("/login", req.url)
    // Giriş sonrası geldiği yere dönsün (open-redirect'e karşı sadece path saklanır)
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname + search)
    }
    const res = NextResponse.redirect(loginUrl)
    // Bozuk/süresi geçmiş cookie'yi temizle
    res.cookies.delete(SESSION_COOKIE)
    return res
  }

  return NextResponse.next()
}

export const config = {
  // Statik dosyalar, health/push endpoint'leri ve Next.js iç yolları hariç
  // HER ŞEY korumalı.
  //
  // ★ Beyaz liste yerine KARA LİSTE: yeni bir sayfa eklediğinde otomatik
  //   korumalı olur, "korumayı eklemeyi unutma" riski yok.
  //
  // ★★★ api/push/* NEDEN DIŞLANDI ★★★
  //   Bu endpoint'leri PostgreSQL çağırıyor (pg_net), tarayıcı değil —
  //   oturum cookie'si taşıyamazlar. Proxy onları da korumaya alırsa
  //   veritabanının istekleri 307 ile /login'e yönlendirilir ve HİÇBİR
  //   otomatik push gönderilmez (sessizce çalışmaz, fark etmek zordur).
  //
  //   Korumasız DEĞİL: kendi kimlik doğrulamaları var — `x-push-secret`
  //   başlığı, sabit zamanlı karşılaştırmayla kontrol ediliyor
  //   (bkz. src/lib/push-webhook.ts). Secret .env'de tanımlı değilse
  //   endpoint TÜM istekleri reddediyor, açık kapı bırakmıyor.
  matcher: [
    "/((?!api/health|api/push|_next/static|_next/image|favicon.ico|robots.txt|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)",
  ],
}
