// src/app/(dashboard)/ayarlar/page.tsx
//
// AYARLAR — bakım modu, sürüm, alt sistemler, içerik sınırları

import { fetchConfig, fetchCleanupPreview, fetchAdsImpact } from "@/actions/config.actions"
import { PageHeader } from "@/components/PageHeader"
import { SettingsPanel } from "@/components/SettingsPanel"
import { Card, CardTitle, ErrorBox } from "@/components/ui"
import { fmtNum } from "@/lib/utils"
import { StorageDiagnostics } from "@/components/StorageDiagnostics"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const [{ bundle, error }, temizlik, adsImpact] = await Promise.all([
    fetchConfig(),
    fetchCleanupPreview(),
    fetchAdsImpact(),
  ])

  if (error || !bundle) {
    return (
      <>
        <PageHeader title="Ayarlar" />
        <ErrorBox>
          {error ?? "Ayarlar okunamadı."}
          <br />
          <br />
          <code className="font-mono text-[12px]">panel_v4_7_ayarlar_limitler.sql</code>{" "}
          dosyasını çalıştırdın mı?
        </ErrorBox>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Ayarlar" />

      <SettingsPanel bundle={bundle} adsImpact={adsImpact} />

      {/* ── Bildirim temizlik kuralı ── */}
      {temizlik && (
        <div className="mt-5">
          <Card>
            <CardTitle>Bildirim temizliği</CardTitle>
            <p className="mb-3 text-[13px] text-muted">
              {String(temizlik.kural ?? "")}
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                ["Toplam bildirim", temizlik.toplam_bildirim],
                ["10 günden eski", temizlik.eski_bildirim],
                ["Korunacak", temizlik.korunacak],
                ["Silinecek", temizlik.silinecek],
              ].map(([l, v]) => (
                <div key={String(l)} className="rounded-xl border border-hairline bg-raised px-3.5 py-2.5">
                  <div className="text-[10.5px] uppercase tracking-wider text-faint">{String(l)}</div>
                  <div className="text-[17px] font-bold tabular-nums text-text">
                    {fmtNum(Number(v ?? 0))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] text-faint">
              Her gece 04:00&apos;te otomatik çalışır. Elle çalıştırmak için Push sayfası.
            </p>
          </Card>
        </div>
      )}
      <div className="mt-5">
        <StorageDiagnostics />
      </div>
    </>
  )
}
