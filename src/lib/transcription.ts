import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'

// Lazy singleton: construir no import-time faz `next build` estourar
// "Collecting page data" quando OPENAI_API_KEY não está setada no ambiente
// de build (ex.: build de Docker sem secrets injetados) — o SDK valida a
// apiKey no construtor, então só instanciamos no primeiro uso real.
let _openai: OpenAI | null = null
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 2, timeout: 10 * 60 * 1000 })
  return _openai
}

const RETRY_ATTEMPTS = 4
const RETRY_BASE_DELAY_MS = 4000

// A 429 with this code means the account's billing/quota is exhausted —
// fundamentally different from ordinary rate-limiting. Retrying (even with
// backoff) can never succeed until the user adds credit, so treating it the
// same as a transient 429 just burns minutes per chunk for nothing.
function isQuotaExhausted(err: any): boolean {
  return err?.code === 'insufficient_quota' || err?.error?.type === 'insufficient_quota'
}

function isRetryableConnectionError(err: any): boolean {
  if (isQuotaExhausted(err)) return false

  if (
    err?.name === 'APIConnectionError' ||
    err?.name === 'APIConnectionTimeoutError' ||
    /connection error/i.test(err?.message || '') ||
    ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'].includes(err?.cause?.code)
  ) {
    return true
  }
  // Transient upstream/proxy hiccups surface as ordinary HTTP errors (404, 408,
  // 409, 429, 5xx) rather than a connection-level failure — retry those too.
  if (typeof err?.status === 'number') {
    return err.status === 404 || err.status === 408 || err.status === 409 || err.status === 429 || err.status >= 500
  }
  return false
}

/** Retries transient network failures (e.g. ECONNRESET mid-upload) without
 * losing the whole video-processing job to a single flaky request. */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      if (isQuotaExhausted(err)) {
        throw new Error(
          'Cota da OpenAI esgotada — verifique seu plano e faturamento em platform.openai.com/account/billing antes de tentar novamente.'
        )
      }
      if (!isRetryableConnectionError(err) || attempt === RETRY_ATTEMPTS) throw err
      const delay = RETRY_BASE_DELAY_MS * attempt
      console.warn(`[Transcrição] ${label} falhou (tentativa ${attempt}/${RETRY_ATTEMPTS}): ${err.message}. Tentando de novo em ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastErr
}

export interface TranscriptWord {
  word: string
  start: number
  end: number
}

export interface TranscriptSegment {
  id: number
  start: number
  end: number
  text: string
  words?: TranscriptWord[]
}

export interface TranscriptionResult {
  text: string
  language: string
  duration: number
  segments: TranscriptSegment[]
}

const MAX_WHISPER_SIZE_MB = 25
const MAX_WHISPER_SIZE_BYTES = MAX_WHISPER_SIZE_MB * 1024 * 1024

export async function transcribeAudio(audioPath: string, timeoutMs?: number): Promise<TranscriptionResult> {
  const stats = fs.statSync(audioPath)
  if (stats.size > MAX_WHISPER_SIZE_BYTES) {
    throw new Error(`Arquivo de áudio excede ${MAX_WHISPER_SIZE_MB}MB. Use chunked transcription.`)
  }

  const response = await withRetry(
    () =>
      getOpenAI().audio.transcriptions.create(
        {
          file: fs.createReadStream(audioPath),
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        },
        timeoutMs ? { timeout: timeoutMs } : undefined
      ),
    `Whisper (${path.basename(audioPath)})`
  )

  const data = response as any
  return {
    text: data.text,
    language: data.language || 'pt',
    duration: data.duration || 0,
    segments: (data.segments || []).map((s: any, i: number) => ({
      id: i,
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })),
  }
}

// Each chunk is already capped at CHUNK_MINUTES of audio (small, bounded
// upload) — a shorter per-attempt timeout than the global 10min default
// means one chunk with a bad connection fails fast (helped along by the
// worker's own catch-and-skip) instead of stalling a long-live job for up
// to ~40min (4 retries × 10min) before the rest of the chunks even get a turn.
const CHUNK_TRANSCRIBE_TIMEOUT_MS = 3 * 60 * 1000

export async function transcribeAudioChunked(
  audioPath: string,
  chunkOffsetSeconds: number = 0
): Promise<TranscriptionResult> {
  const result = await transcribeAudio(audioPath, CHUNK_TRANSCRIBE_TIMEOUT_MS)
  return {
    ...result,
    segments: result.segments.map((s) => ({
      ...s,
      start: s.start + chunkOffsetSeconds,
      end: s.end + chunkOffsetSeconds,
    })),
  }
}

// Usado só pelo editor (legendas automáticas estilo CapCut). Diferente de
// transcribeAudio (que pede granularidade por segmento para o pipeline de
// análise de IA), aqui pedimos também 'word' para ter o timestamp de cada
// palavra — é isso que permite o efeito "karaokê" (destaque palavra a
// palavra) na renderização. Chamado sobre um snippet de áudio já recortado
// para a duração do clipe (poucos segundos/minutos), nunca sobre a live
// inteira, então não precisa do chunking usado em transcribeAudioChunked.
export interface TranscriptionWithWordsResult extends TranscriptionResult {
  words: TranscriptWord[]
}

export async function transcribeAudioWithWords(audioPath: string, timeoutMs?: number): Promise<TranscriptionWithWordsResult> {
  const stats = fs.statSync(audioPath)
  if (stats.size > MAX_WHISPER_SIZE_BYTES) {
    throw new Error(`Arquivo de áudio excede ${MAX_WHISPER_SIZE_MB}MB.`)
  }

  const response = await withRetry(
    () =>
      getOpenAI().audio.transcriptions.create(
        {
          file: fs.createReadStream(audioPath),
          model: 'whisper-1',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment', 'word'],
        },
        timeoutMs ? { timeout: timeoutMs } : undefined
      ),
    `Whisper com timestamps por palavra (${path.basename(audioPath)})`
  )

  const data = response as any
  return {
    text: data.text,
    language: data.language || 'pt',
    duration: data.duration || 0,
    segments: (data.segments || []).map((s: any, i: number) => ({
      id: i,
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    })),
    words: (data.words || []).map((w: any) => ({ word: w.word, start: w.start, end: w.end })),
  }
}

export function formatTranscriptForAI(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => `[${formatTime(s.start)} - ${formatTime(s.end)}] ${s.text}`)
    .join('\n')
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}
