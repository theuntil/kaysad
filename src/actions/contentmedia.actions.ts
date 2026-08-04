// src/actions/contentmedia.actions.ts
"use server"

// ═══════════════════════════════════════════════════════════════════════
// İÇERİK MEDYASI YÖNETİMİ
//
// ★ Yeni dosya ESKİSİNİN YERİNE, aynı klasöre yazılıyor. Eski dosya
//   Storage'dan siliniyor ve kolon yeni URL ile güncelleniyor.
//   Dosya adı benzersiz (<ad>-<tarih>-<6 karakter>) — CDN önbelleği
//   eski görseli göstermiyor.
//
// ★ Dizi kolonlarda (images[], media[]) tek tek eleman değiştirilebiliyor
//   ve yeni eleman eklenebiliyor.
// ═══════════════════════════════════════════════════════════════════════

import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-admin"
import { assertSession } from "@/lib/session"
import { logAudit } from "@/lib/audit"
import type { ContentKind } from "@/lib/types.v3"

export interface MediaColumn {
  kolon: string
  tip: string
  dizi: boolean
}




export async function fetchMediaColumns(
  kind: ContentKind
): Promise<{ columns: MediaColumn[]; error?: string }> {
  try {
    await assertSession()
    const sb = getSupabaseAdmin()
    const { data, error } = await sb.rpc("admin_content_media_columns", { p_kind: kind })
    if (error) return { columns: [], error: error.message }
    return { columns: (data ?? []) as MediaColumn[] }
  } catch (e) {
    return { columns: [], error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

/**
 * Yüklenmiş bir medyayı içeriğe bağlar.
 *
 * ★ Dosya buraya GELMİYOR — tarayıcı imzalı URL ile doğrudan Storage'a
 *   yükledi, biz sadece adresi kolona yazıyoruz. Eski dosya SQL tarafında
 *   temizlik kuyruğuna ekleniyor.
 */
export async function attachContentMediaAction(params: {
  kind: ContentKind
  id: string
  column: string
  index?: number | null
  url: string
  mode: "replace" | "add"
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  if (!params.url) return { ok: false, error: "Adres boş." }

  try {
    const sb = getSupabaseAdmin()

    if (params.mode === "add") {
      const { error } = await sb.rpc("admin_add_content_media", {
        p_kind: params.kind, p_id: params.id,
        p_column: params.column, p_url: params.url,
      })
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await sb.rpc("admin_set_content_media", {
        p_kind: params.kind, p_id: params.id,
        p_column: params.column, p_index: params.index ?? null, p_url: params.url,
      })
      if (error) return { ok: false, error: error.message }
    }

    await logAudit({
      actor: session.sub, action: "media_replace",
      targetType: params.kind, targetId: params.id,
      detail: { kolon: params.column, index: params.index ?? null, mod: params.mode },
    })

    revalidatePath("/icerikler")
    return {
      ok: true,
      message: params.mode === "add" ? "Medya eklendi." : "Medya değiştirildi.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}

export async function removeContentMediaAction(params: {
  kind: ContentKind
  id: string
  column: string
  index?: number | null
}): Promise<{ ok: boolean; error?: string; message?: string }> {
  let session
  try { session = await assertSession() } catch { return { ok: false, error: "Oturum sona ermiş." } }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc("admin_set_content_media", {
      p_kind: params.kind, p_id: params.id,
      p_column: params.column, p_index: params.index ?? null, p_url: null,
    })
    if (error) return { ok: false, error: error.message }

    await logAudit({
      actor: session.sub, action: "media_replace",
      targetType: params.kind, targetId: params.id,
      detail: { kolon: params.column, silindi: true },
    })

    revalidatePath("/icerikler")
    return { ok: true, message: "Medya kaldırıldı." }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Beklenmeyen hata." }
  }
}
