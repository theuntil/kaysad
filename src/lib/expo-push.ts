// src/lib/expo-push.ts
//
// ┌─ BU DOSYA NE YAPIYOR ─────────────────────────────────────────────┐
// │                                                                    │
// │ Expo Push API'sine bildirim gönderir. Sadece HTTP işini yapar —    │
// │ hangi bildirimin gideceğine karar vermez (o iş push.actions.ts'de).│
// │                                                                    │
// │ Hallettiği zorluklar:                                              │
// │  • Expo tek istekte EN FAZLA 100 mesaj kabul eder → gruplara böler │
// │  • Yanıt sırası istek sırasıyla aynıdır → eşleştirmeyi korur       │
// │  • Hata kodlarını sınıflandırır (token silinmeli mi, tekrar        │
// │    denenmeli mi, kalıcı hata mı)                                   │
// │  • Ağ hatasında tüm grubu "error" olarak işaretler, çökmez         │
// │                                                                    │
// └────────────────────────────────────────────────────────────────────┘
//
// ┌─ ÖNEMLİ PARAMETRELER ─────────────────────────────────────────────┐
// │ EXPO_ACCESS_TOKEN (.env)  Opsiyonel ama ÖNERİLİR. Yoksa da        │
// │   çalışır; ama token'ı olan herkes senin kullanıcılarına bildirim  │
// │   gönderebilir. expo.dev → Account Settings → Access Tokens        │
// └────────────────────────────────────────────────────────────────────┘
//
// ┌─ DİKKAT ──────────────────────────────────────────────────────────┐
// │ • Bu modül SADECE sunucu tarafında kullanılmalı (token içeriyor).  │
// │ • `data` alanı 4KB'ı geçmemeli, yoksa MessageTooBig hatası gelir.  │
// │ • Aynı token'a saniyede çok istek → MessageRateExceeded. Gruplar   │
// │   arasında küçük bir bekleme var (BATCH_DELAY_MS).                 │
// └────────────────────────────────────────────────────────────────────┘

const EXPO_ENDPOINT = "https://exp.host/--/api/v2/push/send"

/** Expo tek istekte en fazla 100 mesaj kabul ediyor */
const MAX_PER_BATCH = 100

/** Gruplar arası bekleme — MessageRateExceeded'ı önler */
const BATCH_DELAY_MS = 120

/** Tek istek zaman aşımı */
const TIMEOUT_MS = 15_000

if (typeof window !== "undefined") {
  throw new Error("[expo-push] Bu modül sadece sunucu tarafında kullanılabilir.")
}

/* ═══════════════════════════════════════════════════════════════
   TİPLER
═══════════════════════════════════════════════════════════════ */

export interface ExpoMessage {
  /** ExponentPushToken[...] */
  to: string
  title: string
  body: string
  /** Uygulamada bildirime basılınca kullanılacak veri (route vb.) */
  data?: Record<string, unknown>
  /** "default" | null (sessiz) */
  sound?: "default" | null
  /** iOS uygulama ikonundaki sayı */
  badge?: number
  /** Android bildirim kanalı */
  channelId?: string
  /** "default" | "normal" | "high" */
  priority?: "default" | "normal" | "high"
  /** Bildirimin geçerlilik süresi (saniye) */
  ttl?: number
}

/** Expo hatalarının anlamı — ne yapılacağını belirler */
export type ExpoErrorKind =
  /** Token geçersiz → SİL */
  | "remove_token"
  /** Geçici hata → sonra tekrar dene */
  | "retry"
  /** Kalıcı hata → tekrar denemenin anlamı yok */
  | "permanent"
  /** Bilinmeyen */
  | "unknown"

export interface ExpoResult {
  /** İsteğin sırası — çağıran taraf eşleştirmek için kullanır */
  index: number
  ok: boolean
  /** Expo'nun bildirim id'si (başarılıysa) */
  ticketId?: string
  errorCode?: string
  errorMessage?: string
  kind?: ExpoErrorKind
}

/* ═══════════════════════════════════════════════════════════════
   HATA SINIFLANDIRMA
   Hangi hatada ne yapılacağı tek yerde toplandı.
═══════════════════════════════════════════════════════════════ */

export function classifyExpoError(code?: string | null): ExpoErrorKind {
  switch (code) {
    // Cihaz artık kayıtlı değil: uygulama silinmiş veya bildirimler
    // kapatılmış. Token'ı silmeliyiz, yoksa her seferinde aynı hata.
    case "DeviceNotRegistered":
      return "remove_token"

    // Expo kimlik bilgileri hatalı (access token / proje eşleşmiyor).
    // Token'ı silmek YANLIŞ olur — sorun bizde, cihazda değil.
    case "InvalidCredentials":
      return "permanent"

    // Mesaj çok büyük — data alanını küçültmek lazım
    case "MessageTooBig":
      return "permanent"

    // Çok hızlı gönderim — bekleyip tekrar dene
    case "MessageRateExceeded":
      return "retry"

    // Expo tarafında geçici sorun
    case "ProviderError":
    case "InternalServerError":
      return "retry"

    default:
      return code ? "unknown" : "unknown"
  }
}

/** Token biçimi Expo'ya uygun mu — boşuna istek atmayalım */
export function isValidExpoToken(token: string | null | undefined): boolean {
  if (!token) return false
  const t = token.trim()
  return (
    (t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken[")) &&
    t.endsWith("]") &&
    t.length >= 20
  )
}

/* ═══════════════════════════════════════════════════════════════
   YARDIMCI
═══════════════════════════════════════════════════════════════ */

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    accept: "application/json",
    "accept-encoding": "gzip, deflate",
  }
  const token = process.env.EXPO_ACCESS_TOKEN?.trim()
  if (token && token.length > 10 && !token.includes("REPLACE")) {
    h.Authorization = `Bearer ${token}`
  }
  return h
}

/* ═══════════════════════════════════════════════════════════════
   ★ ANA FONKSİYON
   Mesajları gruplara bölüp gönderir, sonuçları SIRAYLA döndürür.
   Dönen dizinin index'i, gönderilen dizinin index'iyle aynıdır.
═══════════════════════════════════════════════════════════════ */

export async function sendExpoPush(messages: ExpoMessage[]): Promise<ExpoResult[]> {
  if (messages.length === 0) return []

  const results: ExpoResult[] = []
  const batches = chunk(messages, MAX_PER_BATCH)

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b]
    const offset = b * MAX_PER_BATCH

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

      const res = await fetch(EXPO_ENDPOINT, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(batch),
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!res.ok) {
        // HTTP seviyesinde hata — tüm grup başarısız
        const text = await res.text().catch(() => "")
        const kind: ExpoErrorKind = res.status >= 500 || res.status === 429 ? "retry" : "permanent"
        batch.forEach((_, i) => {
          results.push({
            index: offset + i,
            ok: false,
            errorCode: `HTTP_${res.status}`,
            errorMessage: text.slice(0, 300) || res.statusText,
            kind,
          })
        })
        continue
      }

      const json = (await res.json()) as {
        data?: Array<{
          status: "ok" | "error"
          id?: string
          message?: string
          details?: { error?: string }
        }>
        errors?: Array<{ code?: string; message?: string }>
      }

      // Üst seviye hata (ör. geçersiz access token)
      if (json.errors && json.errors.length > 0) {
        const e = json.errors[0]
        batch.forEach((_, i) => {
          results.push({
            index: offset + i,
            ok: false,
            errorCode: e.code ?? "ExpoError",
            errorMessage: e.message ?? "Expo hata döndürdü",
            kind: classifyExpoError(e.code),
          })
        })
        continue
      }

      const tickets = json.data ?? []

      batch.forEach((_, i) => {
        const t = tickets[i]
        if (!t) {
          results.push({
            index: offset + i,
            ok: false,
            errorCode: "NoTicket",
            errorMessage: "Expo bu mesaj için sonuç döndürmedi",
            kind: "retry",
          })
          return
        }
        if (t.status === "ok") {
          results.push({ index: offset + i, ok: true, ticketId: t.id })
        } else {
          const code = t.details?.error
          results.push({
            index: offset + i,
            ok: false,
            errorCode: code ?? "Unknown",
            errorMessage: t.message ?? "Bilinmeyen hata",
            kind: classifyExpoError(code),
          })
        }
      })
    } catch (err) {
      // Ağ hatası / zaman aşımı — grubu retry olarak işaretle
      const msg = err instanceof Error ? err.message : "ağ hatası"
      batch.forEach((_, i) => {
        results.push({
          index: offset + i,
          ok: false,
          errorCode: "NetworkError",
          errorMessage: msg,
          kind: "retry",
        })
      })
    }

    // Son grup değilse kısa bekle
    if (b < batches.length - 1) await sleep(BATCH_DELAY_MS)
  }

  return results
}

/** Access token yapılandırılmış mı — panelde uyarı göstermek için */
export function hasExpoAccessToken(): boolean {
  const t = process.env.EXPO_ACCESS_TOKEN?.trim()
  return !!t && t.length > 10 && !t.includes("REPLACE")
}
