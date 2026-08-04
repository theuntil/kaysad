"use client"

// src/components/MailDetailView.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// MAİL DETAYI — AYRI EKRAN
//
// ★ Liste içinde açılmıyor; kendi route'unda (`/mail/[id]`).
//
// ★ Yıldız ve arşiv İKON — metin değil. İki durumlu bir eylem için
//   "Yıldızla" / "Yıldızı kaldır" diye yazı değiştirmek hem yer
//   kaplıyor hem okumayı zorunlu kılıyor. Dolu/boş yıldız tek bakışta
//   anlaşılıyor.
//
// ★ Gövde yüksekliği: en az 70vh. Eskiden içerik yüksekliğine göre
//   büzülüyordu ve kısa maillerde bile dar bir şeritte görünüyordu.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { deleteMailsAction, flagMailAction } from "@/actions/mail.actions"
import { MailBodyFrame } from "@/components/MailBodyFrame"
import {
  Badge, Button, ErrorBox, Modal, Spinner, WarnBox,
} from "@/components/ui"
import { fmtDate } from "@/lib/utils"

interface Mail {
  id: string
  subject: string | null
  from_name: string | null
  from_email: string
  to_email: string | null
  received_at: string
  body_html: string | null
  body_text: string | null
  is_starred: boolean
  is_archived: boolean
}

interface Kullanici {
  id: string
  username: string | null
  name: string | null
  email: string | null
}

/* ═════════════════ İKON DÜĞME ═════════════════ */

/**
 * ★ Metin yerine ikon. Aktifken dolu, pasifken çizgi.
 *   `title` ve `aria-label` ile erişilebilirlik korunuyor —
 *   ikon görsel kısayol, anlamı kaybettirmiyor.
 */
function IkonDugme({
  aktif, onClick, busy, etiket, children,
}: {
  aktif: boolean
  onClick: () => void
  busy?: boolean
  etiket: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={etiket}
      aria-label={etiket}
      aria-pressed={aktif}
      className={
        "flex h-9 w-9 items-center justify-center rounded-xl border transition-colors " +
        (aktif
          ? "border-accent/40 bg-accent/10 text-accent"
          : "border-hairline bg-raised text-muted hover:border-accent/30 hover:text-text") +
        (busy ? " opacity-50" : "")
      }
    >
      {children}
    </button>
  )
}

function YildizIkon({ dolu }: { dolu: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={dolu ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <path d="M12 2.5l2.9 5.9 6.6.95-4.8 4.65 1.15 6.5L12 17.4l-5.85 3.1L7.3 14l-4.8-4.65 6.6-.95z" />
    </svg>
  )
}

function ArsivIkon({ dolu }: { dolu: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
    >
      <rect x="2.5" y="3.5" width="19" height="5" rx="1.5" fill={dolu ? "currentColor" : "none"} />
      <path d="M4.5 8.5v10a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-10" />
      <path d="M10 12.5h4" />
    </svg>
  )
}

/* ═════════════════ EKRAN ═════════════════ */

export function MailDetailView({
  mail, kullanici,
}: {
  mail: Mail
  kullanici: Kullanici | null
}) {
  const router = useRouter()

  const [yildiz, setYildiz] = useState(mail.is_starred)
  const [arsiv, setArsiv] = useState(mail.is_archived)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [silOnay, setSilOnay] = useState(false)

  /* ★ İyimser güncelleme: düğme anında tepki veriyor, sunucu
     hata verirse geri alınıyor. Ağ beklemek kötü hissettiriyordu. */
  const isaretle = useCallback(async (
    alan: "is_starred" | "is_archived",
    deger: boolean
  ) => {
    const geriAl = alan === "is_starred" ? setYildiz : setArsiv
    const eski = alan === "is_starred" ? yildiz : arsiv

    geriAl(deger)
    setBusy(true)
    setErr(null)

    const r = await flagMailAction(mail.id, alan, deger)

    setBusy(false)

    if (!r?.ok) {
      geriAl(eski)
      setErr("İşaretlenemedi.")
      return
    }

    router.refresh()
  }, [mail.id, yildiz, arsiv, router])

  const sil = useCallback(async () => {
    setBusy(true)
    setErr(null)

    const r = await deleteMailsAction([mail.id])

    setBusy(false)
    setSilOnay(false)

    if (!r.ok) { setErr(r.error ?? "Silinemedi."); return }

    router.push("/mail")
  }, [mail.id, router])

  return (
    <>
      {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}

      {/* ── Aksiyon çubuğu ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <IkonDugme
          aktif={yildiz}
          busy={busy}
          etiket={yildiz ? "Yıldızı kaldır" : "Yıldızla"}
          onClick={() => { void isaretle("is_starred", !yildiz) }}
        >
          <YildizIkon dolu={yildiz} />
        </IkonDugme>

        <IkonDugme
          aktif={arsiv}
          busy={busy}
          etiket={arsiv ? "Arşivden çıkar" : "Arşivle"}
          onClick={() => { void isaretle("is_archived", !arsiv) }}
        >
          <ArsivIkon dolu={arsiv} />
        </IkonDugme>

        <div className="ml-auto flex flex-wrap gap-2">
          <Link href={`/mail/yaz?to=${encodeURIComponent(mail.from_email)}&yanit=${mail.id}`}>
            <Button size="sm">Yanıtla</Button>
          </Link>

          {/* ★ İLET: alıcı boş bırakılıyor, gövde hazır geliyor.
              Gelen bir maili başkasına aktarmak sık ihtiyaç. */}
          <Link href={`/mail/yaz?ilet=${mail.id}`}>
            <Button size="sm" variant="secondary">İlet</Button>
          </Link>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => setSilOnay(true)}
          >
            Sil
          </Button>
        </div>
      </div>

      {/* ── Başlık kartı ── */}
      <div className="mb-4 rounded-2xl border border-hairline bg-surface p-5">
        <h2 className="text-[19px] font-bold leading-snug tracking-tight text-text">
          {mail.subject || "(konu yok)"}
        </h2>

        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
          <span className="font-medium text-text">
            {mail.from_name ? `${mail.from_name} ` : ""}
            &lt;{mail.from_email}&gt;
          </span>
          <span className="text-faint">·</span>
          <span>{fmtDate(mail.received_at)}</span>
          {mail.to_email && (
            <>
              <span className="text-faint">·</span>
              <span>{mail.to_email}</span>
            </>
          )}
        </div>

        {(yildiz || arsiv) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {yildiz && <Badge tone="live">Yıldızlı</Badge>}
            {arsiv && <Badge tone="neutral">Arşivlendi</Badge>}
          </div>
        )}
      </div>

      {/* ── Eşleşen kullanıcı ── */}
      {kullanici ? (
        <div className="mb-4 rounded-2xl border border-accent/25 bg-accent/[0.06] p-4">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
            Eşleşen kullanıcı
          </div>
          <Link
            href={`/kullanicilar/${kullanici.id}`}
            className="text-[14.5px] font-semibold text-text hover:text-accent"
          >
            {kullanici.username ?? kullanici.email ?? "—"}
          </Link>
          {kullanici.name && (
            <span className="ml-2 text-[13px] text-muted">{kullanici.name}</span>
          )}
        </div>
      ) : (
        <div className="mb-4 rounded-2xl border border-hairline bg-surface px-4 py-3 text-[12.5px] text-muted">
          Bu gönderen hiçbir kullanıcıyla eşleşmedi.
        </div>
      )}

      {/*
        ── Gövde ──
        ★ min-height 70vh. Eskiden içerik yüksekliğine göre büzülüyordu;
          kısa maillerde bile dar bir şeritte görünüyor, uzun maillerde
          okumak için sürekli kaydırmak gerekiyordu.
      */}
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface p-5">
        {/* ★ Taban yükseklik iframe'e veriliyor — sarmalayıcıya
            min-height vermek işe yaramıyordu, iframe kendi ölçtüğü
            yüksekliği dayatıp içeride küçük kalıyordu. */}
        <MailBodyFrame
          html={mail.body_html}
          text={mail.body_text}
          minYukseklik={640}
        />
      </div>

      {/* ── Silme onayı ── */}
      <Modal
        open={silOnay}
        onClose={() => setSilOnay(false)}
        title="Maili sil"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSilOnay(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button variant="danger" onClick={() => { void sil() }} disabled={busy}>
              {busy && <Spinner />} Kalıcı sil
            </Button>
          </>
        }
      >
        <WarnBox>
          Bu mail kalıcı olarak silinecek. Geri alınamaz.
        </WarnBox>
      </Modal>
    </>
  )
}
