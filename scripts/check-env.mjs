#!/usr/bin/env node
/**
 * ORTAM DEĞİŞKENİ TEŞHİS ARACI
 *
 * KULLANIM:  npm run check-env
 *
 * Next.js'in okuduğu .env dosyalarını bulur, ayrıştırır ve her zorunlu
 * değişkeni tek tek doğrular. "Eksik ortam değişkeni" hatası alıyorsan
 * bunu çalıştır — sorunun tam olarak nerede olduğunu söyler.
 */

import fs from "node:fs"
import path from "node:path"

const CWD = process.cwd()

const C = {
  reset: "\x1b[0m", red: "\x1b[31m", green: "\x1b[32m",
  yellow: "\x1b[33m", cyan: "\x1b[36m", dim: "\x1b[2m", bold: "\x1b[1m",
}
const ok = (s) => `${C.green}✓${C.reset} ${s}`
const bad = (s) => `${C.red}✗${C.reset} ${s}`
const warn = (s) => `${C.yellow}!${C.reset} ${s}`
const line = () => console.log(C.dim + "─".repeat(64) + C.reset)

console.log(`\n${C.bold}Kays Admin — ortam değişkeni kontrolü${C.reset}`)
console.log(`${C.dim}çalışma dizini: ${CWD}${C.reset}\n`)

/* ─────────────────────────────────────────────────────────────
   1) DOSYA VAR MI
   Next.js dev'de bu sırayla okur: .env.local > .env.development > .env
───────────────────────────────────────────────────────────── */

line()
console.log(`${C.bold}1) Dosya kontrolü${C.reset}`)

const candidates = [".env.local", ".env.development.local", ".env.development", ".env"]
const found = []

for (const name of candidates) {
  const p = path.join(CWD, name)
  if (fs.existsSync(p)) {
    const size = fs.statSync(p).size
    found.push({ name, path: p, size })
    console.log(ok(`${name} bulundu ${C.dim}(${size} bayt)${C.reset}`))
  }
}

if (found.length === 0) {
  console.log(bad(`Hiçbir .env dosyası bulunamadı.`))
  console.log(`\n  Bu dizinde ${C.bold}.env${C.reset} adında bir dosya olmalı:`)
  console.log(`  ${C.cyan}${CWD}${C.reset}\n`)
  console.log(`  Oluştur:  ${C.cyan}cp .env.example .env${C.reset}\n`)

  // macOS/VS Code'da sık görülen tuzak: gizli uzantı
  const sneaky = fs.readdirSync(CWD).filter((f) =>
    /^\.?env/i.test(f) && !candidates.includes(f)
  )
  if (sneaky.length) {
    console.log(warn(`Benzer isimli dosya(lar) var — adı yanlış olabilir:`))
    sneaky.forEach((f) => console.log(`    ${C.yellow}${f}${C.reset}`))
    console.log(`\n  macOS Finder / VS Code uzantıları gizleyebiliyor.`)
    console.log(`  Dosya adı ${C.bold}tam olarak${C.reset} ".env" olmalı — ".env.txt" değil.`)
    console.log(`  Düzeltmek için: ${C.cyan}mv "${sneaky[0]}" .env${C.reset}\n`)
  }
  process.exit(1)
}

/* ─────────────────────────────────────────────────────────────
   2) AYRIŞTIRMA
───────────────────────────────────────────────────────────── */

line()
console.log(`${C.bold}2) İçerik ayrıştırma${C.reset}`)

/** Basit .env ayrıştırıcı — dotenv ile aynı temel kuralları uygular */
function parseEnv(raw) {
  const out = {}
  const problems = []
  const seen = new Map()   // anahtar → ilk görüldüğü satır
  raw.split(/\r?\n/).forEach((rawLine, i) => {
    const n = i + 1
    let l = rawLine
    // BOM temizliği (Windows Notepad / bazı editörler ekler)
    if (i === 0) l = l.replace(/^\uFEFF/, "")
    const trimmed = l.trim()
    if (!trimmed || trimmed.startsWith("#")) return

    const eq = trimmed.indexOf("=")
    if (eq === -1) {
      problems.push(`satır ${n}: "=" yok → "${trimmed.slice(0, 40)}"`)
      return
    }
    let key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()

    if (key.startsWith("export ")) {
      key = key.slice(7).trim()
      problems.push(`satır ${n}: "export " ön eki gereksiz (${key})`)
    }
    if (/\s/.test(key)) problems.push(`satır ${n}: anahtar adında boşluk var → "${key}"`)

    // Tırnak içindeyse temizle
    const quoted = (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))
    if (quoted) val = val.slice(1, -1)

    // ★ Aynı anahtar birden fazla kez tanımlanmış mı?
    //   Next.js'te SONUNCUSU kazanır — bu sessiz bir karışıklık kaynağı.
    if (seen.has(key)) {
      problems.push(
        `satır ${n}: ${key} DAHA ÖNCE satır ${seen.get(key)}'de tanımlanmış — ` +
        `sonuncusu (satır ${n}) geçerli olur, öncekini SİL`
      )
    }
    seen.set(key, n)

    out[key] = val
  })
  return { vars: out, problems }
}

const primary = found[0]
const raw = fs.readFileSync(primary.path, "utf8")
const { vars, problems } = parseEnv(raw)

console.log(ok(`${primary.name} okundu — ${Object.keys(vars).length} değişken bulundu`))

if (found.length > 1) {
  console.log(warn(`Birden fazla env dosyası var. Next.js öncelik sırası:`))
  found.forEach((f, i) => console.log(`    ${i + 1}. ${f.name}${i === 0 ? C.dim + "  ← bu kazanır" + C.reset : ""}`))
  console.log(`  ${C.dim}Aynı değişken iki dosyada varsa üstteki geçerli olur.${C.reset}`)
}

if (problems.length) {
  console.log()
  problems.forEach((p) => console.log(warn(p)))
}

if (Object.keys(vars).length === 0) {
  console.log(bad(`Dosya boş veya hiç geçerli satır yok.`))
  console.log(`  İlk 3 satır:`)
  raw.split(/\r?\n/).slice(0, 3).forEach((l) => console.log(`    ${C.dim}${JSON.stringify(l)}${C.reset}`))
  process.exit(1)
}

/* ─────────────────────────────────────────────────────────────
   3) ZORUNLU DEĞİŞKENLER
───────────────────────────────────────────────────────────── */

line()
console.log(`${C.bold}3) Zorunlu değişkenler${C.reset}`)

let fatal = 0

/** Değeri güvenli göster — gizli bilgiyi sızdırmadan */
const mask = (v, keep = 6) =>
  v.length <= keep ? "*".repeat(v.length) : v.slice(0, keep) + "…" + `(${v.length} karakter)`

const checks = [
  {
    key: "SUPABASE_URL",
    validate: (v) => {
      if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v)) {
        return `beklenen biçim: https://xxxx.supabase.co (girilen: ${v})`
      }
      return null
    },
    show: (v) => v,
  },
  {
    key: "SUPABASE_SERVICE_ROLE_KEY",
    validate: (v) => {
      if (v.includes("eyJhbGciOi...") || v.includes("REPLACE")) return "hâlâ örnek değerde"
      if (v.length < 40) return `çok kısa (${v.length} karakter) — service_role anahtarı değil gibi`
      if (!v.startsWith("eyJ")) return "JWT gibi görünmüyor (eyJ ile başlamalı)"
      return null
    },
    show: mask,
    extra: (v) => {
      // anon key ile karışmış mı — payload'daki role alanına bak
      try {
        const payload = JSON.parse(Buffer.from(v.split(".")[1], "base64").toString())
        if (payload.role && payload.role !== "service_role") {
          return `${C.red}DİKKAT: bu anahtarın rolü "${payload.role}" — service_role DEĞİL!${C.reset}`
        }
        if (payload.role === "service_role") return `${C.dim}rol: service_role ✓${C.reset}`
      } catch { /* JWT değilse sessiz geç */ }
      return null
    },
  },
  {
    key: "ADMIN_USERNAME",
    validate: (v) => (v.length < 1 ? "boş" : null),
    show: (v) => v,
  },
  {
    // ★ İki değişkenden BİRİ yeterli. B64 önerilen (içinde $ yok).
    key: "ADMIN_PASSWORD_HASH_B64",
    altKey: "ADMIN_PASSWORD_HASH",
    validate: (v, which) => {
      if (v.includes("REPLACE")) return "hâlâ örnek değerde — `npm run hash-password` ile üret"

      if (which === "ADMIN_PASSWORD_HASH_B64") {
        let decoded
        try { decoded = Buffer.from(v, "base64").toString("utf8").trim() } catch { return "base64 çözülemedi" }
        if (!decoded.startsWith("$2")) {
          return "base64 çözüldüğünde bcrypt hash'i çıkmıyor — kopyalarken eksik kalmış olabilir"
        }
        if (decoded.length < 55) return `çözülen hash çok kısa (${decoded.length})`
        return null
      }

      // Düz hash yolu
      if (v.startsWith("$2")) {
        if (v.length < 55) return `hash çok kısa (${v.length}) — kopyalarken kesilmiş olabilir`
        // ★★★ EN KRİTİK KONTROL ★★★
        // Bu script dosyayı HAM okuyor, ama Next.js `$` genişletmesi
        // uyguluyor. Yani burada "geçerli" görünen bir hash, uygulama
        // çalıştığında BOZULMUŞ olarak gelir. Kaçırılmamış `$` varsa uyar.
        return (
          "Next.js bunu BOZACAK. Dosyada geçerli görünüyor ama Next, .env " +
          "değerlerindeki `$` işaretlerini değişken sayıp siliyor (tırnak da " +
          "kurtarmıyor). ÇÖZÜM: `npm run hash-password` çalıştır ve çıkan " +
          "ADMIN_PASSWORD_HASH_B64 satırını kullan, bu satırı sil."
        )
      }

      // Kaçırılmış hali: \$2a\$12\$... → dosyada ters slash ile duruyor
      if (v.startsWith("\\$2")) {
        return null   // doğru kaçırılmış, Next düzgün okuyacak
      }

      // ★ Next'in $ genişletmesi tarafından bozulmuş mu?
      if (v.length >= 20 && /^[./A-Za-z0-9]+$/.test(v)) {
        return (
          "BOZULMUŞ. Next.js, .env değerlerindeki `$` işaretlerini değişken sayıp siliyor " +
          "(tırnak da kurtarmıyor). ÇÖZÜM: `npm run hash-password` çalıştır, çıkan " +
          "ADMIN_PASSWORD_HASH_B64 satırını kullan ve bu satırı sil."
        )
      }

      return "bcrypt hash değil — düz metin şifre yazmış olabilirsin. `npm run hash-password` ile üret"
    },
    show: mask,
    extra: (v, which) => {
      if (which === "ADMIN_PASSWORD_HASH_B64") {
        try {
          const d = Buffer.from(v, "base64").toString("utf8").trim()
          if (d.startsWith("$2")) return `${C.dim}base64 → bcrypt ✓ (${d.length} karakter)${C.reset}`
        } catch { /* yoksay */ }
        return null
      }
      return v.startsWith("$2") ? `${C.dim}bcrypt formatı ✓${C.reset}` : null
    },
  },
  {
    key: "SESSION_SECRET",
    validate: (v) => {
      if (v.includes("REPLACE")) return "hâlâ örnek değerde — `openssl rand -base64 48` ile üret"
      if (v.length < 32) return `en az 32 karakter olmalı (şu an ${v.length})`
      return null
    },
    show: mask,
  },
]

for (const c of checks) {
  // Hangi değişken tanımlıysa onu kullan (önce birincil, sonra alternatif)
  let which = c.key
  let v = vars[c.key]
  if ((v === undefined || v === "") && c.altKey && vars[c.altKey]) {
    which = c.altKey
    v = vars[c.altKey]
  }

  const label = c.altKey ? `${c.key}` : c.key

  if (v === undefined) {
    const hint = c.altKey ? ` ${C.dim}(veya ${c.altKey})${C.reset}` : ""
    console.log(bad(`${label}${hint} ${C.dim}— dosyada YOK${C.reset}`))
    fatal++
    continue
  }
  if (v === "") {
    console.log(bad(`${which} ${C.dim}— tanımlı ama BOŞ${C.reset}`))
    fatal++
    continue
  }
  const err = c.validate(v, which)
  if (err) {
    console.log(bad(`${which} — ${err}`))
    fatal++
  } else {
    console.log(ok(`${which} = ${C.dim}${c.show(v)}${C.reset}`))
    const ex = c.extra?.(v, which)
    if (ex) console.log(`    ${ex}`)
  }

  // İkisi birden tanımlıysa uyar
  if (c.altKey && vars[c.key] && vars[c.altKey]) {
    console.log(warn(`Hem ${c.key} hem ${c.altKey} tanımlı — ${c.key} kullanılıyor, diğerini silebilirsin`))
  }
}

/* ─────────────────────────────────────────────────────────────
   4) OPSİYONEL
───────────────────────────────────────────────────────────── */

line()
console.log(`${C.bold}4) Opsiyonel${C.reset}`)

const optional = ["SESSION_TTL_HOURS", "ALLOWED_ORIGINS", "ALLOWED_DEV_ORIGINS", "EXPO_ACCESS_TOKEN", "PUSH_WEBHOOK_SECRET"]
for (const key of optional) {
  const v = vars[key]
  if (v) {
    const secret = key.includes("TOKEN") || key.includes("SECRET")
    console.log(ok(`${key} = ${C.dim}${secret ? mask(v) : v}${C.reset}`))
  }
  else console.log(`${C.dim}·${C.reset} ${key} ${C.dim}tanımsız (varsayılan kullanılacak)${C.reset}`)
}

/* ─────────────────────────────────────────────────────────────
   SONUÇ
───────────────────────────────────────────────────────────── */

line()
if (fatal === 0) {
  console.log(`\n${C.green}${C.bold}Tüm zorunlu değişkenler geçerli.${C.reset}\n`)
  console.log(`Hâlâ "Eksik ortam değişkeni" hatası alıyorsan:`)
  console.log(`  ${C.bold}Dev sunucusunu tamamen durdur ve yeniden başlat.${C.reset}`)
  console.log(`  ${C.dim}(Ctrl+C → npm run dev)  Env değişkenleri sadece açılışta okunur —`)
  console.log(`  hot reload onları yeniden yüklemez.${C.reset}\n`)
  process.exit(0)
} else {
  console.log(`\n${C.red}${C.bold}${fatal} sorun bulundu.${C.reset} Yukarıdaki maddeleri düzelt.\n`)
  console.log(`${C.dim}Yardımcı komutlar:${C.reset}`)
  console.log(`  ${C.cyan}npm run hash-password${C.reset}        şifre hash'i üret`)
  console.log(`  ${C.cyan}openssl rand -base64 48${C.reset}      SESSION_SECRET üret\n`)
  process.exit(1)
}
