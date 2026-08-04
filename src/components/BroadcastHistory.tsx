// src/components/BroadcastHistory.tsx
"use client"

// Gönderilmiş broadcast'ler. Aynı mesaj binlerce satır oluşturduğu için
// veritabanında gruplayıp tek satır gösteriyoruz (admin_list_broadcasts).

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { undoBroadcastAction } from "@/actions/notification.actions"
import { Badge, Button, Card, CardTitle, EmptyState, ErrorBox, SuccessBox, Table, Td, Th } from "@/components/ui"
import type { BroadcastSummary } from "@/lib/types"
import { fmtNum, timeAgo } from "@/lib/utils"

const TONE: Record<string, "promo" | "danger" | "live" | "neutral"> = {
  promo: "promo",
  earthquake: "danger",
  popup: "live",
}

export function BroadcastHistory({ items }: { items: BroadcastSummary[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [confirmKey, setConfirmKey] = useState<string | null>(null)

  const undo = (b: BroadcastSummary) => {
    setMsg(null)
    startTransition(async () => {
      const res = await undoBroadcastAction({
        type: b.type,
        message: b.message,
        withinMinutes: 60 * 24 * 7, // 7 gün içinde gönderilmişleri kapsa
      })
      setMsg({ ok: res.ok, text: res.ok ? (res.message ?? "Geri alındı.") : (res.error ?? "Geri alınamadı.") })
      setConfirmKey(null)
      router.refresh()
    })
  }

  return (
    <Card padded={false}>
      <div className="p-5 pb-0">
        <CardTitle>
          Gönderilen bildirimler
        </CardTitle>
        {msg && (
          <div className="mb-4">
            {msg.ok ? <SuccessBox>{msg.text}</SuccessBox> : <ErrorBox>{msg.text}</ErrorBox>}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="Henüz broadcast gönderilmemiş"
          />
        </div>
      ) : (
        <Table className="rounded-none border-0 border-t border-border">
          <thead>
            <tr>
              <Th>Tip</Th>
              <Th>Mesaj</Th>
              <Th className="text-right">Gönderilen</Th>
              <Th className="text-right">Okunan</Th>
              <Th>Tarih</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {items.map((b, i) => {
              const key = `${b.type}::${b.message ?? ""}::${i}`
              const readRate = b.gonderilen > 0 ? Math.round((b.okunan / b.gonderilen) * 100) : 0
              const isConfirming = confirmKey === key
              return (
                <tr key={key} className="transition-colors hover:bg-white/[0.02]">
                  <Td>
                    <Badge tone={TONE[b.type] ?? "neutral"}>{b.type}</Badge>
                  </Td>
                  <Td className="max-w-[320px]">
                    <span className="line-clamp-2 text-[13px] leading-relaxed">
                      {b.message ?? <span className="text-faint">(mesaj yok)</span>}
                    </span>
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">{fmtNum(b.gonderilen)}</Td>
                  <Td className="text-right tabular-nums">
                    <span className="text-muted">{fmtNum(b.okunan)}</span>
                    <span className="ml-1.5 text-[11px] text-faint">({readRate}%)</span>
                  </Td>
                  <Td>
                    <span className="whitespace-nowrap text-[12.5px] text-muted">{timeAgo(b.son_gonderim)}</span>
                  </Td>
                  <Td>
                    {b.message === null ? (
                      <span className="text-[11.5px] text-faint">—</span>
                    ) : isConfirming ? (
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <Button variant="danger" size="sm" disabled={pending} onClick={() => undo(b)}>
                          Sil
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmKey(null)}>
                          Vazgeç
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmKey(key)}
                        title="Bu bildirimi tüm kullanıcılardan sil"
                      >
                        Geri al
                      </Button>
                    )}
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </Card>
  )
}
