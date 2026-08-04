#!/usr/bin/env node
/**
 * ŞİFRE HASH ÜRETİCİ
 *
 * KULLANIM:
 *   npm run hash-password
 *   npm run hash-password -- "SifremBurada"
 *
 * ─────────────────────────────────────────────────────────────────────
 * NEDEN İKİ FORMAT ÜRETİYOR
 *
 * bcrypt hash'leri `$2a$12$...` şeklinde `$` içerir. Next.js ise `.env`
 * dosyasındaki değerlere DEĞİŞKEN GENİŞLETMESİ uygular — yani `$2a` gibi
 * parçaları "tanımsız değişken" sayıp SİLER. Tırnak da kurtarmaz:
 *
 *   ADMIN_PASSWORD_HASH=$2a$12$abc...      → ✗ bozulur
 *   ADMIN_PASSWORD_HASH='$2a$12$abc...'    → ✗ bozulur
 *   ADMIN_PASSWORD_HASH="$2a$12$abc..."    → ✗ bozulur
 *   ADMIN_PASSWORD_HASH=\$2a\$12\$abc...   → ✓ çalışır (her $ kaçırılmış)
 *
 * Bu yüzden birincil öneri BASE64 formatı: içinde `$` yok, hiçbir kaçırma
 * gerekmiyor, kopyala-yapıştır güvenli. Panel her iki değişkeni de okur.
 * ─────────────────────────────────────────────────────────────────────
 */

import bcrypt from "bcryptjs"
import readline from "node:readline"

const COST = 12 // bcrypt maliyeti — 12 iyi bir denge (~250ms)

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", yellow: "\x1b[33m", cyan: "\x1b[36m",
}

function validate(pw) {
  const problems = []
  if (pw.length < 12) problems.push("en az 12 karakter olmalı")
  if (!/[a-z]/.test(pw)) problems.push("küçük harf içermeli")
  if (!/[A-Z]/.test(pw)) problems.push("büyük harf içermeli")
  if (!/[0-9]/.test(pw)) problems.push("rakam içermeli")
  if (!/[^A-Za-z0-9]/.test(pw)) problems.push("özel karakter içermeli")
  return problems
}

async function run(pw) {
  const problems = validate(pw)
  if (problems.length) {
    console.log(`\n${C.yellow}!  Şifre zayıf:${C.reset}`)
    problems.forEach((p) => console.log(`   • ${p}`))
    console.log(`\n${C.dim}Yine de hash üretiliyor. Panelin service_role erişimi olduğu için`)
    console.log(`daha güçlü bir şifre kullanmanı öneririm.${C.reset}`)
  }

  const hash = await bcrypt.hash(pw, COST)
  const b64 = Buffer.from(hash, "utf8").toString("base64")
  const escaped = hash.split("$").join("\\$")

  const bar = "=".repeat(72)

  console.log(`\n${bar}`)
  console.log(`${C.green}${C.bold}ÖNERİLEN — bunu .env dosyana yapıştır${C.reset}`)
  console.log(`${C.dim}(base64 formatı: içinde $ yok, hiçbir kaçırma gerekmez)${C.reset}\n`)
  console.log(`${C.cyan}ADMIN_PASSWORD_HASH_B64=${b64}${C.reset}`)
  console.log(`${bar}`)

  console.log(`\n${C.dim}Alternatif — düz hash kullanmak istersen HER $ işaretini`)
  console.log(`ters slash ile kaçırmak ZORUNDA:${C.reset}\n`)
  console.log(`${C.dim}ADMIN_PASSWORD_HASH=${escaped}${C.reset}`)

  console.log(`\n${C.yellow}Sonraki adımlar:${C.reset}`)
  console.log(`  1. Yukarıdaki ${C.bold}ADMIN_PASSWORD_HASH_B64${C.reset} satırını .env'e ekle`)
  console.log(`  2. Varsa ${C.bold}eski ADMIN_PASSWORD_HASH satırlarını SİL${C.reset}`)
  console.log(`     ${C.dim}(aynı anahtar iki kez yazılırsa sonuncusu kazanır — karışıklık olur)${C.reset}`)
  console.log(`  3. ${C.cyan}npm run check-env${C.reset} ile doğrula`)
  console.log(`  4. Dev sunucusunu ${C.bold}tamamen durdur ve yeniden başlat${C.reset} (Ctrl+C -> npm run dev)\n`)
}

const arg = process.argv[2]
if (arg) {
  run(arg)
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  rl.question("Panel şifresi: ", (answer) => {
    rl.close()
    if (!answer || !answer.trim()) {
      console.error("Şifre boş olamaz.")
      process.exit(1)
    }
    run(answer.trim())
  })
}
