import Anthropic from '@anthropic-ai/sdk'
import type { AISuggestedClip, ClipEmotion } from '@/types'
import { formatTranscriptForAI } from './transcription'
import { runWithConcurrency } from './utils'

// Lazy singleton: construir no import-time faz `next build` estourar
// "Collecting page data" quando ANTHROPIC_API_KEY não está setada no
// ambiente de build (ex.: build de Docker sem secrets injetados) — o SDK
// valida a apiKey no construtor, então só instanciamos no primeiro uso real.
let _anthropic: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 })
  return _anthropic
}

const RETRY_ATTEMPTS = 4
const RETRY_BASE_DELAY_MS = 4000

function isRetryableConnectionError(err: any): boolean {
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

/** Retries transient network failures without failing the whole processing job. */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      lastErr = err
      if (!isRetryableConnectionError(err) || attempt === RETRY_ATTEMPTS) throw err
      const delay = RETRY_BASE_DELAY_MS * attempt
      console.warn(`[Análise IA] ${label} falhou (tentativa ${attempt}/${RETRY_ATTEMPTS}): ${err.message}. Tentando de novo em ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  throw lastErr
}

const VALID_EMOTIONS: ClipEmotion[] = [
  'POLEMICA', 'HUMOR', 'SURPRESA', 'ENSINO', 'HISTORIA',
  'OPINIAO_FORTE', 'REVELACAO', 'CONFLITO', 'FRASE_DE_IMPACTO',
]

const SYSTEM_PROMPT = `Você é um especialista em vídeos virais para TikTok, Reels e YouTube Shorts.
Analise transcrições com timestamps e encontre os melhores trechos para cortes de 30 a 90 segundos.

CRITÉRIOS OBRIGATÓRIOS para cada corte:
- Início com hook forte (primeiros 3 segundos precisam prender atenção)
- Contexto suficiente para o espectador entender sem ter visto o vídeo completo
- Frase de impacto ou momento memorável
- Final que não pareça cortado no meio de uma frase
- Duração entre 30 e 90 segundos
- O trecho precisa funcionar fora do contexto do vídeo original

PRIORIZE trechos com:
- Polêmica, controvérsia, opinião forte
- Humor, risada, situação engraçada
- Surpresa, revelação inesperada
- Ensinamento prático e direto
- História com começo, tensão e conclusão
- Frase compartilhável e memorável
- Conflito ou debate intenso
- Mudança emocional clara na fala

RESPONDA APENAS com um array JSON válido, sem texto antes ou depois. Exemplo:
[
  {
    "title": "Título curto e chamativo em português",
    "startTime": "00:02:15",
    "endTime": "00:03:42",
    "viralScore": 87,
    "hook": "Frase inicial do trecho que prende atenção",
    "reason": "Explicação de por que esse trecho tem alto potencial viral",
    "emotion": "SURPRESA",
    "caption": "Legenda curta para o vídeo (máx 100 caracteres)",
    "description": "Descrição completa para postar nas redes sociais",
    "hashtags": ["#viral", "#podcast", "#cortes"]
  }
]

Campos de emotion válidos: POLEMICA, HUMOR, SURPRESA, ENSINO, HISTORIA, OPINIAO_FORTE, REVELACAO, CONFLITO, FRASE_DE_IMPACTO`

export async function analyzeTranscriptForClips(
  transcript: string,
  videoDuration: number,
  maxClips: number = 10
): Promise<AISuggestedClip[]> {
  const durationMinutes = Math.round(videoDuration / 60)

  const userMessage = `Analise a transcrição abaixo de um vídeo de ${durationMinutes} minutos e encontre os ${maxClips} melhores trechos para cortes virais.

TRANSCRIÇÃO COM TIMESTAMPS:
${transcript}

Encontre exatamente ${maxClips} cortes (ou menos se o vídeo for curto). Priorize qualidade sobre quantidade.`

  const response = await withRetry(
    () =>
      getAnthropic().messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
        messages: [{ role: 'user', content: userMessage }],
        system: SYSTEM_PROMPT,
      }),
    'Claude (análise de cortes)'
  )

  const content = response.content[0]
  if (content.type !== 'text') throw new Error('Resposta inválida da IA')

  const rawClips = parseClipsJSON(content.text, response.stop_reason)

  return rawClips
    .filter((c) => {
      const startSec = timeToSeconds(c.startTime)
      const endSec = timeToSeconds(c.endTime)
      const dur = endSec - startSec
      return dur >= 20 && dur <= 120 && VALID_EMOTIONS.includes(c.emotion)
    })
    .map((c) => ({
      ...c,
      viralScore: Math.max(0, Math.min(100, c.viralScore)),
      hashtags: (c.hashtags || []).slice(0, 10),
    }))
    .sort((a, b) => b.viralScore - a.viralScore)
}

function extractJSON(text: string): string {
  // Claude sometimes wraps the array in a ```json ... ``` fence despite being told not to.
  const withoutFences = text.replace(/```(?:json)?/gi, '')
  const match = withoutFences.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('IA não retornou JSON válido')
  return match[0]
}

/**
 * Finds every offset right after a top-level (`}`) object close inside the
 * array, so a truncated response can be repaired by cutting at the last
 * fully-formed object instead of failing the whole batch.
 */
function findTopLevelObjectBoundaries(arrayText: string): number[] {
  const boundaries: number[] = []
  let depth = 0
  let inString = false
  let escaped = false

  for (let i = 0; i < arrayText.length; i++) {
    const ch = arrayText[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') { inString = true; continue }
    if (ch === '[' || ch === '{') depth++
    else if (ch === ']' || ch === '}') {
      depth--
      if (ch === '}' && depth === 1) boundaries.push(i + 1) // right after this object, still inside the array
    }
  }
  return boundaries
}

/**
 * Parses the clip array from Claude's response. If the response was cut off
 * mid-generation (stop_reason "max_tokens"), salvages every fully-formed
 * clip object instead of discarding the whole batch over one truncated tail.
 */
function parseClipsJSON(text: string, stopReason: string | null): AISuggestedClip[] {
  const jsonText = extractJSON(text)
  try {
    return JSON.parse(jsonText) as AISuggestedClip[]
  } catch (err: any) {
    if (stopReason !== 'max_tokens') throw err

    const boundaries = findTopLevelObjectBoundaries(jsonText)
    for (let i = boundaries.length - 1; i >= 0; i--) {
      const truncated = jsonText.slice(0, boundaries[i]) + ']'
      try {
        return JSON.parse(truncated) as AISuggestedClip[]
      } catch {
        continue
      }
    }
    throw new Error(
      'A resposta da IA foi cortada antes de gerar nenhum corte completo. Tente novamente ou reduza a quantidade de cortes solicitados.'
    )
  }
}

export function timeToSeconds(time: string): number {
  const parts = time.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return parts[0]
}

export interface ChunkForAnalysis {
  chunkIndex: number
  durationSeconds: number
  segments: Array<{ startTime: number; endTime: number; text: string }>
}

// A single Claude call over a full 8-24h transcript risks exceeding context
// and, more importantly, tends to under-sample later parts of a very long
// video. Analyzing chunk-by-chunk (mirroring how it was already transcribed
// chunk-by-chunk) and merging afterward finds candidates evenly across the
// whole live instead of concentrating on whichever section fit in one call.
const PER_CHUNK_MAX_CLIPS = 5

/**
 * Long-live variant of analyzeTranscriptForClips: analyzes each transcript
 * chunk independently (small, bounded calls), then merges, de-duplicates
 * overlapping candidates, and keeps the top `maxClips` by viralScore.
 * A single chunk failing (e.g. a transient API error after retries) is
 * logged and skipped — it never fails the whole batch. `concurrency` > 1
 * runs multiple chunk analyses in parallel (bounded, same idea as chunked
 * transcription) since Claude calls here don't share the strict per-account
 * budget concerns Whisper does.
 */
export async function analyzeLongLiveTranscript(
  chunks: ChunkForAnalysis[],
  maxClips: number,
  onChunkAnalyzed?: (done: number, total: number) => void,
  concurrency: number = 1
): Promise<AISuggestedClip[]> {
  let doneCount = 0

  const results = await runWithConcurrency(chunks, concurrency, async (chunk) => {
    let clips: AISuggestedClip[] = []
    if (chunk.segments.length > 0) {
      const transcript = formatTranscriptForAI(
        chunk.segments.map((s, idx) => ({ id: idx, start: s.startTime, end: s.endTime, text: s.text }))
      )
      try {
        clips = await analyzeTranscriptForClips(transcript, chunk.durationSeconds, PER_CHUNK_MAX_CLIPS)
      } catch (err: any) {
        console.warn(`[Análise IA] Falha ao analisar parte ${chunk.chunkIndex + 1}/${chunks.length} — pulando essa parte:`, err.message)
      }
    }
    doneCount++
    onChunkAnalyzed?.(doneCount, chunks.length)
    return clips
  })

  return dedupeAndRankClips(results.flat(), maxClips)
}

/**
 * Sorts candidates by viralScore and greedily keeps the highest-scoring
 * ones, discarding any later candidate whose time range overlaps more than
 * 50% with one already accepted (near a chunk boundary, both neighboring
 * chunks can independently surface "the same" moment).
 */
function dedupeAndRankClips(clips: AISuggestedClip[], maxClips: number): AISuggestedClip[] {
  const sorted = [...clips].sort((a, b) => b.viralScore - a.viralScore)
  const accepted: AISuggestedClip[] = []

  for (const clip of sorted) {
    if (accepted.length >= maxClips) break
    const start = timeToSeconds(clip.startTime)
    const end = timeToSeconds(clip.endTime)

    const overlapsExisting = accepted.some((a) => {
      const aStart = timeToSeconds(a.startTime)
      const aEnd = timeToSeconds(a.endTime)
      const overlap = Math.max(0, Math.min(end, aEnd) - Math.max(start, aStart))
      const shorterDuration = Math.min(end - start, aEnd - aStart)
      return shorterDuration > 0 && overlap / shorterDuration > 0.5
    })

    if (!overlapsExisting) accepted.push(clip)
  }

  return accepted
}
