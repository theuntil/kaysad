// src/app/(dashboard)/mail/yaz/page.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// YENİ MAİL — AYRI EKRAN
//
// ★ Eskiden `/mail?yaz=1` ile aynı sayfada, istatistik kutularının ve
//   sekme çubuğunun ALTINDA açılıyordu. Yazma işi odak isteyen bir iş;
//   üstünde "okunmamış: 12" kutusu dururken yazmak dikkat dağıtıyordu.
//
// ★ Artık kendi route'u var. Sayfada sadece geri düğmesi ve form var.
// ═══════════════════════════════════════════════════════════════════════

import { fetchMailDetail } from "@/actions/mail.actions"
import { quickUserSearch } from "@/actions/users.actions"
import { MailComposer } from "@/components/MailComposer"
import { PageHeader } from "@/components/PageHeader"

export const dynamic = "force-dynamic"

export default async function MailYazPage({
  searchParams,
}: {
  searchParams: Promise<{
    to?: string
    user?: string
    /** Yanıtlanacak mail — konuya "Yn:" ekleniyor */
    yanit?: string
    /** İletilecek mail — gövde alıntılanıyor, alıcı boş */
    ilet?: string
  }>
}) {
  const sp = await searchParams

  // Kullanıcı sayfasından "mail gönder" ile gelinmişse alıcıyı hazırla
  let hazirAlici = null
  if (sp.user) {
    const r = await quickUserSearch(sp.user, 1)
    hazirAlici = r.items[0] ?? null
  }

  /* ── Yanıt / iletme hazırlığı ──
     ★ Konu ve gövde önceden dolduruluyor. Kullanıcı kopyala-yapıştır
       yapmak zorunda kalmıyor. */
  let hazirKonu: string | undefined
  let hazirGovde: string | undefined
  let baslik = "Yeni mail"

  const kaynakId = sp.ilet ?? sp.yanit
  if (kaynakId) {
    const { detail } = await fetchMailDetail(kaynakId)
    const m = (detail as { mail?: Record<string, unknown> } | null)?.mail

    if (m) {
      const konu = String(m.subject ?? "")
      const gonderen = String(m.from_name ?? m.from_email ?? "")
      const tarih = String(m.received_at ?? "")

      if (sp.ilet) {
        baslik = "Maili ilet"
        hazirKonu = konu.startsWith("Ilt:") ? konu : `Ilt: ${konu}`
      } else {
        baslik = "Yanıtla"
        hazirKonu = konu.startsWith("Yn:") ? konu : `Yn: ${konu}`
      }

      /* ★ Alıntı bloğu — özgün mail sol çizgiyle ayrılıyor.
         `body_html` varsa o, yoksa düz metin kullanılıyor. */
      const govde = (m.body_html as string | null)
        ?? `<pre style="white-space:pre-wrap;font-family:inherit;">${
          String(m.body_text ?? "").replace(/[<>&]/g, (c) =>
            c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;")
        }</pre>`

      hazirGovde =
        `<p><br></p>` +
        `<div style="border-left:3px solid #d1d1d6;padding-left:14px;margin-top:20px;color:#6c6c70;">` +
        `<p style="font-size:12.5px;margin:0 0 10px;">` +
        `${gonderen}${tarih ? ` · ${new Date(tarih).toLocaleString("tr-TR")}` : ""} tarihinde yazdı:` +
        `</p>${govde}</div>`
    }
  }

  return (
    <>
      <PageHeader
        back={{ href: "/mail", label: "Mail" }}
        title={baslik}
      />
      <MailComposer
        defaultTo={sp.to}
        defaultUser={hazirAlici}
        defaultSubject={hazirKonu}
        defaultBody={hazirGovde}
      />
    </>
  )
}
