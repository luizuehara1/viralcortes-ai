import { Worker, Job } from 'bullmq'
import path from 'path'
import fs from 'fs'
import { redisConnection } from '@/lib/queue'
import { prisma } from '@/lib/prisma'
import { extractAudioMp3, generateThumbnail, getVideoMetadata, splitVideoIntoChunks } from '@/lib/ffmpeg'
import { transcribeAudio, transcribeAudioChunked, formatTranscriptForAI } from '@/lib/transcription'
import { analyzeTranscriptForClips, analyzeLongLiveTranscript, timeToSeconds } from '@/lib/ai-analyzer'
import { getUploadDir, runWithConcurrency } from '@/lib/utils'
import type { ClipEmotion } from '@/types'

const CHUNK_DURATION = Math.max(1, Number(process.env.CHUNK_MINUTES) || 10) * 60
const LONG_LIVE_MODE_HOURS = Number(process.env.LONG_LIVE_MODE_HOURS) || 8
const MAX_SUGGESTED_CLIPS = Number(process.env.MAX_SUGGESTED_CLIPS) || 50
const DEFAULT_MAX_CLIPS = 12
const TRANSCRIPTION_CONCURRENCY = Math.max(1, Number(process.env.TRANSCRIPTION_CONCURRENCY) || 1)
const ANALYSIS_CONCURRENCY = Math.max(1, Number(process.env.ANALYSIS_CONCURRENCY) || 1)

async function updateVideoStatus(id: string, status: string, errorMessage?: string) {
  await prisma.sourceVideo.update({
    where: { id },
    data: { status: status as any, ...(errorMessage ? { errorMessage } : {}) },
  })
}

async function upsertProcessingJob(
  jobId: string | null,
  sourceVideoId: string,
  type: 'TRANSCRIBE' | 'ANALYZE_CLIPS',
  data: { status?: 'PROCESSING' | 'COMPLETED' | 'FAILED'; progress?: number; metadata?: Record<string, unknown>; errorMessage?: string }
): Promise<string> {
  if (jobId) {
    await prisma.processingJob.update({ where: { id: jobId }, data: data as any }).catch(() => {})
    return jobId
  }
  const created = await prisma.processingJob.create({
    data: { sourceVideoId, type, status: (data.status as any) || 'PROCESSING', progress: data.progress ?? 0, metadata: data.metadata as any },
  })
  return created.id
}

async function processVideo(job: Job) {
  const { sourceVideoId } = job.data as { sourceVideoId: string }

  console.log(`[Worker] Job ${job.id} iniciado para vídeo ${sourceVideoId} (tentativa ${job.attemptsMade + 1})`)

  const video = await prisma.sourceVideo.findUnique({ where: { id: sourceVideoId } })
  if (!video || !video.filePath) throw new Error('Vídeo não encontrado ou sem arquivo no banco')

  // Verifica se o arquivo de fato existe e está acessível no disco antes de
  // gastar tempo com ffprobe/ffmpeg — evita erros crípticos mais adiante.
  if (!fs.existsSync(video.filePath)) {
    throw new Error(`Arquivo de vídeo não encontrado no disco: ${video.filePath}`)
  }
  try {
    fs.accessSync(video.filePath, fs.constants.R_OK)
  } catch {
    throw new Error(`Arquivo de vídeo sem permissão de leitura: ${video.filePath}`)
  }

  const uploadDir = getUploadDir()
  const videoDir = path.join(uploadDir, sourceVideoId)
  // Garante que a pasta de trabalho existe e é gravável (lança erro claro se não for).
  fs.mkdirSync(videoDir, { recursive: true })

  console.log(`[Worker] [1/5] Extraindo metadados de ${video.filePath}`)

  // 1. Extrair metadados
  const metadata = await getVideoMetadata(video.filePath)
  const isLongLive = metadata.duration >= LONG_LIVE_MODE_HOURS * 3600
  await prisma.sourceVideo.update({
    where: { id: sourceVideoId },
    // Limpa um errorMessage de uma tentativa anterior que falhou — esta
    // tentativa está rodando de verdade agora, um erro velho na tela seria
    // enganoso enquanto ela progride.
    data: { duration: metadata.duration, isLongLive, status: 'EXTRACTING_AUDIO', errorMessage: null },
  })
  await job.updateProgress(10)
  console.log(
    `[Worker] [1/5] Metadados ok — duração ${metadata.duration}s, ${metadata.width}x${metadata.height}` +
      (isLongLive ? ' — Modo Live Longa ativado' : '')
  )

  // 1.5 Gerar thumbnail leve para as listagens (best-effort — nunca derruba o job)
  try {
    const thumbnailPath = path.join(videoDir, 'thumbnail.jpg')
    await generateThumbnail(video.filePath, thumbnailPath, Math.min(2, metadata.duration / 2))
    await prisma.sourceVideo.update({
      where: { id: sourceVideoId },
      data: { thumbnailUrl: `/api/videos/${sourceVideoId}/thumbnail` },
    })
  } catch (err) {
    console.warn(`[Worker] Falha ao gerar thumbnail de ${sourceVideoId}:`, err)
  }

  // 2. Extrair áudio
  console.log(`[Worker] [2/5] Extraindo áudio de ${video.filePath}`)
  const audioPath = path.join(videoDir, 'audio.mp3')
  await extractAudioMp3(video.filePath, audioPath)
  console.log(`[Worker] [2/5] Áudio extraído: ${audioPath}`)
  await prisma.sourceVideo.update({
    where: { id: sourceVideoId },
    data: { audioPath, status: 'TRANSCRIBING' },
  })
  await job.updateProgress(30)

  // 3. Transcrever — suporte a arquivos grandes/lives longas via chunks
  console.log(`[Worker] [3/5] Transcrevendo áudio`)
  const audioSizeMB = fs.statSync(audioPath).size / (1024 * 1024)
  const needsChunking = audioSizeMB > 24 || isLongLive

  let transcribeJobId: string | null = null
  let chunkCount = 0

  if (needsChunking) {
    const chunksDir = path.join(videoDir, 'audio-chunks')
    fs.mkdirSync(chunksDir, { recursive: true })

    // Retomar de onde parou: pula chunks cujos segmentos já foram salvos
    // numa tentativa anterior (falha parcial não perde o que já foi feito).
    // Calculado ANTES do split para também pular o recorte do vídeo desses
    // chunks — sem isso, cada retomada refazia o corte de todos os ~60
    // pedaços de um arquivo de dezenas de GB, mesmo dos já prontos.
    const existing = await prisma.transcriptSegment.findMany({
      where: { sourceVideoId },
      select: { chunkIndex: true },
      distinct: ['chunkIndex'],
    })
    const doneChunks = new Set(existing.map((s) => s.chunkIndex))
    const alreadyDone = doneChunks.size

    const videoChunks = await splitVideoIntoChunks(video.filePath, chunksDir, CHUNK_DURATION, doneChunks)
    chunkCount = videoChunks.length

    if (alreadyDone > 0) {
      console.log(`[Worker] [3/5] Retomando — ${alreadyDone}/${chunkCount} partes já transcritas anteriormente`)
    }

    transcribeJobId = await upsertProcessingJob(null, sourceVideoId, 'TRANSCRIBE', {
      status: 'PROCESSING',
      progress: Math.round((alreadyDone / chunkCount) * 100),
      metadata: { totalChunks: chunkCount, processedChunks: alreadyDone },
    })

    let processedCount = alreadyDone
    const failedChunkIndexes: number[] = []
    await runWithConcurrency(videoChunks, TRANSCRIPTION_CONCURRENCY, async (chunkVideoPath, i) => {
      if (doneChunks.has(i)) return

      try {
        const chunkAudio = path.join(chunksDir, `chunk_${i}.mp3`)
        await extractAudioMp3(chunkVideoPath, chunkAudio)
        const offset = i * CHUNK_DURATION
        const result = await transcribeAudioChunked(chunkAudio, offset)

        // Persiste este chunk imediatamente — se o job cair no meio, o que já
        // foi transcrito não se perde numa nova tentativa.
        if (result.segments.length > 0) {
          await prisma.transcriptSegment.createMany({
            data: result.segments.map((s) => ({
              sourceVideoId,
              startTime: s.start,
              endTime: s.end,
              text: s.text,
              chunkIndex: i,
            })),
          })
        }
      } catch (err: any) {
        // Cota da OpenAI esgotada é permanente até o usuário resolver o
        // faturamento — nenhum chunk seguinte vai funcionar, então não faz
        // sentido gastar minutos "pulando" um por um. Aborta na hora com a
        // mensagem clara em vez do genérico "mais da metade falhou" no final.
        if (/cota da openai esgotada/i.test(err.message || '')) {
          throw err
        }
        // Uma parte específica pode falhar por instabilidade pontual da API
        // de transcrição (já tentou de novo internamente e mesmo assim não
        // foi) — isso não pode travar as outras dezenas de partes de uma
        // live longa. Continua sem essa parte em vez de derrubar o job inteiro.
        failedChunkIndexes.push(i)
        console.warn(`[Worker] [3/5] Falha ao transcrever parte ${i + 1}/${chunkCount} — pulando essa parte:`, err.message)
      }

      processedCount++
      const progress = Math.round((processedCount / chunkCount) * 100)
      transcribeJobId = await upsertProcessingJob(transcribeJobId, sourceVideoId, 'TRANSCRIBE', {
        progress,
        metadata: { totalChunks: chunkCount, processedChunks: processedCount, currentChunk: i + 1, failedChunks: failedChunkIndexes.length },
      })
      console.log(`[Worker] [3/5] Transcrevendo parte ${processedCount} de ${chunkCount}`)
      await job.updateProgress(30 + Math.round(30 * (processedCount / chunkCount)))
    })

    if (failedChunkIndexes.length > 0) {
      console.warn(
        `[Worker] [3/5] ${failedChunkIndexes.length} de ${chunkCount} partes não puderam ser transcritas (partes: ${failedChunkIndexes.map((i) => i + 1).join(', ')})`
      )
    }
    // Mais da metade falhando indica algo sistêmico (chave de API inválida,
    // cota estourada) em vez de instabilidade pontual — aí sim vale falhar
    // o job com um erro claro em vez de gerar cortes de uma transcrição
    // majoritariamente vazia.
    if (failedChunkIndexes.length > chunkCount / 2) {
      throw new Error(
        `Falha ao transcrever mais da metade das partes (${failedChunkIndexes.length}/${chunkCount}) — provável problema de conectividade com a API de transcrição.`
      )
    }

    if (transcribeJobId) {
      await upsertProcessingJob(transcribeJobId, sourceVideoId, 'TRANSCRIBE', { status: 'COMPLETED', progress: 100 })
    }
  } else {
    const result = await transcribeAudio(audioPath)
    if (result.segments.length > 0) {
      await prisma.transcriptSegment.createMany({
        data: result.segments.map((s) => ({
          sourceVideoId,
          startTime: s.start,
          endTime: s.end,
          text: s.text,
          chunkIndex: 0,
        })),
      })
    }
    await job.updateProgress(60)
  }

  // Fonte única da verdade a partir daqui: busca tudo do banco (cobre tanto
  // os chunks retomados quanto os recém-transcritos).
  const allSegments = await prisma.transcriptSegment.findMany({
    where: { sourceVideoId },
    orderBy: { startTime: 'asc' },
  })

  console.log(`[Worker] [3/5] Transcrição concluída — ${allSegments.length} segmentos`)
  await updateVideoStatus(sourceVideoId, 'ANALYZING')
  await job.updateProgress(65)

  // 4. Analisar com IA
  console.log(`[Worker] [4/5] Analisando transcrição com IA`)
  const maxClips = isLongLive ? MAX_SUGGESTED_CLIPS : DEFAULT_MAX_CLIPS

  let suggestedClips
  if (needsChunking && chunkCount > 1) {
    // Long-live path: analisa cada parte separadamente (evita jogar 8-24h de
    // transcrição num só prompt) e depois junta/deduplica/rankeia.
    const chunkGroups = new Map<number, Array<{ startTime: number; endTime: number; text: string }>>()
    for (const seg of allSegments) {
      const arr = chunkGroups.get(seg.chunkIndex) ?? []
      arr.push({ startTime: seg.startTime, endTime: seg.endTime, text: seg.text })
      chunkGroups.set(seg.chunkIndex, arr)
    }
    const chunksForAnalysis = Array.from({ length: chunkCount }, (_, i) => ({
      chunkIndex: i,
      durationSeconds: CHUNK_DURATION,
      segments: chunkGroups.get(i) ?? [],
    }))

    let analyzeJobId: string | null = await upsertProcessingJob(null, sourceVideoId, 'ANALYZE_CLIPS', {
      status: 'PROCESSING',
      progress: 0,
      metadata: { totalChunks: chunkCount, processedChunks: 0 },
    })

    suggestedClips = await analyzeLongLiveTranscript(
      chunksForAnalysis,
      maxClips,
      async (done, total) => {
        console.log(`[Worker] [4/5] Analisando parte ${done} de ${total}`)
        analyzeJobId = await upsertProcessingJob(analyzeJobId, sourceVideoId, 'ANALYZE_CLIPS', {
          progress: Math.round((done / total) * 100),
          metadata: { totalChunks: total, processedChunks: done },
        })
        await job.updateProgress(65 + Math.round(25 * (done / total)))
      },
      ANALYSIS_CONCURRENCY
    )

    if (analyzeJobId) {
      await upsertProcessingJob(analyzeJobId, sourceVideoId, 'ANALYZE_CLIPS', { status: 'COMPLETED', progress: 100 })
    }
  } else {
    const transcriptText = formatTranscriptForAI(
      allSegments.map((s, i) => ({ id: i, start: s.startTime, end: s.endTime, text: s.text }))
    )
    suggestedClips = await analyzeTranscriptForClips(transcriptText, metadata.duration, maxClips)
  }

  await job.updateProgress(90)
  console.log(`[Worker] [4/5] IA sugeriu ${suggestedClips.length} cortes`)

  // 5. Salvar clips sugeridos
  console.log(`[Worker] [5/5] Salvando cortes sugeridos no banco`)
  await prisma.suggestedClip.createMany({
    data: suggestedClips.map((c) => ({
      sourceVideoId,
      title: c.title,
      startTime: timeToSeconds(c.startTime),
      endTime: timeToSeconds(c.endTime),
      viralScore: c.viralScore,
      hook: c.hook,
      reason: c.reason,
      emotion: c.emotion as ClipEmotion,
      caption: c.caption,
      description: c.description,
      hashtags: c.hashtags,
      status: 'SUGGESTED',
    })),
  })

  await updateVideoStatus(sourceVideoId, 'COMPLETED')
  await job.updateProgress(100)

  console.log(`[Worker] Vídeo processado: ${sourceVideoId} — ${suggestedClips.length} cortes sugeridos`)
  return { sourceVideoId, clipsFound: suggestedClips.length }
}

export function createVideoWorker() {
  const worker = new Worker('video-processing', processVideo, {
    connection: redisConnection,
    concurrency: 2,
  })

  worker.on('completed', (job) => {
    console.log(`[Worker] Job ${job.id} concluído`)
  })

  worker.on('failed', async (job, err) => {
    console.error(`[Worker] Job ${job?.id} falhou:`, err.message)
    if (job?.data?.sourceVideoId) {
      // A duplicate/stale job for the same video can fail after another job
      // already completed it successfully — never let that clobber a good
      // COMPLETED status back to FAILED.
      const current = await prisma.sourceVideo
        .findUnique({ where: { id: job.data.sourceVideoId }, select: { status: true } })
        .catch(() => null)
      if (current?.status === 'COMPLETED') {
        console.warn(`[Worker] Job ${job.id} falhou mas o vídeo ${job.data.sourceVideoId} já está COMPLETED — ignorando.`)
        return
      }
      await updateVideoStatus(job.data.sourceVideoId, 'FAILED', err.message).catch(console.error)
    }
  })

  return worker
}
