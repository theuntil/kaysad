import { notFound } from "next/navigation"
import { fetchPopup } from "@/actions/popup.actions"
import { fetchCityDistribution } from "@/actions/notification.actions"
import { PageHeader } from "@/components/PageHeader"
import { PopupForm } from "@/components/PopupForm"
import { PopupActions } from "@/components/PopupActions"
import { Badge, Card, ErrorBox, KeyValue, Stat } from "@/components/ui"
import { fmtDate, fmtNum, popupLiveState, timeAgo } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function EditPopupPage({
  params,
}: {
  // ★ Next 16: params artık Promise
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ popup, error }, { cities }] = await Promise.all([
    fetchPopup(id),
    fetchCityDistribution(),
  ])

  if (error) {
    return (
      <>
        <PageHeader title="Popup düzenle" />
        <ErrorBox>{error}</ErrorBox>
      </>
    )
  }

  if (!popup) notFound()

  return (
    <>
      <PageHeader
        title={popup.title}
        description={`Oluşturuldu: ${fmtDate(popup.created_at)} · Son güncelleme: ${fmtDate(popup.updated_at)}`}
      />

      {/* ★ Ayrıntılı bilgi listede değil BURADA — en üstte, tek bakışta */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gösterim" value={fmtNum(popup.goruntulenme)} />
        <Stat label="Tıklanma" value={fmtNum(popup.tiklanma)} />
        <Stat
          label="Tıklanma oranı"
          value={popup.goruntulenme > 0
            ? `${((popup.tiklanma / popup.goruntulenme) * 100).toFixed(1)}%`
            : "—"}
        />
        <Stat label="Durum" value={popupLiveState(popup).label} />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <Badge tone={popupLiveState(popup).tone}>{popupLiveState(popup).label}</Badge>
            {popup.variant !== "default" && (
              <Badge tone={popup.variant === "critical" ? "danger" : popup.variant === "promo" ? "promo" : "neutral"}>
                {popup.variant === "critical" ? "Kritik"
                  : popup.variant === "promo" ? "Kampanya"
                  : popup.variant === "warning" ? "Uyarı" : popup.variant}
              </Badge>
            )}
            {!popup.dismissible && <Badge tone="danger">Kapatılamaz</Badge>}
            {popup.target_students_only && <Badge tone="neutral">Sadece öğrenci</Badge>}
          </div>
          <KeyValue label="Yerleşim" value={popup.placement === "app_open" ? "Açılışta"
            : popup.placement === "screen" ? `Ekran: ${popup.target_screen ?? "—"}` : popup.placement} />
          <KeyValue label="Sıklık" value={popup.frequency} />
          {popup.max_shows ? <KeyValue label="En fazla gösterim" value={popup.max_shows} /> : null}
          {popup.cooldown_hours ? <KeyValue label="Bekleme" value={`${popup.cooldown_hours} saat`} /> : null}
          <KeyValue label="Öncelik" value={popup.priority} />
        </Card>

        <Card>
          <KeyValue
            label="Hedef şehirler"
            value={popup.target_cities?.length ? popup.target_cities.join(", ") : "Tüm şehirler"}
          />
          <KeyValue label="Aksiyon" value={popup.action_type} />
          {popup.action_url ? <KeyValue label="Adres" value={popup.action_url} mono /> : null}
          <KeyValue label="Başlangıç" value={popup.start_at ? fmtDate(popup.start_at) : "—"} />
          <KeyValue label="Bitiş" value={popup.end_at ? fmtDate(popup.end_at) : "—"} />
          <KeyValue label="Oluşturuldu" value={timeAgo(popup.created_at)} />
          {popup.note ? <KeyValue label="Not" value={popup.note} /> : null}
        </Card>
      </div>

      <div className="mb-5">
        <PopupActions popup={popup} />
      </div>

      <PopupForm popup={popup} cities={cities} />
    </>
  )
}
