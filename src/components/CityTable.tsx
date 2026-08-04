// src/components/CityTable.tsx
"use client"

// ═══════════════════════════════════════════════════════════════════════
// TÜM ŞEHİRLER TABLOSU
//
// 81 il, arama ve sıralama ile. Kullanıcısı olmayan iller de listede —
// "burada hiç kimse yok" bilgisi de bir bilgi.
//
// Arama Türkçe karakter duyarsız (normalizeTr) ve plaka koduyla da
// çalışıyor: "34" yazınca İstanbul geliyor.
// ═══════════════════════════════════════════════════════════════════════

import { useMemo, useState } from "react"
import Link from "next/link"
import { Badge, Bar, Input, Table, Td, Th } from "@/components/ui"
import { CITIES, normalizeTr } from "@/lib/cities"
import { fmtNum, timeAgo } from "@/lib/utils"
import { cn } from "@/lib/utils"
import type { CityStatFull } from "@/lib/types.v3"

type SortKey = "kullanici" | "push_cihaz" | "ogrenci" | "isletme" | "banli" | "yeni_7g" | "sehir"

const PLAKA: Record<string, number> = Object.fromEntries(CITIES.map((c) => [c.ad, c.plaka]))
const BOLGE: Record<string, string> = Object.fromEntries(CITIES.map((c) => [c.ad, c.bolge]))

export function CityTable({ items }: { items: CityStatFull[] }) {
  const [q, setQ] = useState("")
  const [sort, setSort] = useState<SortKey>("kullanici")
  const [onlyPopulated, setOnlyPopulated] = useState(false)

  const filtered = useMemo(() => {
    const nq = normalizeTr(q)
    let list = items.filter((c) => {
      if (onlyPopulated && c.kullanici === 0) return false
      if (!nq) return true
      return (
        normalizeTr(c.sehir).includes(nq) ||
        String(PLAKA[c.sehir] ?? "") === nq ||
        normalizeTr(BOLGE[c.sehir] ?? "").includes(nq)
      )
    })

    list = [...list].sort((a, b) => {
      if (sort === "sehir") return a.sehir.localeCompare(b.sehir, "tr")
      return (b[sort] as number) - (a[sort] as number)
    })

    return list
  }, [items, q, sort, onlyPopulated])

  const max = Math.max(1, ...items.map((c) => c.kullanici))
  const toplam = items.reduce((s, c) => s + c.kullanici, 0)
  const gorunen = filtered.reduce((s, c) => s + c.kullanici, 0)

  const COLS: { key: SortKey; label: string }[] = [
    { key: "kullanici",  label: "Kullanıcı" },
    { key: "push_cihaz", label: "Push cihaz" },
    { key: "ogrenci",    label: "Öğrenci" },
    { key: "isletme",    label: "İşletme" },
    { key: "banli",      label: "Banlı" },
    { key: "yeni_7g",    label: "Yeni (7g)" },
  ]

  return (
    <div className="space-y-4">
      {/* Arama + sıralama */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Şehir, plaka kodu ya da bölge ara — ör. Ankara, 06, Marmara"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyPopulated((v) => !v)}
          className={cn(
            "h-11 shrink-0 rounded-xl border px-3.5 text-[13px] font-medium transition-colors",
            onlyPopulated
              ? "border-accent/40 bg-accent/10 text-text"
              : "border-hairline bg-raised text-muted hover:text-text"
          )}
        >
          {onlyPopulated ? "Sadece kullanıcısı olanlar" : "Tüm 81 il"}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-muted">
        <span>
          {filtered.length} il gösteriliyor · {fmtNum(gorunen)} kullanıcı
          {gorunen !== toplam && <span className="text-faint"> (toplam {fmtNum(toplam)})</span>}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-faint">Sırala:</span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-lg border border-hairline bg-raised px-2 py-1 text-[12.5px] text-text"
          >
            {COLS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            <option value="sehir">Alfabetik</option>
          </select>
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-hairline px-6 py-12 text-center text-[13px] text-faint">
          Aramaya uyan il yok.
        </p>
      ) : (
        <Table minWidth={860}>
          <thead>
            <tr>
              <Th>İl</Th>
              {COLS.map((c) => (
                <Th key={c.key} className="text-right">
                  <button
                    type="button"
                    onClick={() => setSort(c.key)}
                    className={cn(
                      "transition-colors hover:text-text",
                      sort === c.key && "text-text"
                    )}
                  >
                    {c.label}
                    {sort === c.key && " ↓"}
                  </button>
                </Th>
              ))}
              <Th>Son kayıt</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.sehir} className="transition-colors hover:bg-white/[0.03]">
                <Td>
                  <Link
                    href={`/sehirler/${encodeURIComponent(c.sehir)}`}
                    className="group flex items-center gap-2.5"
                  >
                    <span className="w-6 shrink-0 font-mono text-[11px] tabular-nums text-faint">
                      {String(PLAKA[c.sehir] ?? 0).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-text group-hover:text-accent">
                        {c.sehir}
                      </span>
                      <span className="block text-[11px] text-faint">{BOLGE[c.sehir]}</span>
                    </span>
                  </Link>
                  <div className="mt-1.5 max-w-[160px]">
                    <Bar pct={(c.kullanici / max) * 100} />
                  </div>
                </Td>
                <Td className="text-right text-[13.5px] font-semibold tabular-nums">
                  {c.kullanici === 0
                    ? <span className="font-normal text-faint">0</span>
                    : fmtNum(c.kullanici)}
                </Td>
                <Td className="text-right tabular-nums text-muted">{fmtNum(c.push_cihaz)}</Td>
                <Td className="text-right tabular-nums text-muted">{fmtNum(c.ogrenci)}</Td>
                <Td className="text-right tabular-nums text-muted">{fmtNum(c.isletme)}</Td>
                <Td className="text-right tabular-nums">
                  {c.banli > 0
                    ? <span className="text-danger">{fmtNum(c.banli)}</span>
                    : <span className="text-faint">0</span>}
                </Td>
                <Td className="text-right tabular-nums">
                  {c.yeni_7g > 0
                    ? <Badge tone="live">+{fmtNum(c.yeni_7g)}</Badge>
                    : <span className="text-faint">—</span>}
                </Td>
                <Td className="text-[12.5px] text-faint">
                  {c.son_kayit ? timeAgo(c.son_kayit) : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
