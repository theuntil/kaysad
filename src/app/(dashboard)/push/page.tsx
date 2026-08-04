// src/app/(dashboard)/push/page.tsx
//
// ┌─ BU SAYFA NE YAPIYOR ─────────────────────────────────────────────┐
// │ Push bildirim kontrol merkezi. Dört bölüm:                         │
// │  1. Kuyruk durumu + "Bekleyenleri Gönder" + otomatik yoklama        │
// │  2. Manuel bildirim gönderme (başlık, mesaj, hedefleme, önizleme)  │
// │  3. Tip aç/kapa + sistem ayarları (sessiz saat, ana anahtar)        │
// │  4. Gönderim kaydı (hata ayıklama)                                 │
// └────────────────────────────────────────────────────────────────────┘

import { fetchQueueStatus } from "@/actions/maintenance.actions"
import {
  fetchPushStats,
  fetchPushSettings,
  fetchPushLog,
  fetchAppSettings,
  checkExpoToken,
} from "@/actions/push.actions"
import { PageHeader } from "@/components/PageHeader"
import { PushWorker } from "@/components/PushWorker"
import { PushSettingsPanel } from "@/components/PushSettingsPanel"
import { MaintenancePanel } from "@/components/MaintenancePanel"
import { PushLogTable } from "@/components/PushLogTable"
import { Stat, ErrorBox } from "@/components/ui"
import { fmtNum } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function PushPage() {
  const [
    { stats, error: statErr },
    { items: settings },
    { items: logs },
    { items: appSettings },
    { hasToken },
  , queue] = await Promise.all([
    fetchPushStats(),
    fetchPushSettings(),
    fetchPushLog(null, 100),
    fetchAppSettings(),
    checkExpoToken(),
  , fetchQueueStatus()])

  if (statErr || !stats) {
    return (
      <>
        <PageHeader title="Push ayarları" />
        <ErrorBox>
          {statErr ?? "İstatistikler alınamadı."}
          <br />
          <br />
          <code className="font-mono text-[12px]">push_sistemi_veritabani.sql</code> dosyası
          çalıştırıldı mı? Bu sayfa o dosyanın kurduğu tablolara ve fonksiyonlara ihtiyaç duyuyor.
        </ErrorBox>
      </>
    )
  }

  const basariOrani =
    stats.log_24s_ok + stats.log_24s_hata > 0
      ? Math.round((stats.log_24s_ok / (stats.log_24s_ok + stats.log_24s_hata)) * 100)
      : null

  return (
    <>
      <PageHeader
        title="Push ayarları"
        description="Push altyapısının ayarları ve kayıtları. Gönderim için Bildirim & Push sayfasını kullan."
      />

      {/* ── METRİKLER ── */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Bekleyen"
          value={fmtNum(stats.bekleyen)}
          tone={stats.bekleyen > 0 ? "warn" : "accent"}
        />
        <Stat
          label="Son 24 saat"
          value={fmtNum(stats.log_24s_ok)}
          tone="accent"
        />
        <Stat
          label="Aktif token"
          value={fmtNum(stats.aktif_token)}
        />
        <Stat
          label="Atlanan"
          value={fmtNum(stats.atlanan_24s)}
          tone={stats.atlanan_24s > 0 ? "default" : "default"}
        />
      </div>

      <div className="space-y-6">
        {/* ── 1) KUYRUK ── */}
        <PushWorker
          bekleyen={stats.bekleyen}
          sistemAcik={stats.sistem_acik}
          sessizSaatte={stats.sessiz_saatte}
          hasExpoToken={hasToken}
        />

        {/* ── KUYRUK VE TEMİZLİK ── */}
        <MaintenancePanel queue={queue} />

        {/* ── 2) GÖNDERİM ARTIK BURADA DEĞİL ──
            ★ Manuel gönderim /gonderim sayfasına taşındı. Aynı işi iki
              yerden yapmak "hangisinden attım?" karmaşası yaratıyordu.
              Bu sayfa sadece AYAR ve KAYIT için. */}
        {/* ── 3) AYARLAR ── */}
        <div>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-faint">
            Ayarlar
          </h2>
          <PushSettingsPanel settings={settings} appSettings={appSettings} />
        </div>

        {/* ── 4) LOG ── */}
        <div>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-faint">
            Kayıtlar
          </h2>
          {stats.hata_dagilimi && stats.hata_dagilimi.length > 0 && (
            <div className="mb-3 rounded-2xl border border-border bg-surface p-4">
              <div className="mb-2.5 text-[12px] font-semibold text-text">
                Son 7 günün hata dağılımı
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.hata_dagilimi.map((h: { error_code: string; adet: number }) => (
                  <span
                    key={h.error_code}
                    className="rounded-lg border border-danger/25 bg-danger/[0.08] px-2.5 py-1.5 font-mono text-[11.5px] text-danger"
                  >
                    {h.error_code} · {fmtNum(h.adet)}
                  </span>
                ))}
              </div>
            </div>
          )}
          <PushLogTable items={logs} />
        </div>
      </div>
    </>
  )
}
