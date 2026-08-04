import Link from "next/link"

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="text-[46px] font-extrabold tracking-tight text-accent">404</p>
      <h1 className="mt-2 text-[17px] font-semibold text-text">Sayfa bulunamadı</h1>
      <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted">
        Aradığın kayıt silinmiş veya adres yanlış olabilir.
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-accent px-5 py-2.5 text-[13.5px] font-semibold text-black transition-colors hover:bg-accentD"
      >
        Panele dön
      </Link>
    </main>
  )
}
