// src/components/IdentityEditor.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// KİMLİK DÜZENLEME
//
// ┌─ TASARIM ─────────────────────────────────────────────────────────┐
// │ Alanlar artık "düz metin satırı" değil; her biri kendi tipinde:    │
// │   • Telefon → +90 SABİT önek, sadece 10 hane girilir, 555 123 45 67│
// │     biçiminde gruplanır                                           │
// │   • E-posta → yazarken doğrulanır; geçersizse KAYDETME KAPALI       │
// │   • Kullanıcı adı → 3-30 karakter, harf/rakam/nokta/alt çizgi       │
// │   • Şehir → 81 il listesinden seçim (elle yazım hatası olmasın)     │
// └───────────────────────────────────────────────────────────────────┘
//
// ★ E-posta ve telefon HEM auth.users HEM profiles'ta güncellenir; tek
//   taraflı yazmak panelin yakaladığı tutarsızlıkların kaynağıydı.
// ★ Değişince doğrulama bayrağı sıfırlanır — yeni adres doğrulanmış
//   sayılamaz. Panel bunu kaydetmeden önce açıkça söylüyor.
// ═══════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { updateIdentityAction, type IdentityPatch } from "@/actions/users.actions"
import {
  Badge, Button, Card, CardTitle, ErrorBox, Field, Input, Modal, Select,
  Spinner, SuccessBox, Switch, WarnBox,
} from "@/components/ui"
import { CITY_NAMES } from "@/lib/cities"
import { AccountToggles, HESAP_AYARLARI } from "@/components/AccountToggles"
import {
  emailError, formatPhoneTr, isValidPhoneTr, toE164Tr, usernameError,
} from "@/lib/format"

export interface IdentityValues {
  authEmail: string | null
  authPhone: string | null
  emailConfirmed: boolean
  phoneConfirmed: boolean
  profileEmail: string | null
  profilePhone: string | null
  username: string | null
  name: string | null
  sehir: string | null
  bio: string | null
  website: string | null
  businessName: string | null
  gizli: boolean
  verify: boolean
  role: string | null
  isBoosted: boolean
  isBanned: boolean
  isStudent: boolean
  hasBio: boolean
  hasWebsite: boolean
  hasBusinessName: boolean
}

export function IdentityEditor({
  userId, values,
}: {
  userId: string
  values: IdentityValues
}) {
  const router = useRouter()

  const [email, setEmail] = useState(values.authEmail ?? "")
  const [phone, setPhone] = useState(formatPhoneTr(values.authPhone))
  const [username, setUsername] = useState(values.username ?? "")
  const [name, setName] = useState(values.name ?? "")
  const [sehir, setSehir] = useState(values.sehir ?? "")
  const [bio, setBio] = useState(values.bio ?? "")
  const [website, setWebsite] = useState(values.website ?? "")
  const [businessName, setBusinessName] = useState(values.businessName ?? "")
  const [gizli, setGizli] = useState(values.gizli)
  const [verify, setVerify] = useState(values.verify)
  const [role, setRole] = useState(values.role ?? "user")
  const [boosted, setBoosted] = useState(values.isBoosted)
  const [ogrenci, setOgrenci] = useState(values.isStudent)

  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  /* ── Doğrulama ── */
  const eMailErr = emailError(email)
  const phoneOk = isValidPhoneTr(phone)
  const userErr = usernameError(username)

  const gecerli = !eMailErr && phoneOk && !userErr

  /* ── Değişiklik tespiti ── */
  const patch = useMemo<IdentityPatch>(() => {
    const p: IdentityPatch = {}
    const yeniEmail = email.trim() || null
    const yeniPhone = toE164Tr(phone)

    if (yeniEmail !== (values.authEmail ?? null)) p.email = yeniEmail
    if (yeniPhone !== (values.authPhone ?? null)) p.phone = yeniPhone
    if (username.trim() !== (values.username ?? "")) p.username = username.trim()
    if ((name.trim() || null) !== (values.name ?? null)) p.name = name.trim() || null
    if ((sehir || null) !== (values.sehir ?? null)) p.sehir = sehir || null
    if (values.hasBio && (bio.trim() || null) !== (values.bio ?? null)) p.bio = bio.trim() || null
    if (values.hasWebsite && (website.trim() || null) !== (values.website ?? null)) {
      p.website = website.trim() || null
    }
    if (values.hasBusinessName && (businessName.trim() || null) !== (values.businessName ?? null)) {
      p.business_name = businessName.trim() || null
    }
    if (gizli !== values.gizli) p.gizli = gizli
    if (verify !== values.verify) p.verify = verify
    if (role !== (values.role ?? "user")) p.role = role
    if (boosted !== values.isBoosted) p.is_boosted = boosted
    if (ogrenci !== values.isStudent) p.ogrenci = ogrenci

    return p
  }, [email, phone, username, name, sehir, bio, website, businessName,
      gizli, verify, role, boosted, ogrenci, values])

  const degisenler = Object.keys(patch)
  const dogrulamaSifirlanacak =
    (patch.email !== undefined && values.emailConfirmed) ||
    (patch.phone !== undefined && values.phoneConfirmed)

  async function save() {
    setBusy(true); setErr(null); setOk(null)
    const r = await updateIdentityAction(userId, patch)
    setBusy(false)
    setConfirm(false)
    if (!r.ok) { setErr(r.error ?? "Kaydedilemedi."); return }
    setOk(r.message ?? "Kaydedildi.")
    router.refresh()
  }

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <CardTitle>
          Kimlik bilgileri
        </CardTitle>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setConfirm(true)}
            disabled={degisenler.length === 0 || !gecerli || busy}
          >
            {degisenler.length > 0 ? `${degisenler.length} değişikliği kaydet` : "Değişiklik yok"}
          </Button>
        </div>
      </div>

      {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}
      {ok && <div className="mb-3"><SuccessBox>{ok}</SuccessBox></div>}

      <div className="grid gap-4 sm:grid-cols-2">
        {/* ── E-POSTA ── */}
        <div className="sm:col-span-2">
          <Field
            label="E-posta"
          >
            <div className="relative">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ornek@eposta.com"
                className={eMailErr ? "border-danger/60 focus:border-danger/60 focus:ring-danger/15" : undefined}
                autoComplete="off"
                spellCheck={false}
              />
              {!eMailErr && email.trim() && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-accent">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className="h-4 w-4">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              )}
            </div>
          </Field>
          {eMailErr && <p className="mt-1 text-[12px] text-danger">{eMailErr}</p>}
          {values.profileEmail && values.authEmail &&
           values.profileEmail.toLowerCase() !== values.authEmail.toLowerCase() && (
            <p className="mt-1 text-[12px] text-warn">
              Profildeki e-posta farklı: {values.profileEmail} — kaydedince ikisi eşitlenir.
            </p>
          )}
        </div>

        {/* ── TELEFON ── */}
        <div className="sm:col-span-2">
          <Field label="Telefon">
            <div className="flex gap-2">
              {/* ★ +90 sabit: kullanıcı ülke kodunu yanlış yazamıyor */}
              <span className="flex h-11 shrink-0 items-center rounded-xl border border-hairline bg-raised px-3 font-mono text-[14px] text-muted">
                +90
              </span>
              <Input
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(formatPhoneTr(e.target.value))}
                placeholder="555 123 45 67"
                className={!phoneOk ? "border-danger/60 focus:border-danger/60 focus:ring-danger/15" : undefined}
                autoComplete="off"
              />
            </div>
          </Field>
          {!phoneOk && (
            <p className="mt-1 text-[12px] text-danger">
              Numara 10 hane olmalı ve 5 ile başlamalı (ör. 555 123 45 67).
            </p>
          )}
          <div className="mt-1 flex flex-wrap gap-2">
            {values.phoneConfirmed
              ? <Badge tone="live">Telefon doğrulanmış</Badge>
              : <Badge tone="neutral">Telefon doğrulanmamış</Badge>}
            {phone === "" && values.authPhone && (
              <Badge tone="expired">Kaydedersen telefon silinir</Badge>
            )}
          </div>
        </div>

        {/* ── KULLANICI ADI ── */}
        <div>
          <Field label="Kullanıcı adı" required>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
              placeholder="kullaniciadi"
              className={userErr ? "border-danger/60 focus:border-danger/60 focus:ring-danger/15" : undefined}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {userErr && <p className="mt-1 text-[12px] text-danger">{userErr}</p>}
        </div>

        {/* ── AD SOYAD ── */}
        <Field label="Ad soyad">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ahmet Yılmaz" />
        </Field>

        {/* ── ŞEHİR ── */}
        <Field label="Şehir">
          <Select value={sehir} onChange={(e) => setSehir(e.target.value)}>
            <option value="">— Seçilmemiş —</option>
            {CITY_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>

        {/* ── İŞLETME ADI ── */}
        {values.hasBusinessName && (
          <Field label="İşletme adı">
            <Input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Kays Kafe"
            />
          </Field>
        )}

        {/* ── WEBSITE ── */}
        {values.hasWebsite && (
          <Field label="Web sitesi">
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://ornek.com"
              spellCheck={false}
            />
          </Field>
        )}

        {/* ── BIO ── */}
        {values.hasBio && (
          <div className="sm:col-span-2">
            <Field label="Biyografi">
              <Input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Kısa tanıtım" />
            </Field>
          </div>
        )}

        {/* ── GİZLİ HESAP ── */}
        <div className="sm:col-span-2">
          <Switch
            checked={gizli}
            onChange={setGizli}
            label="Gizli hesap"
          />
        </div>

      </div>

      {/* ══════ HESAP AYARLARI — ikonlu kutular ══════ */}
      <div className="mt-5 border-t border-hairline pt-5">
        <div className="mb-3 text-[12px] font-semibold uppercase tracking-wider text-faint">
          Hesap ayarları
        </div>

        <AccountToggles
          defs={HESAP_AYARLARI}
          values={{
            gizli,
            verify,
            isBusiness: role === "business",
            isBoosted: boosted,
            isStudent: ogrenci,
          }}
          onChange={(k, v) => {
            if (k === "gizli") setGizli(v)
            else if (k === "verify") setVerify(v)
            else if (k === "isBusiness") setRole(v ? "business" : "user")
            else if (k === "isBoosted") setBoosted(v)
            else if (k === "isStudent") setOgrenci(v)
          }}
        />

        <p className="mt-2 text-[11px] text-faint">
          Ban durumu sayfa başındaki düğmeden yönetilir.
        </p>
      </div>

      {/* ── ONAY ── */}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Değişiklikleri kaydet"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>Vazgeç</Button>
            <Button onClick={save} disabled={busy}>{busy && <Spinner />} Kaydet</Button>
          </>
        }
      >
        <div className="space-y-3">
          <ul className="divide-y divide-hairline rounded-xl border border-hairline">
            {degisenler.map((k) => {
              const v = (patch as Record<string, unknown>)[k]
              const eski =
                k === "email" ? values.authEmail
                : k === "phone" ? values.authPhone
                : k === "username" ? values.username
                : k === "name" ? values.name
                : k === "sehir" ? values.sehir
                : k === "bio" ? values.bio
                : k === "website" ? values.website
                : k === "business_name" ? values.businessName
                : k === "gizli" ? (values.gizli ? "Evet" : "Hayır")
                : k === "verify" ? (values.verify ? "Evet" : "Hayır")
                : k === "role" ? (values.role === "business" ? "İşletme" : "Kullanıcı")
                : k === "is_boosted" ? (values.isBoosted ? "Evet" : "Hayır")
                : k === "ogrenci" ? (values.isStudent ? "Evet" : "Hayır")
                : null
              const yeni = typeof v === "boolean" ? (v ? "Evet" : "Hayır") : (v ?? "(boş)")
              return (
                <li key={k} className="px-3.5 py-2.5">
                  <div className="text-[11.5px] font-medium uppercase tracking-wider text-faint">{k}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="text-muted line-through">{eski || "(boş)"}</span>
                    <span className="text-faint">→</span>
                    <span className="font-medium text-text">{String(yeni)}</span>
                  </div>
                </li>
              )
            })}
          </ul>

          {dogrulamaSifirlanacak && (
            <WarnBox>
              E-posta veya telefon değişiyor: ilgili <strong>doğrulama sıfırlanacak</strong>.
              Kullanıcı yeni adresi/numarayı yeniden doğrulamak zorunda kalır.
            </WarnBox>
          )}

          {patch.username !== undefined && (
            <WarnBox>
              Kullanıcı adı değişiyor. Eski adla verilmiş bağlantılar ve mention&apos;lar
              artık bu profile gitmez.
            </WarnBox>
          )}
        </div>
      </Modal>
    </Card>
  )
}
