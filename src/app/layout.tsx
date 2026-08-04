import type { Metadata, Viewport } from "next"
import { getTheme } from "@/lib/theme"
import "./globals.css"

export const metadata: Metadata = {
  title: "Kays Admin",
  description: "Kays yönetim paneli",
  robots: { index: false, follow: false },  // ★ arama motorlarına kapalı
  // ★ Favicon: public/icon.png
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }],
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // ★ Tema sunucuda çerezden okunuyor: ilk HTML doğru sınıfla geliyor,
  //   sayfa açılışında yanlış renk "flash"i olmuyor.
  const theme = await getTheme()

  return (
    <html lang="tr" className={theme === "light" ? "light" : undefined} suppressHydrationWarning>
      <head>
        <meta name="theme-color" content={theme === "light" ? "#f8f9fb" : "#0b0b0d"} />
      </head>
      <body className="min-h-dvh bg-bg font-sans text-text antialiased">{children}</body>
    </html>
  )
}
