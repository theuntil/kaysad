// src/lib/supabase-admin.ts
//
// ═══════════════════════════════════════════════════════════════════════
// SUPABASE ADMIN İSTEMCİSİ — SADECE SUNUCU TARAFI
//
// ★★★ BU DOSYA ASLA CLIENT COMPONENT'TEN IMPORT EDİLMEMELİ ★★★
//
// `service_role` key RLS'i TAMAMEN bypass eder — veritabanındaki her şeyi
// okuyabilir/değiştirebilir/silebilir. Bu yüzden:
//   • Sadece server action'lar ve server component'ler bu dosyayı kullanır
//   • Aşağıdaki "server-only" kontrolü, yanlışlıkla client'a sızmasını
//     derleme/çalışma zamanında yakalar
//   • Env değişkeninde NEXT_PUBLIC_ ön eki YOK → Next.js onu tarayıcıya
//     hiç göndermez
// ═══════════════════════════════════════════════════════════════════════

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// ★ Bu modül tarayıcıda çalışırsa ANINDA patlasın — sessiz sızıntı olmasın.
if (typeof window !== "undefined") {
  throw new Error(
    "[supabase-admin] Bu modül SADECE sunucu tarafında kullanılabilir. " +
    "Bir client component'ten import etmiş olabilirsin — server action kullan."
  )
}

let cached: SupabaseClient | null = null

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached

  const url = process.env.SUPABASE_URL?.trim()
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!url) {
    throw new Error("[supabase-admin] SUPABASE_URL tanımlı değil. .env dosyanı kontrol et.")
  }
  if (!key) {
    throw new Error("[supabase-admin] SUPABASE_SERVICE_ROLE_KEY tanımlı değil. .env dosyanı kontrol et.")
  }
  if (key.includes("eyJhbGciOi...") || key.length < 40) {
    throw new Error("[supabase-admin] SUPABASE_SERVICE_ROLE_KEY geçersiz görünüyor (örnek değer mi kaldı?).")
  }

  cached = createClient(url, key, {
    auth: {
      // Panel kendi oturumunu yönetiyor; Supabase Auth oturumu tutmasın.
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-application-name": "kays-admin-panel" },
    },
  })

  return cached
}

/* ─────────────────────────────────────────────────────────────
   BAĞLANTI TESTİ — sağlık kontrolü / dashboard için
───────────────────────────────────────────────────────────── */

export async function testConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.from("popups").select("id", { count: "exact", head: true }).limit(1)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "bilinmeyen hata" }
  }
}
