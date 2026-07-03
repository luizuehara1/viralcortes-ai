import { Worker, Job } from 'bullmq'
import path from 'path'
import fs from 'fs'
import { redisConnection, enqueueVideoProcessing } from '@/lib/queue'
import { prisma } from '@/lib/prisma'
import { downloadVideo, YtDlpError } from '@/lib/ytdlp'
import { getUploadDir } from '@/lib/utils'

async function importVideo(job: Job) {
  const { sourceVideoId } = job.data as { sourceVideoId: string }

  console.log(`[Importer] Job ${job.id} iniciado para vídeo ${sourceVideoId} (tentativa ${job.attemptsMade + 1})`)

  const video = await prisma.sourceVideo.findUnique({ where: { id: sourceVideoId } })
  if (!video || !video.sourceUrl) throw new Error('Vídeo não encontrado ou sem URL de origem')

  const uploadDir = getUploadDir()
  const videoDir = path.join(uploadDir, sourceVideoId)
  fs.mkdirSync(videoDir, { recursive: true })

  await prisma.sourceVideo.update({
    where: { id: sourceVideoId },
    data: { status: 'IMPORTING', errorMessage: null, errorCode: null, technicalError: null },
  })
  await job.updateProgress(5)

  console.log(`[Importer] Baixando de ${video.sourceUrl}`)
  const outputTemplate = path.join(videoDir, 'source.%(ext)s')
  const filePath = await downloadVideo(video.sourceUrl, outputTemplate)
  console.log(`[Importer] Download concluído: ${filePath}`)

  const stats = fs.statSync(filePath)
  await prisma.sourceVideo.update({
    where: { id: sourceVideoId },
    data: { filePath, fileSize: BigInt(stats.size), status: 'EXTRACTING_AUDIO' },
  })
  await job.updateProgress(100)

  // Hand off to the existing, untouched video-processing pipeline — same
  // path an uploaded file takes from here on (metadata, thumbnail, audio
  // extraction, transcription, AI analysis).
  await enqueueVideoProcessing(sourceVideoId)

  console.log(`[Importer] Vídeo ${sourceVideoId} importado — processamento enfileirado`)
  return { sourceVideoId, filePath }
}

export function createImportWorker() {
  const worker = new Worker('video-import', importVideo, {
    connection: redisConnection,
    // Downloads are bandwidth/CPU heavy (yt-dlp + ffmpeg remux) — keep this
    // modest and predictable rather than competing with itself.
    concurrency: 1,
  })

  worker.on('completed', (job) => {
    console.log(`[Importer] Job ${job.id} concluído`)
  })

  worker.on('failed', async (job, err) => {
    console.error(`[Importer] Job ${job?.id} falhou:`, err.message)
    if (job?.data?.sourceVideoId) {
      const current = await prisma.sourceVideo
        .findUnique({ where: { id: job.data.sourceVideoId }, select: { status: true } })
        .catch(() => null)
      if (current?.status === 'COMPLETED') {
        console.warn(`[Importer] Job ${job.id} falhou mas o vídeo ${job.data.sourceVideoId} já está COMPLETED — ignorando.`)
        return
      }
      const isYtDlpError = err instanceof YtDlpError
      const isFinalAttempt = job.attemptsMade >= (job.opts.attempts ?? 1)
      // Bloqueio anti-bot de plataforma (ex.: Kick) esgotou as tentativas
      // automáticas — em vez de desistir, deixa esperando o downloader
      // local (script no PC do dono, com o navegador logado) buscar esse
      // vídeo em vez de marcar como falha definitiva.
      if (isFinalAttempt && isYtDlpError && err.code === 'PLATFORM_BLOCKED_ACCESS') {
        await prisma.sourceVideo
          .update({
            where: { id: job.data.sourceVideoId },
            data: {
              status: 'AWAITING_LOCAL_DOWNLOAD',
              errorMessage: null,
              errorCode: null,
              technicalError: err.technicalError,
            },
          })
          .catch(console.error)
        return
      }
      await prisma.sourceVideo
        .update({
          where: { id: job.data.sourceVideoId },
          data: {
            status: 'FAILED',
            errorMessage: err.message,
            errorCode: isYtDlpError ? err.code ?? null : null,
            technicalError: isYtDlpError ? err.technicalError : null,
          },
        })
        .catch(console.error)
    }
  })

  return worker
}
