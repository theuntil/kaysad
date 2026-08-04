"use client"

// src/components/StorageDiagnostics.tsx
//
// ═══════════════════════════════════════════════════════════════════════
// DEPOLAMA TANISI
//
// ★ "Görsel açılamadı" hatasının sebebini kesin gösteriyor. Üç olası
//   sebep var ve hangisi olduğu tahminle bulunamıyor:
//     1. Bucket yok       → SQL çalıştırılmamış
//     2. Bucket kapalı    → herkese açık değil
//     3. Adres iç ağda    → tarayıcı erişemiyor
//
// ★ Örnek görseli GERÇEKTEN yüklemeye çalışıyor. Ayar doğru görünse de
//   açılmıyorsa bu testte belli oluyor.
// ═══════════════════════════════════════════════════════════════════════

import { useCallback, useState } from "react"
import {
  diagnoseStorage, testStorageUrl,
  type DepolamaTani, type UrlTesti,
} from "@/actions/upload.actions"
import { Badge, Button, Card, CardTitle, ErrorBox, Spinner, WarnBox } from "@/components/ui"

export function StorageDiagnostics() {
  const [tani, setTani] = useState<DepolamaTani | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const calistir = useCallback(async () => {
    setBusy(true); setErr(null)
    const r = await diagnoseStorage()
    setBusy(false)
    if (!r) { setErr("Tanı çalıştırılamadı."); return }
    setTani(r)
  }, [])

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Depolama tanısı</CardTitle>
          <p className="mt-1 text-[12.5px] text-muted">
            Görseller yükleniyor ama açılmıyorsa sebebini burada gör.
          </p>
        </div>
        <Button onClick={calistir} disabled={busy}>
          {busy && <Spinner />} Kontrol et
        </Button>
      </div>

      {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}

      {tani && (
        <>
          {/* Teşhis */}
          <div className={
            "mb-4 rounded-xl border p-4 " +
            (tani.cozum
              ? "border-danger/30 bg-danger/[0.06]"
              : "border-accent/30 bg-accent/[0.06]")
          }>
            <p className="text-[13.5px] font-semibold text-text">{tani.tani}</p>
            {tani.cozum && (
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                {tani.cozum}
              </p>
            )}
          </div>

          {/* Adresler */}
          <div className="mb-4 space-y-2">
            <AdresSatiri
              etiket="Sunucu adresi"
              deger={tani.ic_adres}
              aciklama="Panel Supabase'e bu adresten bağlanıyor"
            />
            <AdresSatiri
              etiket="Genel adres"
              deger={tani.genel_adres}
              aciklama="Görsel URL'leri bundan üretiliyor — tarayıcı buna erişebilmeli"
              vurgu={tani.ayri_mi}
            />
          </div>

          {/* Bucket'lar */}
          <div className="space-y-2.5">
            {tani.bucketlar.map((b) => (
              <div
                key={b.id}
                className="rounded-xl border border-hairline bg-raised p-3.5"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold text-text">
                    {b.id}
                  </span>
                  {!b.var_mi ? (
                    <Badge tone="danger">yok</Badge>
                  ) : b.public ? (
                    <Badge tone="live">herkese açık</Badge>
                  ) : (
                    <Badge tone="danger">kapalı</Badge>
                  )}
                  <span className="ml-auto text-[11.5px] text-faint">
                    {b.dosya_sayisi} dosya
                  </span>
                </div>

                {b.ornek_url && (
                  <OrnekGorsel url={b.ornek_url} />
                )}
              </div>
            ))}
          </div>

          {tani.ayri_mi && (
            <div className="mt-4">
              <WarnBox>
                Sunucu adresi ile genel adres farklı. Bu doğru kurulum —
                panel iç ağdan bağlanıyor, tarayıcı dış adresten görseli
                alıyor.
              </WarnBox>
            </div>
          )}
        </>
      )}
    </Card>
  )
}

function AdresSatiri({
  etiket, deger, aciklama, vurgu,
}: {
  etiket: string
  deger: string
  aciklama: string
  vurgu?: boolean
}) {
  return (
    <div className={
      "rounded-xl border px-3.5 py-2.5 " +
      (vurgu ? "border-accent/25 bg-accent/[0.04]" : "border-hairline bg-raised")
    }>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-faint">
        {etiket}
      </div>
      <div className="mt-1 break-all font-mono text-[12.5px] text-text">{deger}</div>
      <div className="mt-1 text-[11.5px] text-muted">{aciklama}</div>
    </div>
  )
}

/**
 * ★ Örnek görseli gerçekten yüklemeyi dener. Ayarlar doğru görünse bile
 *   açılmıyorsa burada belli olur — tahmin yerine kanıt.
 */
function OrnekGorsel({ url }: { url: string }) {
  const [durum, setDurum] = useState<"bekliyor" | "oldu" | "olmadi">("bekliyor")
  const [test, setTest] = useState<UrlTesti | null>(null)
  const [testBusy, setTestBusy] = useState(false)

  /**
   * ★ Tarayıcı testi ile sunucu testi FARKLI şeyler söylüyor:
   *   · Tarayıcı → gömülebiliyor mu?
   *   · Sunucu   → dosya var mı, hangi başlıklar dönüyor?
   *
   *   İkisi çelişiyorsa (sunucu "var" der, tarayıcı "açılamadı" derse)
   *   sebep neredeyse kesin bir yanıt başlığıdır.
   */
  const sunucuTesti = async () => {
    setTestBusy(true)
    const r = await testStorageUrl(url)
    setTestBusy(false)
    setTest(r)
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[11.5px] text-muted">Tarayıcı testi:</span>
        {durum === "bekliyor" && <span className="text-[11.5px] text-faint">deneniyor…</span>}
        {durum === "oldu" && <Badge tone="live">açıldı</Badge>}
        {durum === "olmadi" && <Badge tone="danger">açılamadı</Badge>}

        <Button variant="ghost" size="sm" onClick={sunucuTesti} disabled={testBusy}>
          {testBusy && <Spinner />} Sunucudan test et
        </Button>
      </div>

      {test && (
        <div className={
          "mb-2 rounded-lg border p-3 " +
          (test.cozum && !test.tani.startsWith("Sunucu tarafından")
            ? "border-danger/30 bg-danger/[0.06]"
            : "border-accent/30 bg-accent/[0.06]")
        }>
          <p className="text-[12.5px] font-medium leading-relaxed text-text">
            {test.tani}
          </p>
          {test.cozum && (
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              {test.cozum}
            </p>
          )}

          <div className="mt-2 grid gap-1 border-t border-hairline pt-2 font-mono text-[10.5px] text-faint">
            <span>HTTP {test.durum ?? "—"} {test.durum_metni}</span>
            <span>content-type: {test.content_type ?? "—"}</span>
            <span>
              cross-origin-resource-policy: {test.corp ?? "(yok — iyi)"}
            </span>
            <span>boyut: {test.boyut !== null ? `${test.boyut} bayt` : "—"}</span>
          </div>
        </div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        onLoad={() => setDurum("oldu")}
        onError={() => setDurum("olmadi")}
        className={
          "h-16 rounded-lg border border-hairline object-contain " +
          (durum === "oldu" ? "" : "hidden")
        }
      />

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-1 block break-all font-mono text-[10.5px] text-faint hover:text-accent"
      >
        {url}
      </a>
    </div>
  )
}
