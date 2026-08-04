// src/components/MailComposer.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// MAİL YAZMA
//
// ★ HTML modunda basit bir zengin editör var (contentEditable +
//   document.execCommand). Ağır bir editör kütüphanesi (TipTap ~150KB)
//   eklemek yerine bunu tercih ettim: kalın/italik/link/liste/görsel
//   yeterli ve bundle büyümüyor.
//
// ★ Şablon anahtarı açıkken içerik varsayılan HTML çerçevesinin içine
//   yerleştiriliyor; kapalıyken ham HTML gönderiliyor.
// ═══════════════════════════════════════════════════════════════════════

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { sendMailAction } from "@/actions/mail.actions"
import { RecipientPicker, type Recipient } from "@/components/RecipientPicker"
import {
  Button, Card, ErrorBox, Field, Input, Segmented, Spinner, SuccessBox,
  Switch, Textarea,
} from "@/components/ui"
import type { QuickUser } from "@/actions/users.actions"
import { cn } from "@/lib/utils"
import { LinkPicker, MediaPicker } from "@/components/MediaPicker"

const ARAC: { cmd: string; arg?: string; label: string; icon: React.ReactNode }[] = [
  { cmd: "bold", label: "Kalın", icon: <span className="font-bold">B</span> },
  { cmd: "italic", label: "İtalik", icon: <span className="italic">I</span> },
  { cmd: "underline", label: "Altı çizili", icon: <span className="underline">U</span> },
  { cmd: "formatBlock", arg: "h2", label: "Başlık", icon: <span className="font-bold">H</span> },
  { cmd: "insertUnorderedList", label: "Liste", icon: <span>•</span> },
  { cmd: "justifyLeft", label: "Sola", icon: <span>⇤</span> },
  { cmd: "justifyCenter", label: "Ortala", icon: <span>≡</span> },
]

export function MailComposer({
  defaultTo, defaultUser, defaultSubject, defaultBody,
}: {
  defaultTo?: string
  defaultUser?: QuickUser | null
  /** Yanıt/iletme için hazır konu */
  defaultSubject?: string
  /** Yanıt/iletme için alıntılanmış gövde */
  defaultBody?: string
}) {
  const router = useRouter()
  const editor = useRef<HTMLDivElement>(null)

  const [alici, setAlici] = useState<Recipient | null>(
    defaultUser?.email
      ? { email: defaultUser.email, name: defaultUser.name ?? defaultUser.username, user: defaultUser }
      : defaultTo
        ? { email: defaultTo, name: null, user: null }
        : null
  )
  const [mod, setMod] = useState<"html" | "text">("html")
  const [sablon, setSablon] = useState(true)
  const [konu, setKonu] = useState(defaultSubject ?? "")
  const [duzMetin, setDuzMetin] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  /* ★ Yanıt/iletme gövdesi editöre bir kez yazılıyor.
     `dangerouslySetInnerHTML` kullanılamıyor — contentEditable ile
     React arasında çakışıyor, imleç sıfırlanıyor. */
  const govdeYazildi = useRef(false)
  useEffect(() => {
    if (govdeYazildi.current || !defaultBody || !editor.current) return
    editor.current.innerHTML = defaultBody
    govdeYazildi.current = true
  }, [defaultBody])

  /* Modal durumları */
  const [linkModal, setLinkModal] = useState(false)
  const [medyaModal, setMedyaModal] = useState(false)
  const [butonModal, setButonModal] = useState(false)

  const hedef = alici?.email ?? ""

  function komut(cmd: string, arg?: string) {
    editor.current?.focus()
    document.execCommand(cmd, false, arg)
  }

  /* ★ window.prompt KALDIRILDI. Tarayıcının kutusu tema dışı
     görünüyordu ve kullanıcıdan URL yazmasını istiyordu — panelde
     zaten bir medya kütüphanesi varken. */

  function linkUygula(url: string, metin: string) {
    // Seçili metin varsa onu bağlantıya çevir, yoksa yeni metin ekle
    const secim = window.getSelection()?.toString()
    if (secim) {
      komut("createLink", url)
    } else {
      komut("insertHTML",
        `<a href="${url}" style="color:#0a84ff;">${metin || url}</a>`)
    }
  }

  function gorselUygula(url: string) {
    komut("insertHTML",
      `<img src="${url}" alt="" style="max-width:100%;height:auto;border-radius:10px;display:block;margin:14px 0;">`)
  }

  function butonUygula(url: string, metin: string) {
    komut("insertHTML",
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;"><tr>` +
      `<td style="border-radius:10px;background:#1c1c1e;" bgcolor="#1c1c1e">` +
      `<a href="${url}" style="display:inline-block;padding:13px 26px;color:#ffffff;` +
      `text-decoration:none;font-weight:600;font-size:14px;">${metin || "Görüntüle"}</a>` +
      `</td></tr></table>`)
  }

  async function gonder() {
    setBusy(true); setErr(null); setOk(null)

    const icerik = mod === "html" ? (editor.current?.innerHTML ?? "") : duzMetin

    const r = await sendMailAction({
      to: hedef,
      subject: konu,
      body: icerik,
      mode: mod,
      useTemplate: mod === "html" && sablon,
      userId: alici?.user?.user_id ?? null,
    })

    setBusy(false)
    if (!r.ok) { setErr(r.error ?? "Gönderilemedi."); return }

    setOk(r.message ?? "Gönderildi.")
    // ★ Gönderdikten sonra listeye dön — formda kalmak
    //   "gitti mi?" sorusunu doğuruyordu
    // ★ "outbox" diye bir sekme yok — gelen kutusuna dönüyor
    router.push("/mail")
    setKonu(""); setDuzMetin("")
    if (editor.current) editor.current.innerHTML = ""
    router.refresh()
  }

  return (
    <>
    <Card>
      {err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}
      {ok && <div className="mb-3"><SuccessBox>{ok}</SuccessBox></div>}

      <div className="space-y-4">
        {/* ── ALICI: tek alan, kullanıcı ya da serbest adres ── */}
        <div>
          <div className="mb-2 text-[13px] font-medium text-text">Alıcı</div>
          <RecipientPicker value={alici} onChange={setAlici} autoFocus={!alici} />
        </div>

        <Field label="Konu" required>
          <Input value={konu} onChange={(e) => setKonu(e.target.value)} maxLength={200} />
        </Field>

        <Segmented
          value={mod}
          onChange={(v) => setMod(v)}
          options={[
            { value: "html", label: "HTML" },
            { value: "text", label: "Düz metin" },
          ]}
        />

        {mod === "html" ? (
          <div className="space-y-2">
            <Switch checked={sablon} onChange={setSablon} label="Varsayılan şablonu kullan" />

            {/* Araç çubuğu */}
            <div className="flex flex-wrap gap-1 rounded-t-xl border border-hairline bg-raised p-1.5">
              {ARAC.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  title={a.label}
                  onClick={() => komut(a.cmd, a.arg)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[13px] text-muted transition-colors hover:bg-white/[0.08] hover:text-text"
                >
                  {a.icon}
                </button>
              ))}
              <div className="mx-1 w-px bg-hairline" />
              <button
                type="button"
                title="Bağlantı"
                onClick={() => setLinkModal(true)}
                className="flex h-8 items-center rounded-lg px-2.5 text-[12px] text-muted hover:bg-white/[0.08] hover:text-text"
              >
                Bağlantı
              </button>
              <button
                type="button"
                title="Görsel"
                onClick={() => setMedyaModal(true)}
                className="flex h-8 items-center rounded-lg px-2.5 text-[12px] text-muted hover:bg-white/[0.08] hover:text-text"
              >
                Görsel
              </button>
              <button
                type="button"
                title="Buton"
                onClick={() => setButonModal(true)}
                className="flex h-8 items-center rounded-lg px-2.5 text-[12px] text-muted hover:bg-white/[0.08] hover:text-text"
              >
                Buton
              </button>
            </div>

            {/* Editör */}
            <div
              ref={editor}
              contentEditable
              suppressContentEditableWarning
              className={cn(
                "min-h-[280px] rounded-b-xl border border-t-0 border-hairline bg-raised px-4 py-3",
                "text-[14px] leading-relaxed text-text outline-none",
                "[&_a]:text-info [&_a]:underline [&_h2]:mb-2 [&_h2]:mt-3 [&_h2]:text-[18px] [&_h2]:font-bold",
                "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_img]:my-3 [&_img]:rounded-lg"
              )}
            />
          </div>
        ) : (
          <Field label="İçerik" required>
            <Textarea
              value={duzMetin}
              onChange={(e) => setDuzMetin(e.target.value)}
              className="min-h-[280px]"
            />
          </Field>
        )}

        <div className="flex justify-end">
          <Button onClick={gonder} disabled={busy || !hedef || !konu.trim()}>
            {busy && <Spinner />} Gönder
          </Button>
        </div>
      </div>
    </Card>

      {/* ══ MEDYA SEÇİCİ ══ */}
      <MediaPicker
        open={medyaModal}
        onClose={() => setMedyaModal(false)}
        onSelect={gorselUygula}
      />

      {/* ══ BAĞLANTI ══ */}
      <LinkPicker
        open={linkModal}
        onClose={() => setLinkModal(false)}
        onSubmit={linkUygula}
        baslik="Bağlantı ekle"
      />

      {/* ══ BUTON ══ */}
      <LinkPicker
        open={butonModal}
        onClose={() => setButonModal(false)}
        onSubmit={butonUygula}
        baslik="Buton ekle"
        varsayilanMetin="Görüntüle"
      />
    </>
  )
}
