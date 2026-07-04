import { Worker, Job } from 'bullmq'
import path from 'path'
import fs from 'fs'
import { redisConnection } from '@/lib/queue'
import { prisma } from '@/lib/prisma'
import { renderClip } from '@/lib/ffmpeg'
import { getClipsDir } from '@/lib/utils'
import type { ClipFormat, FitMode, EditorState } from '@/types'

async function processClipRender(job: Job) {
  const { clipId, format, fitMode } = job.data as { clipId: string; format: ClipFormat; fitMode?: FitMode }

  const clip = await prisma.suggestedClip.findUnique({
    where: { id: clipId },
    include: { sourceVideo: true },
  })

  if (!clip) throw new Error('Clip não encontrado')
  if (!clip.sourceVideo.filePath) throw new Error('Arquivo de vídeo não encontrado')

  await prisma.suggestedClip.update({ where: { id: clipId }, data: { status: 'RENDERING' } })

  const clipsDir = getClipsDir()
  const clipDir = path.join(clipsDir, clipId)
  fs.mkdirSync(clipDir, { recursive: true })

  const resolvedFitMode = fitMode || 'CONTAIN'
  const outputFilename = `${format.toLowerCase()}_${resolvedFitMode.toLowerCase()}_${Date.now()}.mp4`
  const outputPath = path.join(clipDir, outputFilename)
  const duration = clip.endTime - clip.startTime

  // Se o usuário editou o clipe no editor (overlays, legendas, efeitos), o
  // resultado disso é sempre aplicado — foi um ato explícito dele, então não
  // depende do exportMode 'clean'/'captioned' de sempre.
  const editorState = clip.editorState as EditorState | null

  await renderClip({
    inputPath: clip.sourceVideo.filePath,
    outputPath,
    startTime: clip.startTime,
    duration,
    format,
    fitMode: resolvedFitMode,
    exportMode: 'clean',
    caption: clip.caption || undefined,
    title: clip.title,
    editorOverlays: editorState?.textOverlays,
    editorCaptions: editorState?.captions,
    editorCaptionStyle: editorState?.captionStyle,
    editorEffects: editorState?.effects,
    // Presente = layout split-screen (facecam) — sobrepõe fitMode dentro de
    // renderClip, ver src/lib/ffmpeg.ts.
    layoutMode: editorState?.layoutMode ?? undefined,
    layoutConfig: editorState?.layoutConfig,
    transform: editorState?.transform,
    layers: editorState?.layers,
    onProgress: async (progress) => {
      await job.updateProgress(progress)
    },
  })

  const stats = fs.statSync(outputPath)

  const rendered = await prisma.renderedClip.create({
    data: {
      suggestedClipId: clipId,
      filePath: outputPath,
      fileSize: stats.size,
      format,
      fitMode: resolvedFitMode,
      duration,
    },
  })

  await prisma.suggestedClip.update({ where: { id: clipId }, data: { status: 'RENDERED' } })

  console.log(`[ClipWorker] Clip renderizado: ${clipId} → ${outputPath}`)
  return { renderedClipId: rendered.id, filePath: outputPath }
}

export function createClipWorker() {
  const worker = new Worker('clip-rendering', processClipRender, {
    connection: redisConnection,
    // Container roda com só 1GB de RAM, compartilhado com o servidor Next.js
    // e os outros workers — 2 encodes de ffmpeg em paralelo (cada um
    // decodificando um vídeo fonte inteiro) já foi motivo de OOM na prática
    // (ffmpeg morto com SIGKILL). Um de cada vez é mais lento mas não
    // derruba o container; pode subir via RENDER_CONCURRENCY se o plano
    // de memória do Railway for aumentado depois.
    concurrency: Math.max(1, Number(process.env.RENDER_CONCURRENCY) || 1),
  })

  worker.on('completed', (job) => {
    console.log(`[ClipWorker] Job ${job.id} concluído`)
  })

  worker.on('failed', async (job, err) => {
    console.error(`[ClipWorker] Job ${job?.id} falhou:`, err.message)
    if (job?.data?.clipId) {
      await prisma.suggestedClip
        .update({ where: { id: job.data.clipId }, data: { status: 'FAILED', errorMessage: err.message } })
        .catch(console.error)
    }
  })

  return worker
}
