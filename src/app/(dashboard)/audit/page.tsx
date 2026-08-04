import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { requireSession } from "@/lib/session"
import { PageHeader } from "@/components/PageHeader"
import { Badge, Card, EmptyState, ErrorBox, Table, Td, Th } from "@/components/ui"
import { fmtDate } from "@/lib/utils"
import type { AuditEntry } from "@/lib/types"

export const dynamic = "force-dynamic"

const ACTION_LABEL: Record<string, { text: string; tone: "live" | "danger" | "promo" | "neutral" | "expired" }> = {
  login:               { text: "Giriş",                tone: "live" },
  login_failed:        { text: "Başarısız giriş",      tone: "danger" },
  logout:              { text: "Çıkış",                tone: "neutral" },
  popup_create:        { text: "Popup oluşturuldu",    tone: "live" },
  popup_update:        { text: "Popup güncellendi",    tone: "neutral" },
  popup_delete:        { text: "Popup silindi",        tone: "danger" },
  popup_toggle:        { text: "Popup durumu",         tone: "expired" },
  popup_reset_views:   { text: "Geçmiş sıfırlandı",    tone: "expired" },
  broadcast_send:      { text: "Bildirim gönderildi",  tone: "promo" },
  broadcast_undo:      { text: "Bildirim geri alındı", tone: "danger" },
  notification_delete: { text: "Bildirim silindi",     tone: "danger" },
}

export default async function AuditPage() {
  await requireSession()

  let entries: AuditEntry[] = []
  let error: string | undefined

  try {
    const sb = getSupabaseAdmin()
    const { data, error: err } = await sb
      .from("admin_audit_log")
      .select("id, actor, action, target_type, target_id, detail, created_at")
      .order("created_at", { ascending: false })
      .limit(200)
    if (err) error = err.message
    else entries = (data ?? []) as AuditEntry[]
  } catch (e) {
    error = e instanceof Error ? e.message : "Bağlantı hatası."
  }

  return (
    <>
      <PageHeader
        title="İşlem Kaydı"
        description="Panelde yapılan son 200 işlem. Başarısız giriş denemeleri de burada."
      />

      {error ? (
        <ErrorBox>
          {error}
          <br />
          <br />
          <code className="font-mono text-[12px]">admin_audit_log</code> tablosu yoksa{" "}
          <code className="font-mono text-[12px]">sql/admin_panel_setup.sql</code> dosyasını çalıştır.
        </ErrorBox>
      ) : entries.length === 0 ? (
        <EmptyState title="Henüz kayıt yok" />
      ) : (
        <Card padded={false}>
          <Table className="rounded-none border-0">
            <thead>
              <tr>
                <Th>Tarih</Th>
                <Th>İşlem</Th>
                <Th>Kullanıcı</Th>
                <Th>Detay</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const meta = ACTION_LABEL[e.action] ?? { text: e.action, tone: "neutral" as const }
                return (
                  <tr key={e.id} className="transition-colors hover:bg-white/[0.02]">
                    <Td>
                      <span className="whitespace-nowrap text-[12.5px] tabular-nums text-muted">
                        {fmtDate(e.created_at)}
                      </span>
                    </Td>
                    <Td><Badge tone={meta.tone}>{meta.text}</Badge></Td>
                    <Td>
                      <span className="font-mono text-[12.5px] text-text">{e.actor}</span>
                    </Td>
                    <Td className="max-w-[380px]">
                      {e.detail ? (
                        <span className="block break-words font-mono text-[11.5px] leading-relaxed text-faint">
                          {Object.entries(e.detail)
                            .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
                            .join(" · ")}
                        </span>
                      ) : (
                        <span className="text-[12px] text-faint">—</span>
                      )}
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  )
}
