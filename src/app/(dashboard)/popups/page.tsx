import Link from "next/link"
import { fetchPopups } from "@/actions/popup.actions"
import { PageHeader } from "@/components/PageHeader"
import { PopupList } from "@/components/PopupList"
import { Button, ErrorBox } from "@/components/ui"

export const dynamic = "force-dynamic"

export default async function PopupsPage() {
  const { popups, error } = await fetchPopups()

  return (
    <>
      <PageHeader
        title="Popup'lar"
        description="Uygulama içi popup'ları oluştur, düzenle ve yayından kaldır."
        action={
          <Link href="/popups/new">
            <Button>Yeni popup</Button>
          </Link>
        }
      />
      {error ? <ErrorBox>{error}</ErrorBox> : <PopupList popups={popups} />}
    </>
  )
}
