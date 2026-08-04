// src/components/PushLogTable.tsx
"use client"

// ┌─ BU BİLEŞEN NE YAPIYOR ───────────────────────────────────────────┐
// │ Push gönderim kaydını gösterir. "Bildirim gitmedi" şikayetinde ilk  │
// │ bakılacak yer burası — hangi cihaza ne zaman ne gitti, hata varsa   │
// │ Expo'nun döndürdüğü kod ne.                                         │
// │                                                                    │
// │ SIK GÖRÜLEN HATA KODLARI:                                           │
// │  DeviceNotRegistered → uygulama silinmiş/bildirim kapalı.           │
// │    Token otomatik silindi, bir şey yapmana gerek yok.               │
// │  MessageRateExceeded → çok hızlı gönderim, sonra tekrar denenir.    │
// │  InvalidCredentials → EXPO_ACCESS_TOKEN hatalı. Bunu düzeltmelisin. │
// │  MessageTooBig → data alanı 4KB'ı geçmiş.                           │
// └────────────────────────────────────────────────────────────────────┘

import { useState } from "react"
import type { PushLogRow } from "@/actions/push.actions"
import { Badge, Card, CardTitle, EmptyState, Select, Table, Td, Th } from "@/components/ui"
import { fmtDate } from "@/lib/utils"

const ERROR_HINT: Record<string, string> = {
  DeviceNotRegistered: "Uygulama silinmiş veya bildirimler kapatılmış — token otomatik silindi",
  InvalidCredentials: "EXPO_ACCESS_TOKEN hatalı veya proje eşleşmiyor",
  MessageTooBig: "Bildirim verisi 4KB sınırını aştı",
  MessageRateExceeded: "Çok hızlı gönderim — sonra tekrar denenecek",
  NetworkError: "Expo'ya ulaşılamadı",
  ProviderError: "Apple/Google tarafında geçici sorun",
}

const SOURCE_LABEL: Record<string, string> = {
  auto: "otomatik",
  manual: "elle",
  sweep: "tarama",
}

export function PushLogTable({ items }: { items: PushLogRow[] }) {
  const [filter, setFilter] = useState<"all" | "ok" | "error">("all")

  const shown = items.filter((i) => filter === "all" || i.result === filter)
  const okCount = items.filter((i) => i.result === "ok").length
  const errCount = items.length - okCount

  return (
    <Card padded={false}>
      <div className="p-5 pb-0">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <CardTitle>
            Gönderim kaydı
          </CardTitle>
          <div className="w-[170px]">
            <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">Tümü ({items.length})</option>
              <option value="ok">Başarılı ({okCount})</option>
              <option value="error">Hatalı ({errCount})</option>
            </Select>
          </div>
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title={items.length === 0 ? "Henüz gönderim yok" : "Bu filtreye uyan kayıt yok"}
          />
        </div>
      ) : (
        <Table className="rounded-none border-0 border-t border-border">
          <thead>
            <tr>
              <Th>Tarih</Th>
              <Th>Sonuç</Th>
              <Th>Kullanıcı</Th>
              <Th>Tip</Th>
              <Th>İçerik</Th>
              <Th>Kaynak</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} className="transition-colors hover:bg-white/[0.02]">
                <Td>
                  <span className="whitespace-nowrap text-[12px] tabular-nums text-muted">
                    {fmtDate(l.created_at)}
                  </span>
                </Td>
                <Td>
                  {l.result === "ok" ? (
                    <Badge tone="live">gitti</Badge>
                  ) : (
                    <div className="min-w-0">
                      <Badge tone="danger">{l.error_code ?? "hata"}</Badge>
                      {l.error_code && ERROR_HINT[l.error_code] && (
                        <p className="mt-1 max-w-[220px] text-[11px] leading-snug text-faint">
                          {ERROR_HINT[l.error_code]}
                        </p>
                      )}
                    </div>
                  )}
                </Td>
                <Td>
                  <span className="text-[12.5px] text-text">{l.username ?? "—"}</span>
                </Td>
                <Td>
                  <span className="font-mono text-[11.5px] text-muted">{l.type ?? "—"}</span>
                </Td>
                <Td className="max-w-[260px]">
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-text">{l.title ?? "—"}</div>
                    <div className="truncate text-[11.5px] text-faint">{l.body ?? ""}</div>
                  </div>
                </Td>
                <Td>
                  <span className="text-[11.5px] text-faint">
                    {SOURCE_LABEL[l.source] ?? l.source}
                    {l.sent_by && l.sent_by !== "system" && l.sent_by !== "trigger" && l.sent_by !== "cron"
                      ? ` · ${l.sent_by}`
                      : ""}
                  </span>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  )
}
