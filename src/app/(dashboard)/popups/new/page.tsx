import { fetchCityDistribution } from "@/actions/notification.actions"
import { PageHeader } from "@/components/PageHeader"
import { PopupForm } from "@/components/PopupForm"

export const dynamic = "force-dynamic"

export default async function NewPopupPage() {
  const { cities } = await fetchCityDistribution()

  return (
    <>
      <PageHeader
        title="Yeni popup"
        description="Alanları doldur — sağdaki önizlemede uygulamada nasıl görüneceğini canlı takip edebilirsin."
      />
      <PopupForm cities={cities} />
    </>
  )
}
