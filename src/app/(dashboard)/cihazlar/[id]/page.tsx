// src/app/(dashboard)/cihazlar/[id]/page.tsx
//
// CİHAZ DETAYI
//
// ★ Asıl soru: "bu cihazla kimler giriş yaptı?" Çok hesaplı kötüye
//   kullanımı (aynı telefondan sahte hesap üretme) burada görüyorsun.
//
// Aynı IP'yi paylaşan diğer cihaz sayısı da var: cihaz banı yetmiyorsa
// IP banına geçmek için elindeki veri bu.

import Link from "next/link"
import { notFound } from "next/navigation"
import { fetchDeviceDetail } from "@/actions/ban.actions"
import { PageHeader } from "@/components/PageHeader"
import { DeviceBanButton } from "@/components/DeviceBanButton"
import {
  Avatar, Badge, Button, Card, CardTitle, EmptyState, ErrorBox, KeyValue, Stat,
} from "@/components/ui"
import { label } from "@/lib/format"
import { fmtDate, timeAgo } from "@/lib/utils"

export const dynamic = "force-dynamic"

export default async function DeviceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const deviceId = decodeURIComponent(id)
  const { detail: d, error } = await fetchDeviceDetail(deviceId)

  if (error) {
    return (
      <>
        <PageHeader back={{ href: "/cihazlar", label: "Cihazlar" }}
        title="Cihaz detayı" />
        <ErrorBox>{error}</ErrorBox>
      </>
    )
  }
  if (!d) notFound()

  return (
    <>
      <PageHeader
        title="Cihaz detayı"
        description={deviceId}
        action={
          <div className="flex gap-2">
            {!d.is_banned && <DeviceBanButton deviceId={deviceId} userCount={d.kullanicilar.length} />}
          </div>
        }
      />

      {/* ── DURUM ── */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Giriş yapan hesap"
          value={d.kullanicilar.length}
          tone={d.kullanicilar.length > 2 ? "danger" : "default"}
        />
        <Stat label="Platform" value={label.platform(d.platform)} />
        <Stat
          label="Ban durumu"
          value={d.is_banned ? "Banlı" : "Serbest"}
          tone={d.is_banned ? "danger" : "accent"}
        />
        <Stat
          label="Aynı IP'de cihaz"
          value={d.ayni_ip_cihaz}
          tone={d.ayni_ip_cihaz > 3 ? "danger" : "default"}
        />
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        {/* ── TEKNİK BİLGİ ── */}
        <Card>
          <CardTitle>Cihaz bilgisi</CardTitle>
          <KeyValue label="Cihaz kimliği" value={deviceId} mono />
          <KeyValue label="Kayıt sayısı" value={`${d.kayit_adet} satır`} />
          <KeyValue label="Platform" value={label.platform(d.platform)} />
          <KeyValue label="Model" value={d.model ?? "—"} />
          <KeyValue label="Son IP" value={d.ip ?? "—"} mono tone={d.ip_banned ? "danger" : "default"} />
          <KeyValue label="İlk görülme" value={d.ilk_gorulme ? fmtDate(d.ilk_gorulme) : "—"} />
          <KeyValue label="Son giriş" value={d.son_giris ? fmtDate(d.son_giris) : "—"} />
          <KeyValue
            label="Push"
            value={d.push_token_var ? (d.push_acik ? "Açık" : "Token var, kapalı") : "Token yok"}
          />
        </Card>

        {/* ── KULLANICILAR ── */}
        <Card className="lg:col-span-2">
          <CardTitle>
            Giriş yapan kullanıcılar ({d.kullanicilar.length})
          </CardTitle>

          {d.kullanicilar.length === 0 ? (
            <EmptyState
              title="Bu cihazla giriş yapan hesap yok"
            />
          ) : (
            <ul className="space-y-2">
              {d.kullanicilar.map((u) => (
                <li key={u.user_id}>
                  <Link
                    href={`/kullanicilar/${u.user_id}`}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-raised px-3.5 py-3 transition-colors hover:border-accent/40"
                  >
                    <Avatar url={u.avatar_url} name={u.username ?? u.name} size={38} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-medium text-text">
                          {u.username ?? "Profil yok"}
                        </span>
                        {u.is_banned && <Badge tone="danger">Banlı</Badge>}
                        {u.role === "business" && <Badge tone="scheduled">İşletme</Badge>}
                        {u.cihaz_adet > 1 && (
                          <Badge tone="neutral">{u.cihaz_adet} cihaz</Badge>
                        )}
                      </span>
                      <span className="block truncate text-[11.5px] text-faint">
                        {u.email ?? "—"}
                        {u.sehir ? ` · ${u.sehir}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[12px] text-muted">
                        {u.son_giris ? timeAgo(u.son_giris) : "—"}
                      </span>
                      <span className="block text-[10.5px] text-faint">son giriş</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {d.kullanicilar.length > 2 && (
            <p className="mt-3 rounded-xl border border-warn/25 bg-warn/[0.06] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-warn">
              Bu cihazla {d.kullanicilar.length} farklı hesap giriş yapmış. Ortak bir
              tablet olabilir; ama hesapların oluşturulma tarihleri yakınsa sahte
              hesap üretimi olabilir.
            </p>
          )}
        </Card>
      </div>

      {/* ── BANLAR ── */}
      {d.banlar.length > 0 && (
        <Card>
          <CardTitle>
            Ban kayıtları ({d.banlar.length})
          </CardTitle>
          <ul className="space-y-2">
            {d.banlar.map((b) => (
              <li key={b.id} className="rounded-xl border border-danger/25 bg-danger/[0.05] px-4 py-3">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge tone="danger">{label.banType(b.type)}</Badge>
                  <span className="text-[11.5px] text-faint">{timeAgo(b.created_at)}</span>
                  {b.banned_by && <span className="text-[11.5px] text-faint">· {b.banned_by}</span>}
                </div>
                <p className="text-[13.5px] text-text">{b.reason ?? "Sebep yazılmamış"}</p>
                {b.notes && <p className="mt-0.5 text-[12px] text-muted">{b.notes}</p>}
                <p className="mt-1 text-[11.5px] text-faint">
                  {b.until_at ? `Bitiş: ${fmtDate(b.until_at)}` : "Kalıcı"}
                </p>
                {b.user_id && (
                  <Link
                    href={`/kullanicilar/${b.user_id}`}
                    className="mt-1 inline-block text-[12px] text-info hover:underline"
                  >
                    Ban kaydının bağlı olduğu hesabı aç →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
