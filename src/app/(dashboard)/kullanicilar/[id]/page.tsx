// src/app/(dashboard)/kullanicilar/[id]/page.tsx
//
// KULLANICI DETAYI
//
// ┌─ TUTARLILIK KONTROLÜ ─────────────────────────────────────────────┐
// │ Sayfanın en üstündeki bölüm. Şunları ayrı ayrı yakalar:            │
// │   • profiles'ta kayıt YOK (auth'ta var)                            │
// │   • auth'ta kayıt YOK (profiles'ta var — artık kimse giremez)      │
// │   • aynı kullanıcı adı / e-posta ile MÜKERRER kayıt                │
// │   • e-posta / telefon iki tabloda FARKLI                           │
// │   • doğrulama bayrakları uyuşmuyor                                 │
// │   • banlı işaretli ama ban kaydı yok (ya da tersi)                 │
// │ Her satırda hangi değerin neyle uyuşmadığı yazıyor — tahmin        │
// │ etmene gerek kalmıyor.                                            │
// └───────────────────────────────────────────────────────────────────┘

import Link from "next/link"
import { notFound } from "next/navigation"
import { fetchUserFull } from "@/actions/users.actions"
import { fetchUserReports } from "@/actions/content.actions"
import { PageHeader } from "@/components/PageHeader"
import { UserAdminPanel } from "@/components/UserAdminPanel"
import { IdentityEditor } from "@/components/IdentityEditor"
import { ProfileMedia } from "@/components/ProfileMedia"
import { UserBanButton } from "@/components/UserBanButton"
import { UserDeleteButton } from "@/components/UserDeleteButton"
import { MismatchFixer } from "@/components/MismatchFixer"
import { UserContent } from "@/components/UserContent"
import { UserReports } from "@/components/UserReports"
import { Avatar, Badge, Button, Card, CardTitle, ErrorBox, KeyValue, Stat } from "@/components/ui"
import { fmtDate, timeAgo } from "@/lib/utils"
import type { ConsistencyIssue } from "@/lib/types.v3"

export const dynamic = "force-dynamic"

function bool(v: unknown): string {
  return v === true ? "evet" : v === false ? "hayır" : "—"
}

const SEVERITY = {
  critical: { label: "KRİTİK", cls: "border-danger/30 bg-danger/[0.07]", text: "text-danger" },
  warning:  { label: "UYARI",  cls: "border-warn/30 bg-warn/[0.07]",    text: "text-warn" },
  info:     { label: "BİLGİ",  cls: "border-info/30 bg-info/[0.07]",    text: "text-info" },
} as const

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [{ user, error }, { items: reports }] = await Promise.all([
    fetchUserFull(id),
    fetchUserReports(id),
  ])

  if (error) {
    return (
      <>
        <PageHeader back={{ href: "/kullanicilar", label: "Kullanıcılar" }}
        title="Kullanıcı detayı" />
        <ErrorBox>{error}</ErrorBox>
      </>
    )
  }
  if (!user) notFound()

  const p = (user.profile ?? {}) as Record<string, unknown>
  const auth = user.auth
  const issues = (user.issues ?? []) as ConsistencyIssue[]

  const username = (p.username as string | null) ?? null
  const isBanned = p.is_banned === true || (user.bans ?? []).some((b) => b.is_active !== false && !b.device_id)

  return (
    <>
      <PageHeader
        title={username ?? auth?.email ?? "Kullanıcı"}
        description={`Auth ID: ${id}`}
        action={
          <div className="flex flex-wrap gap-2">
            {/* ★ Ban düğmesi en üstte, "Listeye dön"ün SOLUNDA */}
            <UserBanButton
              userId={id}
              username={username}
              isBanned={isBanned}
              deviceCount={(user.devices ?? []).length}
              ipCount={new Set((user.devices ?? []).map((d) => d.ip).filter(Boolean)).size}
            />
            {/* ★ Mail gönder: alıcı otomatik seçili gelir */}
            <Link href={`/mail?yaz=1&user=${encodeURIComponent(username ?? id)}`}>
              <button
                type="button"
                aria-label="Mail gönder"
                title="Mail gönder"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-hairline bg-raised text-muted transition-colors hover:border-accent/40 hover:text-text"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
                  <rect x="2" y="4" width="20" height="16" rx="2.5" /><path d="m2 7 10 6 10-6" />
                </svg>
              </button>
            </Link>

            {/* ★ Sadece ikon: kullanıcıyı ve tüm verisini siler */}
            <UserDeleteButton userId={id} username={username} />
          </div>
        }
      />

      {/* ══════ PROFİL MEDYASI (arka plan + avatar) ══════ */}
      <div className="mb-5">
        <ProfileMedia
          userId={id}
          avatarUrl={(p.avatar_url as string | null) ?? null}
          backgroundUrl={
            ((p.background ?? p.background_url ?? p.cover_url ?? p.banner_url ?? p.kapak_url) as string | null) ?? null
          }
          username={username}
          name={(p.name as string | null) ?? null}
          hasBackgroundColumn={
            "background" in p || "background_url" in p || "cover_url" in p ||
            "banner_url" in p || "kapak_url" in p
          }
        />
      </div>

      {/* ══════ ÖZET ROZETLER ══════ */}
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {p.verify === true && <Badge tone="live">Doğrulanmış</Badge>}
          {isBanned && <Badge tone="danger">Banlı</Badge>}
          {p.role === "business" && <Badge tone="scheduled">İşletme</Badge>}
          {p.ogrenci === true && <Badge tone="neutral">Öğrenci</Badge>}
          {p.gizli === true && <Badge tone="neutral">Gizli hesap</Badge>}
          <span className="ml-auto text-[12.5px] text-muted">
            {(p.sehir as string | null) ?? "Şehir belirtilmemiş"}
            {" · "}
            {(p.follower_count as number | null) ?? 0} takipçi
            {" · "}
            {(p.post_count as number | null) ?? 0} gönderi
          </span>
        </div>
      </Card>

      {/* ══════ TUTARLILIK KONTROLÜ ══════
          ★ Sorun yoksa bu kart HİÇ RENDER EDİLMİYOR. "Her şey yolunda"
            kutusu her sayfada yer kaplıyordu; bilgi değeri yok. */}
      {issues.length > 0 && (
        <Card className="mb-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <CardTitle>Tutarlılık kontrolü</CardTitle>
            <div className="shrink-0">
              <MismatchFixer userId={id} issueCount={issues.length} />
            </div>
          </div>

          <div className="space-y-2">
            {issues.map((it, i) => {
              const s = SEVERITY[it.seviye] ?? SEVERITY.info
              return (
                <div key={`${it.kod}-${i}`} className={`rounded-xl border px-4 py-3 ${s.cls}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-[10.5px] font-bold uppercase tracking-wider ${s.text}`}>
                      {s.label}
                    </span>
                    <span className="text-[13.5px] font-semibold text-text">{it.baslik}</span>
                    <code className="ml-auto font-mono text-[11px] text-faint">{it.kod}</code>
                  </div>
                  <p className="mt-1 break-words text-[12.5px] leading-relaxed text-muted">{it.detay}</p>
                </div>
              )
            })}
          </div>

          {(user.duplicate_username?.length || user.duplicate_email?.length) ? (
            <div className="mt-4 space-y-2">
              {(user.duplicate_username ?? []).length > 0 && (
                <div className="rounded-xl border border-danger/25 bg-danger/[0.06] px-4 py-3 text-[12.5px] text-danger">
                  Aynı kullanıcı adına sahip {user.duplicate_username.length} kayıt
                </div>
              )}
              {(user.duplicate_email ?? []).length > 0 && (
                <div className="rounded-xl border border-danger/25 bg-danger/[0.06] px-4 py-3 text-[12.5px] text-danger">
                  Aynı e-postaya sahip {user.duplicate_email.length} kayıt
                </div>
              )}
            </div>
          ) : null}
        </Card>
      )}

      {/* ══════ ÖZET KARTLAR ══════ */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Kayıt tarihi"
          value={auth?.created_at
            ? new Date(auth.created_at).toLocaleDateString("tr", { day: "numeric", month: "short", year: "numeric" })
            : "—"}
        />
        <Stat
          label="Son giriş"
          value={auth?.last_sign_in_at ? timeAgo(auth.last_sign_in_at) : "Hiç"}
        />
        <Stat
          label="Cihaz"
          value={(user.devices ?? []).length}
        />
        <Stat
          label="Hesap türü"
          value={p.role === "business" ? "İşletme" : "Kullanıcı"}
          tone={p.role === "business" ? "info" : "default"}
        />
      </div>

      {/* ══════ KİMLİK DÜZENLEME ══════ */}
      <div className="mb-5">
        <IdentityEditor
          userId={id}
          values={{
            authEmail: auth?.email ?? null,
            authPhone: auth?.phone ?? null,
            emailConfirmed: !!auth?.email_confirmed_at,
            phoneConfirmed: !!auth?.phone_confirmed_at,
            profileEmail: (p.email as string | null) ?? null,
            profilePhone: (p.phone as string | null) ?? null,
            username,
            name: (p.name as string | null) ?? null,
            sehir: (p.sehir as string | null) ?? null,
            bio: (p.bio as string | null) ?? null,
            website: (p.website as string | null) ?? null,
            businessName: (p.business_name as string | null) ?? null,
            gizli: p.gizli === true,
            verify: p.verify === true,
            role: (p.role as string | null) ?? "user",
            isBoosted: p.is_boosted === true,
            isBanned,
            isStudent: p.ogrenci === true,
            hasBio: "bio" in p,
            hasWebsite: "website" in p,
            hasBusinessName: "business_name" in p,
          }}
        />
      </div>

      {/* ══════ AUTH / PROFİL KARŞILAŞTIRMASI (salt okunur) ══════ */}
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>
            auth.users
          </CardTitle>
          {!auth ? (
            <ErrorBox>
              Auth kaydı YOK. Bu profil kimseye ait değil — kullanıcı giriş yapamaz.
            </ErrorBox>
          ) : (
            <div>
              <KeyValue label="E-posta" value={auth.email ?? "—"} mono />
              <KeyValue label="E-posta doğrulandı" value={auth.email_confirmed_at ? fmtDate(auth.email_confirmed_at) : "Hayır"} />
              <KeyValue label="Telefon" value={auth.phone ?? "—"} mono />
              <KeyValue label="Telefon doğrulandı" value={auth.phone_confirmed_at ? fmtDate(auth.phone_confirmed_at) : "Hayır"} />
              <KeyValue label="Son giriş" value={auth.last_sign_in_at ? fmtDate(auth.last_sign_in_at) : "Hiç"} />
              <KeyValue label="Kayıt" value={fmtDate(auth.created_at)} />
              <KeyValue
                label="Auth banı"
                value={auth.banned_until ? fmtDate(auth.banned_until) : "Yok"}
                tone={auth.banned_until ? "danger" : "faint"}
              />
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>profiles</CardTitle>
          {!user.profile ? (
            <ErrorBox>
              Profil YOK. Kullanıcı giriş yapabilir ama uygulamada hiçbir şey yapamaz —
              kayıt akışı yarıda kalmış.
            </ErrorBox>
          ) : (
            <div>
              <KeyValue label="Kullanıcı adı" value={username ?? "BOŞ"} tone={username ? "default" : "danger"} mono />
              <KeyValue label="E-posta" value={(p.email as string | null) ?? "—"} mono />
              <KeyValue label="Telefon" value={(p.phone as string | null) ?? "—"} mono />
              <KeyValue label="Rol" value={(p.role as string | null) ?? "—"} />
              <KeyValue label="Şehir" value={(p.sehir as string | null) ?? "—"} />
              <KeyValue label="Gizli hesap" value={bool(p.gizli)} />
              <KeyValue
                label="İşletme durumu"
                value={(p.business_durum as string | null) ?? "Başvuru yok"}
                tone={p.business_durum === "pending" ? "warn" : "default"}
              />
              <KeyValue
                label="Öğrenci durumu"
                value={(p.ogrenci_durum as string | null) ?? "Başvuru yok"}
                tone={p.ogrenci_durum === "pending" ? "warn" : "default"}
              />
              <KeyValue label="Profil kaydı" value={fmtDate(p.created_at as string | null)} />
            </div>
          )}
        </Card>
      </div>

      {/* ══════ İÇERİKLER ══════ */}
      <Card className="mb-5">
        <CardTitle>
          İçerikler
        </CardTitle>
        <UserContent userId={id} />
      </Card>

      {/* ══════ ŞİKÂYETLER ══════ */}
      <Card className="mb-5">
        <CardTitle>
          Şikâyetler ({reports.length})
        </CardTitle>
        <UserReports items={reports} userId={id} />
      </Card>

      {/* ══════ YÖNETİM (istemci) ══════ */}
      <UserAdminPanel
        userId={id}
        devices={user.devices ?? []}
        bans={user.bans ?? []}
      />
    </>
  )
}
