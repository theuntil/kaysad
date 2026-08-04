// src/components/BroadcastForm.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// BROADCAST GÖNDERME
//
// ★★★ EN ÖNEMLİ GÜVENLİK TASARIMI ★★★
// "Gönder" butonu, alıcı sayısı HESAPLANMADAN aktif olmuyor. Akış:
//
//   1. Tip + mesaj + filtre seç
//   2. "Kaç kişiye gidecek?" → sunucu sayar, ekranda gösterir
//   3. Sayıyı gördükten SONRA "Gönder" aktifleşir
//   4. Onay adımı: sayıyı tekrar gösteren bir doğrulama satırı
//   5. Sunucu, gönderim anında sayıyı YENİDEN hesaplar; %25'ten fazla
//      sapma varsa gönderimi durdurur (bkz. sendBroadcastAction)
//
// Sebep: yanlışlıkla 50.000 kişiye spam atmak geri alınamaz bir hata.
// Filtreyi yanlış kurduğunu ancak sayıyı görünce fark edersin.
// ═══════════════════════════════════════════════════════════════════════

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { countRecipientsAction, sendBroadcastAction } from "@/actions/notification.actions"
import {
  Badge, Button, Card, CardTitle, ErrorBox, Input, Label, Select,
  SuccessBox, Textarea, Toggle, WarnBox,
} from "@/components/ui"
import type { Popup } from "@/lib/types"

type BType = "promo" | "earthquake" | "popup"

const TYPE_INFO: Record<BType, { label: string; hint: string; tone: "promo" | "danger" | "live" }> = {
  promo: {
    label: "Kampanya / duyuru",
    hint: "Bildirim listesinde mor megafon ikonuyla görünür. Hedefi yoksa tıklanınca duyuru paneli açılır.",
    tone: "promo",
  },
  earthquake: {
    label: "Acil uyarı",
    hint: "Kırmızı uyarı ikonuyla görünür. Deprem, kesinti gibi acil durumlar için.",
    tone: "danger",
  },
  popup: {
    label: "Popup bildirimi",
    hint: "Kullanıcı bildirime bastığında seçtiğin popup açılır.",
    tone: "live",
  },
}

export function BroadcastForm({
  cities,
  popups,
}: {
  cities: { sehir: string; kullanici_sayisi: number }[]
  popups: Popup[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [type, setType] = useState<BType>("promo")
  const [message, setMessage] = useState("")
  const [popupId, setPopupId] = useState("")
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [studentsOnly, setStudentsOnly] = useState(false)
  const [citySearch, setCitySearch] = useState("")

  const [count, setCount] = useState<number | null>(null)
  const [countStale, setCountStale] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  /** Filtre değişince sayım geçersizleşir — kullanıcı yeniden saymak zorunda */
  const invalidate = () => {
    setCountStale(true)
    setConfirming(false)
  }

  const toggleCity = (c: string) => {
    setSelectedCities((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
    invalidate()
  }

  const filteredCities = citySearch.trim()
    ? cities.filter((c) => c.sehir.toLocaleLowerCase("tr").includes(citySearch.toLocaleLowerCase("tr")))
    : cities

  const doCount = () => {
    setMsg(null)
    startTransition(async () => {
      const res = await countRecipientsAction({
        cities: selectedCities.length ? selectedCities : null,
        studentsOnly,
      })
      if (!res.ok) {
        setMsg({ ok: false, text: res.error ?? "Sayım yapılamadı." })
        return
      }
      setCount(res.count ?? 0)
      setCountStale(false)
    })
  }

  const doSend = () => {
    setMsg(null)
    startTransition(async () => {
      const res = await sendBroadcastAction({
        type,
        message: message.trim(),
        popupId: type === "popup" ? popupId : null,
        cities: selectedCities.length ? selectedCities : null,
        studentsOnly,
        expectedCount: count ?? 0,
      })
      setMsg({ ok: res.ok, text: res.ok ? (res.message ?? "Gönderildi.") : (res.error ?? "Gönderilemedi.") })
      setConfirming(false)
      if (res.ok) {
        // Formu temizle — aynı bildirimi kazara iki kez göndermeyi zorlaştırır
        setMessage("")
        setPopupId("")
        setCount(null)
        setCountStale(false)
        router.refresh()
      }
    })
  }

  const contentOk = type === "popup" ? !!popupId : message.trim().length > 0
  const countReady = count !== null && !countStale
  const canSend = contentOk && countReady && (count ?? 0) > 0 && !pending

  const info = TYPE_INFO[type]
  const selectedPopup = popups.find((p) => p.id === popupId)

  return (
    <div className="space-y-5">
      {/* ── TİP ── */}
      <Card>
        <CardTitle>
          Bildirim tipi
        </CardTitle>
        <div className="space-y-3">
          <Select
            value={type}
            onChange={(e) => { setType(e.target.value as BType); invalidate(); setMsg(null) }}
          >
            {(Object.keys(TYPE_INFO) as BType[]).map((t) => (
              <option key={t} value={t}>{TYPE_INFO[t].label}</option>
            ))}
          </Select>
          <div className="flex items-start gap-2">
            <Badge tone={info.tone}>{type}</Badge>
            <p className="text-[12px] leading-relaxed text-muted">{info.hint}</p>
          </div>
        </div>
      </Card>

      {/* ── İÇERİK ── */}
      <Card>
        <CardTitle>İçerik</CardTitle>

        {type === "popup" ? (
          <div className="space-y-4">
            <div>
              <Label required>Popup seç</Label>
              <Select value={popupId} onChange={(e) => { setPopupId(e.target.value); setMsg(null) }}>
                <option value="">— Popup seç —</option>
                {popups.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}{p.is_active ? "" : " (kapalı)"}
                  </option>
                ))}
              </Select>
            </div>

            {selectedPopup && !selectedPopup.is_active && (
              <WarnBox>
                Seçtiğin popup <strong>kapalı</strong>. Bildirim gider ama kullanıcı bastığında
                &quot;bu duyuru artık geçerli değil&quot; mesajı görür. Önce popup&apos;ı yayına al.
              </WarnBox>
            )}

            <div>
              <Label hint={`Boş bırakırsan popup başlığı kullanılır${selectedPopup ? `: "${selectedPopup.title}"` : ""}.`}>
                Bildirim metni
              </Label>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Kampanyayı kaçırma!"
                maxLength={200}
              />
            </div>
          </div>
        ) : (
          <div>
            <Label required>Mesaj</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={
                type === "earthquake"
                  ? "Bölgende deprem meydana geldi. Güvenli alanda kal."
                  : "Yeni sezon indirimleri başladı! Uygulamayı keşfetmeye devam et."
              }
              maxLength={500}
            />
          </div>
        )}
      </Card>

      {/* ── HEDEFLEME ── */}
      <Card>
        <CardTitle>
          Hedefleme
        </CardTitle>

        <div className="space-y-4">
          <div>
            <Label>
              Şehirler {selectedCities.length > 0 && `(${selectedCities.length} seçili)`}
            </Label>

            {cities.length === 0 ? (
              <p className="text-[12.5px] text-faint">Şehir bilgisi olan kullanıcı bulunamadı.</p>
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
                              ? "rounded-lg border border-accent/40 bg-accent/15 px-2.5 py-1.5 text-[12px] font-medium text-accent"
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
                    onClick={() => { setSelectedCities([]); invalidate() }}
                    className="mt-2 text-[12px] text-muted underline-offset-2 hover:text-text hover:underline"
                  >
                    Seçimi temizle (tüm şehirlere gönder)
                  </button>
                )}
              </>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-raised p-3.5 transition-colors hover:border-white/20 has-[:checked]:border-accent/40 has-[:checked]:bg-accent/[0.06]">
            <input
              type="checkbox"
              checked={studentsOnly}
              onChange={(e) => { setStudentsOnly(e.target.checked); invalidate() }}
              className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
            />
            <span>
              <span className="block text-[13.5px] font-medium text-text">Sadece öğrenciler</span>
              <span className="mt-0.5 block text-[11.5px] text-faint">profiles.ogrenci = true olanlar</span>
            </span>
          </label>
        </div>
      </Card>

      {/* ── SAYIM + GÖNDERİM ── */}
      <Card>
        <CardTitle>
          Gönderim
        </CardTitle>

        <div className="space-y-4">
          {/* Sayım */}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={doCount} disabled={pending}>
              {pending && count === null ? "Hesaplanıyor…" : "Kaç kişiye gidecek?"}
            </Button>

            {count !== null && (
              <div className={countStale ? "opacity-45" : ""}>
                <span className="text-[22px] font-bold tabular-nums text-accent">
                  {count.toLocaleString("tr-TR")}
                </span>
                <span className="ml-2 text-[12.5px] text-muted">kullanıcı</span>
              </div>
            )}
          </div>

          {countStale && count !== null && (
            <WarnBox>Filtreleri değiştirdin — sayımı yenile.</WarnBox>
          )}

          {count === 0 && !countStale && (
            <ErrorBox>
              Bu filtrelere uyan hiç kullanıcı yok. Şehir seçimini veya öğrenci filtresini gözden geçir.
            </ErrorBox>
          )}

          {/* Onay + gönder */}
          {!confirming ? (
            <Button disabled={!canSend} onClick={() => setConfirming(true)}>
              Gönder
            </Button>
          ) : (
            <div className="animate-fade-up space-y-3 rounded-xl border border-warn/30 bg-warn/[0.07] p-4">
              <p className="text-[13px] leading-relaxed text-text">
                <strong>{(count ?? 0).toLocaleString("tr-TR")} kullanıcıya</strong>{" "}
                <Badge tone={info.tone}>{type}</Badge> bildirimi gönderilecek.
              </p>
              <p className="text-[12px] leading-relaxed text-muted">
                {type === "popup" && selectedPopup
                  ? `Popup: "${selectedPopup.title}"`
                  : `Mesaj: "${message.trim().slice(0, 120)}${message.trim().length > 120 ? "…" : ""}"`}
                <br />
                Hedef: {selectedCities.length ? selectedCities.join(", ") : "tüm şehirler"}
                {studentsOnly && " · sadece öğrenciler"}
              </p>
              <p className="text-[11.5px] leading-relaxed text-warn">
                Bu işlem geri alınabilir ama kullanıcılar bildirimi görmüş olabilir.
              </p>
              <div className="flex gap-2">
                <Button disabled={pending} onClick={doSend}>
                  {pending ? "Gönderiliyor…" : "Onayla ve gönder"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>Vazgeç</Button>
              </div>
            </div>
          )}

          {!countReady && contentOk && (
            <p className="text-[11.5px] text-faint">
              Gönder butonu, alıcı sayısını hesapladıktan sonra aktifleşir.
            </p>
          )}
          {!contentOk && (
            <p className="text-[11.5px] text-faint">
              {type === "popup" ? "Bir popup seç." : "Mesaj yaz."}
            </p>
          )}

          {msg && (msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>)}
        </div>
      </Card>
    </div>
  )
}
