// src/components/PhoneFrame.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// ORTAK TELEFON ÇERÇEVESİ
//
// Push ve Popup önizlemeleri aynı çerçeveyi kullanıyor — iki ekranda
// farklı telefon çizimi olması tutarsız görünüyordu.
//
// ★ Çerçeve içi HER ZAMAN koyu (gerçek telefon gibi). Bu yüzden içerideki
//   yazılar tema değişkenlerine değil sabit beyaz/siyah tonlara bağlı:
//   açık temada beyaz yazı beyaz zemine düşüp kaybolmuyor.
// ═══════════════════════════════════════════════════════════════════════

// ★ Telefonun içi HER ZAMAN koyu ve renkleri sabit — panel açık temaya
//   geçse bile gerçek bir telefon gibi görünsün. Tema değişkeni (bg-white,
//   text-muted gibi) burada kullanılmıyor: `white` token'ı açık temada
//   koyuya döndüğü için önizleme bozuluyordu.
export function PhoneFrame({
  children, width = 300,
}: {
  children: React.ReactNode
  width?: number
}) {
  return (
    <div className="mx-auto" style={{ width, maxWidth: "100%" }}>
      <div
        className="relative overflow-hidden rounded-[2.4rem] border-[8px] border-[#1c1c1e] shadow-pop"
        style={{ background: "#0b0b0f", aspectRatio: "9 / 19.5" }}
      >
        {/* Dynamic Island */}
        <div className="absolute left-1/2 top-2 z-20 h-[24px] w-[86px] -translate-x-1/2 rounded-full bg-black" />

        {/* Durum çubuğu */}
        <div
          className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between px-6 pt-[9px] text-[11px] font-semibold"
          style={{ color: "#ffffff" }}
        >
          <span>{new Date().toLocaleTimeString("tr", { hour: "2-digit", minute: "2-digit" })}</span>
          <span className="flex items-center gap-1">
            <svg viewBox="0 0 20 12" className="h-[10px] w-[16px]" fill="currentColor">
              <rect x="0" y="7" width="3" height="5" rx="1" />
              <rect x="4.5" y="5" width="3" height="7" rx="1" />
              <rect x="9" y="2.5" width="3" height="9.5" rx="1" />
              <rect x="13.5" y="0" width="3" height="12" rx="1" />
            </svg>
            <svg viewBox="0 0 24 12" className="h-[10px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="1" y="2" width="18" height="8" rx="2.2" />
              <rect x="2.5" y="3.5" width="13" height="5" rx="1" fill="currentColor" stroke="none" />
              <path d="M21 5v2" strokeLinecap="round" />
            </svg>
          </span>
        </div>

        {/* İçerik */}
        <div className="absolute inset-0 pt-[42px]">{children}</div>

        {/* Ana ekran çubuğu */}
        <div
          className="absolute bottom-[7px] left-1/2 z-20 h-[4px] w-[110px] -translate-x-1/2 rounded-full"
          style={{ background: "rgba(255,255,255,0.35)" }}
        />
      </div>
    </div>
  )
}

/** Uygulama ikonu — logo public/kays1.png */
export function AppIcon({ size = 52, badge }: { size?: number; badge?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center overflow-hidden bg-[#ffffff]"
        style={{ borderRadius: size * 0.24 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/kays1.png" alt="Kays" className="h-[76%] w-[76%] object-contain" />
      </div>
      {badge !== undefined && badge > 0 && (
        <span
          className="absolute -right-1.5 -top-1.5 flex min-w-[20px] items-center justify-center rounded-full bg-[#ff3b30] px-1.5 text-[11px] font-bold text-[#ffffff] shadow"
          style={{ height: 20 }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </div>
  )
}
