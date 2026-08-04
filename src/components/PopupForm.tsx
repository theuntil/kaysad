// src/components/PopupForm.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// POPUP FORMU
//
// Tasarım kararı: alanlar SEÇİME GÖRE gösteriliyor/gizleniyor. Örneğin
// "Aksiyon: hiçbiri" seçiliyken hedef sayfa/link alanları hiç görünmüyor.
// Amaç: 30+ alanlı bir form yerine, o an anlamı olan 8-10 alan göstermek.
//
// Sağda CANLI ÖNİZLEME var — mobil uygulamadaki PopupModal'ın birebir
// görsel taklidi. Kaydetmeden önce nasıl görüneceğini görüyorsun.
// ═══════════════════════════════════════════════════════════════════════

// ★ React 19: useFormState kaldırıldı, yerine react'ten useActionState
import { useState, useActionState } from "react"
import { useFormStatus } from "react-dom"
import Link from "next/link"
import { createPopupAction, updatePopupAction, type ActionResult } from "@/actions/popup.actions"
import {
  Card, CardTitle, Label, Input, Textarea, Select, Toggle, Button,
  ErrorBox, SuccessBox, WarnBox,
} from "@/components/ui"
import {
  POPUP_VARIANTS, POPUP_PLACEMENTS, POPUP_FREQUENCIES,
  type Popup, type PopupVariant, type PopupActionType, type PopupPlacement, type PopupFrequency,
} from "@/lib/types"
import { toDatetimeLocal } from "@/lib/utils"
import { PopupPreview } from "@/components/PopupPreview"

function SaveButton({ isEdit }: { isEdit: boolean }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? "Kaydediliyor…" : isEdit ? "Değişiklikleri kaydet" : "Popup oluştur"}
    </Button>
  )
}

export function PopupForm({
  popup,
  cities,
}: {
  popup?: Popup
  cities: { sehir: string; kullanici_sayisi: number }[]
}) {
  const isEdit = !!popup
  const action = isEdit ? updatePopupAction : createPopupAction
  const [state, formAction] = useActionState<ActionResult, FormData>(action, { ok: false })

  // ── Canlı önizleme + koşullu alanlar için kontrollü state ──
  const [title, setTitle] = useState(popup?.title ?? "")
  const [description, setDescription] = useState(popup?.description ?? "")
  const [imageUrl, setImageUrl] = useState(popup?.image_url ?? "")
  // ★ Logo başlığın üstünde gösterilir; popup tipi zorunlu (sistem / reklam)
  const [logoUrl, setLogoUrl] = useState(popup?.logo_url ?? "")
  const [popupKind, setPopupKind] = useState<"system" | "ad">(popup?.popup_kind ?? "system")
  const [variant, setVariant] = useState<PopupVariant>(popup?.variant ?? "default")
  const [actionType, setActionType] = useState<PopupActionType>(popup?.action_type ?? "none")
  const [actionLabel, setActionLabel] = useState(popup?.action_label ?? "")
  const [dismissLabel, setDismissLabel] = useState(popup?.dismiss_label ?? "")
  const [placement, setPlacement] = useState<PopupPlacement>(popup?.placement ?? "app_open")
  const [frequency, setFrequency] = useState<PopupFrequency>(popup?.frequency ?? "once")
  const [dismissible, setDismissible] = useState(popup?.dismissible ?? true)
  const [showOptOut, setShowOptOut] = useState(popup?.show_opt_out ?? false)
  const [logoUrlPreview, setLogoUrlPreview] = useState(popup?.logo_url ?? "")
  const [kindPreview, setKindPreview] = useState<"system" | "ad">(popup?.popup_kind ?? "system")
  const [selectedCities, setSelectedCities] = useState<string[]>(popup?.target_cities ?? [])
  const [citySearch, setCitySearch] = useState("")

  const toggleCity = (c: string) => {
    setSelectedCities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  const filteredCities = citySearch.trim()
    ? cities.filter((c) => c.sehir.toLocaleLowerCase("tr").includes(citySearch.toLocaleLowerCase("tr")))
    : cities

  const reachEstimate = selectedCities.length
    ? cities.filter((c) => selectedCities.includes(c.sehir)).reduce((s, c) => s + c.kullanici_sayisi, 0)
    : cities.reduce((s, c) => s + c.kullanici_sayisi, 0)

  return (
    <form action={formAction} className="grid gap-5 lg:grid-cols-[1fr_360px]">
      {isEdit && <input type="hidden" name="id" value={popup!.id} />}

      {/* ═══════════ SOL: FORM ═══════════ */}
      <div className="space-y-5">

        {/* ── İÇERİK ── */}
        <Card>
          <CardTitle>İçerik</CardTitle>
          <div className="space-y-4">
            <div>
              <Label required>Başlık</Label>
              <Input
                name="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Yeni sezon indirimleri!"
                maxLength={200}
                required
              />
            </div>

            <div>
              <Label>Açıklama</Label>
              <Textarea
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Bu hafta seçili kafelerde %30 indirim seni bekliyor."
                maxLength={1000}
              />
            </div>

            <div>
              <Label>
                Görsel adresi
              </Label>
              <Input
                name="image_url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://.../kampanya.jpg"
                type="url"
              />
            </div>

            <div>
              <Label>Logo adresi</Label>
              <Input
                name="logo_url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://.../logo.png"
                type="url"
              />
            </div>

            <div>
              <Label required>Popup tipi</Label>
              <Select
                name="popup_kind"
                value={popupKind}
                onChange={(e) => setPopupKind(e.target.value as "system" | "ad")}
              >
                <option value="system">Sistem popup&apos;ı</option>
                <option value="ad">Reklam</option>
              </Select>
            </div>

            <div>
              <Label>Görünüm</Label>
              <Select name="variant" value={variant} onChange={(e) => setVariant(e.target.value as PopupVariant)}>
                {POPUP_VARIANTS.map((v) => (
                  <option key={v.value} value={v.value}>{v.label}</option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        {/* ── AKSİYON ── */}
        <Card>
          <CardTitle>Aksiyon</CardTitle>
          <div className="space-y-4">
            <div>
              <Label>Buton davranışı</Label>
              <Select
                name="action_type"
                value={actionType}
                onChange={(e) => setActionType(e.target.value as PopupActionType)}
              >
                <option value="none">Hiçbir yere gitmez (sadece kapat)</option>
                <option value="internal">Uygulama içi sayfaya gider</option>
                <option value="external">Tarayıcıda link açar</option>
              </Select>
            </div>

            {actionType === "internal" && (
              <div className="animate-fade-up">
                <Label required>
                  Hedef sayfa
                </Label>
                <Input name="action_route" defaultValue={popup?.action_route ?? ""} placeholder="/food" required />
              </div>
            )}

            {actionType === "external" && (
              <div className="animate-fade-up">
                <Label required>Link</Label>
                <Input
                  name="action_url"
                  type="url"
                  defaultValue={popup?.action_url ?? ""}
                  placeholder="https://kays.com.tr/kampanya"
                  required
                />
              </div>
            )}

            {actionType !== "none" && (
              <div className="animate-fade-up">
                <Label>Buton yazısı</Label>
                <Input
                  name="action_label"
                  value={actionLabel}
                  onChange={(e) => setActionLabel(e.target.value)}
                  placeholder={actionType === "external" ? "Devam Et" : "Görüntüle"}
                  maxLength={40}
                />
              </div>
            )}

            <div>
              <Label>Kapatma yazısı</Label>
              <Input
                name="dismiss_label"
                value={dismissLabel}
                onChange={(e) => setDismissLabel(e.target.value)}
                placeholder="Kapat"
                maxLength={40}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-raised p-3.5 transition-colors hover:border-white/20 has-[:checked]:border-accent/40 has-[:checked]:bg-accent/[0.06]">
                <input
                  type="checkbox"
                  name="dismissible"
                  checked={dismissible}
                  onChange={(e) => setDismissible(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-text">Kapatılabilir</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">
                    Kapalıysa X butonu ve dışına dokunma çalışmaz
                  </span>
                </span>
              </label>

              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-raised p-3.5 transition-colors hover:border-white/20 has-[:checked]:border-accent/40 has-[:checked]:bg-accent/[0.06] ${!dismissible ? "pointer-events-none opacity-45" : ""}`}>
                <input
                  type="checkbox"
                  name="show_opt_out"
                  checked={showOptOut && dismissible}
                  onChange={(e) => setShowOptOut(e.target.checked)}
                  disabled={!dismissible}
                  className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
                />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-medium text-text">&quot;Bir daha gösterme&quot;</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-faint">
                    Kullanıcı kalıcı olarak susturabilir
                  </span>
                </span>
              </label>
            </div>

            {!dismissible && showOptOut && (
              <WarnBox>
                Popup kapatılamaz olduğu için &quot;bir daha gösterme&quot; bağlantısı görünmez.
                Kullanıcı kapatamadığı bir şeyi kalıcı susturamaz.
              </WarnBox>
            )}
          </div>
        </Card>

        {/* ── GÖSTERİM KURALLARI ── */}
        <Card>
          <CardTitle>Gösterim kuralları</CardTitle>
          <div className="space-y-4">
            <div>
              <Label>Nerede gösterilsin</Label>
              <Select
                name="placement"
                value={placement}
                onChange={(e) => setPlacement(e.target.value as PopupPlacement)}
              >
                {POPUP_PLACEMENTS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </Select>
              <p className="mt-1.5 text-[11.5px] text-faint">
                {POPUP_PLACEMENTS.find((p) => p.value === placement)?.hint}
              </p>
            </div>

            {placement === "screen" && (
              <div className="animate-fade-up">
                <Label required>
                  Ekran anahtarı
                </Label>
                <Input name="target_screen" defaultValue={popup?.target_screen ?? ""} placeholder="food" required />
              </div>
            )}

            <div>
              <Label>Kaç kez gösterilsin</Label>
              <Select
                name="frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as PopupFrequency)}
              >
                {POPUP_FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </Select>
              <p className="mt-1.5 text-[11.5px] text-faint">
                {POPUP_FREQUENCIES.find((f) => f.value === frequency)?.hint}
              </p>
            </div>

            {frequency === "n_times" && (
              <div className="animate-fade-up">
                <Label required>Toplam gösterim sayısı</Label>
                <Input name="max_shows" type="number" min={1} max={999} defaultValue={popup?.max_shows ?? 3} required />
              </div>
            )}

            {frequency === "max_per_day" && (
              <div className="animate-fade-up">
                <Label required>Günlük gösterim sayısı</Label>
                <Input name="max_per_day" type="number" min={1} max={50} defaultValue={popup?.max_per_day ?? 3} required />
              </div>
            )}

            <div>
              <Label>
                Bekleme süresi (saat)
              </Label>
              <Input name="cooldown_hours" type="number" min={0} max={720} defaultValue={popup?.cooldown_hours ?? ""} placeholder="—" />
            </div>

            {frequency === "every_time" && (
              <WarnBox>
                &quot;Her seferinde&quot; seçili — kullanıcı uygulamayı her açtığında bu popup çıkar.
                Acil duyurular dışında bezdirici olabilir. Bekleme süresi eklemeyi düşün.
              </WarnBox>
            )}

            {frequency === "once" && (
              <div>
                <p className="text-[11.5px] leading-relaxed text-faint">
                  Not: &quot;Bir kez&quot; ile bekleme süresi birlikte anlamsızdır — popup zaten
                  tekrar gösterilmeyecek.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* ── HEDEFLEME ── */}
        <Card>
          <CardTitle>Hedefleme</CardTitle>
          <div className="space-y-4">
            <div>
              <Label>
                Şehirler {selectedCities.length > 0 && `(${selectedCities.length} seçili)`}
              </Label>

              {/* Seçili şehirler gizli input olarak gönderiliyor */}
              {selectedCities.map((c) => (
                <input key={c} type="hidden" name="target_cities" value={c} />
              ))}

              {cities.length === 0 ? (
                <p className="text-[12.5px] text-faint">
                  Veritabanında şehir bilgisi olan kullanıcı bulunamadı.
                </p>
              ) : (
                <>
                  <Input
                    value={citySearch}
                    onChange={(e) => setCitySearch(e.target.value)}
                    placeholder="Şehir ara…"
                    className="mb-2"
                  />
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-border bg-raised p-2">
                    <div className="flex flex-wrap gap-1.5">
                      {filteredCities.map((c) => {
                        const on = selectedCities.includes(c.sehir)
                        return (
                          <button
                            key={c.sehir}
                            type="button"
                            onClick={() => toggleCity(c.sehir)}
                            className={
                              on
                                ? "rounded-lg border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-[12px] font-medium text-accent transition-colors"
                                : "rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:border-white/25 hover:text-text"
                            }
                          >
                            {c.sehir}
                            <span className="ml-1.5 text-[10.5px] opacity-60">{c.kullanici_sayisi}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {selectedCities.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedCities([])}
                      className="mt-2 text-[12px] text-muted underline-offset-2 hover:text-text hover:underline"
                    >
                      Seçimi temizle (tüm şehirlere gönder)
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle
                name="target_students_only"
                defaultChecked={popup?.target_students_only ?? false}
                label="Sadece öğrenciler"
              />
              <Toggle
                name="require_login"
                defaultChecked={popup?.require_login ?? true}
                label="Giriş zorunlu"
              />
            </div>

            <div>
              <Label>Platformlar</Label>
              <div className="flex gap-2">
                {(["ios", "android"] as const).map((pf) => {
                  const on = popup?.target_platforms?.includes(pf) ?? false
                  return (
                    <label
                      key={pf}
                      className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-border bg-raised py-2.5 text-[13px] text-muted transition-colors hover:border-white/20 has-[:checked]:border-accent/40 has-[:checked]:bg-accent/[0.06] has-[:checked]:text-accent"
                    >
                      <input
                        type="checkbox"
                        name="target_platforms"
                        value={pf}
                        defaultChecked={on}
                        className="h-4 w-4 cursor-pointer accent-accent"
                      />
                      {pf === "ios" ? "iOS" : "Android"}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Min. hesap yaşı (gün)</Label>
                <Input name="min_account_age_days" type="number" min={0} max={3650} defaultValue={popup?.min_account_age_days ?? ""} placeholder="—" />
              </div>
              <div>
                <Label>Maks. hesap yaşı (gün)</Label>
                <Input name="max_account_age_days" type="number" min={0} max={3650} defaultValue={popup?.max_account_age_days ?? ""} placeholder="—" />
              </div>
            </div>
          </div>
        </Card>

        {/* ── ZAMANLAMA & YÖNETİM ── */}
        <Card>
          <CardTitle>
            Zamanlama ve yönetim
          </CardTitle>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Başlangıç</Label>
                <Input name="start_at" type="datetime-local" defaultValue={toDatetimeLocal(popup?.start_at)} />
              </div>
              <div>
                <Label>Bitiş</Label>
                <Input name="end_at" type="datetime-local" defaultValue={toDatetimeLocal(popup?.end_at)} />
              </div>
            </div>

            <div>
              <Label>
                Öncelik
              </Label>
              <Input name="priority" type="number" min={-999} max={999} defaultValue={popup?.priority ?? 0} />
            </div>

            <div>
              <Label>Kendine not</Label>
              <Input name="note" defaultValue={popup?.note ?? ""} placeholder="Ağustos kampanyası — pazarlama talebi" maxLength={300} />
            </div>

            <Toggle
              name="is_active"
              defaultChecked={popup?.is_active ?? true}
              label="Aktif"
            />
          </div>
        </Card>

        {/* ── SONUÇ MESAJLARI ── */}
        {state.error && <ErrorBox>{state.error}</ErrorBox>}
        {state.ok && state.message && <SuccessBox>{state.message}</SuccessBox>}

        {/* ── KAYDET ── */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SaveButton isEdit={isEdit} />
          <Link href="/popups" className="w-full sm:w-auto">
            <Button variant="secondary" className="w-full sm:w-auto">Vazgeç</Button>
          </Link>
        </div>
      </div>

      {/* ═══════════ SAĞ: CANLI ÖNİZLEME ═══════════ */}
      <div className="lg:sticky lg:top-8 lg:self-start">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-faint">Önizleme</span>
          <span className="text-[11px] text-faint">Uygulamada böyle görünecek</span>
        </div>
        <PopupPreview
          title={title}
          description={description}
          imageUrl={imageUrl}
          logoUrl={logoUrl}
          popupKind={popupKind}
          variant={variant}
          actionType={actionType}
          actionLabel={actionLabel}
          dismissLabel={dismissLabel}
          dismissible={dismissible}
          showOptOut={showOptOut && dismissible}
        />
      </div>
    </form>
  )
}
