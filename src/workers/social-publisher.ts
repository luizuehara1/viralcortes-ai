import { Worker, Job } from 'bullmq'
import { redisConnection } from '@/lib/queue'
import { prisma } from '@/lib/prisma'
import { getAppUrl } from '@/lib/app-url'
import { resolveScheduledPostFilePath } from '@/lib/scheduled-post-media'
import {
  getStoredInstagramToken,
  createReelsContainer,
  waitForContainerReady,
  publishContainer,
} from '@/lib/instagram'
import { getValidAccessToken, uploadVideo } from '@/lib/youtube'

async function publishToInstagram(post: { id: string; userId: string; publicToken: string; caption: string; hashtags: string[] }) {
  const { accessToken, instagramUserId } = await getStoredInstagramToken(post.userId)
  const videoUrl = `${getAppUrl()}/api/public/media/${post.publicToken}`
  // Instagram não tem campo de título separado — a legenda do post é
  // legenda + hashtags.
  const fullCaption = [post.caption, post.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n')

  console.log(`[SocialPublisher] Criando container de mídia — video_url: ${videoUrl}`)
  const { containerId } = await createReelsContainer(instagramUserId, accessToken, videoUrl, fullCaption)

  console.log(`[SocialPublisher] Aguardando container ${containerId} ficar pronto...`)
  await waitForContainerReady(containerId, accessToken)

  console.log(`[SocialPublisher] Publicando container ${containerId}...`)
  const { instagramMediaId } = await publishContainer(instagramUserId, containerId, accessToken)

  return { instagramMediaId, publishedUrl: null as string | null }
}

async function publishToYoutube(post: {
  id: string
  userId: string
  sourceType: 'CLIP' | 'TEMPLATE_OUTPUT'
  sourceId: string
  title: string | null
  caption: string
  hashtags: string[]
  scheduledAt: Date
}) {
  const filePath = await resolveScheduledPostFilePath(post)
  if (!filePath) throw new Error('Arquivo do vídeo não encontrado (registro de origem ausente).')

  const accessToken = await getValidAccessToken(post.userId)
  const title = post.title || post.caption.split(/[.!?\n]/)[0].slice(0, 100) || 'Corte viral'
  const description = [post.caption, post.hashtags.map((h) => `#${h}`).join(' ')].filter(Boolean).join('\n\n')

  console.log(`[SocialPublisher] Enviando vídeo pro YouTube — arquivo: ${filePath}`)
  const { videoId, url } = await uploadVideo(accessToken, filePath, {
    title,
    description,
    tags: post.hashtags,
    publishAt: post.scheduledAt,
  })

  return { youtubeVideoId: videoId, publishedUrl: url }
}

async function processSocialPublish(job: Job) {
  const { scheduledPostId } = job.data as { scheduledPostId: string }

  const post = await prisma.scheduledPost.findUnique({ where: { id: scheduledPostId } })
  if (!post) throw new Error(`ScheduledPost ${scheduledPostId} não encontrado`)
  if (post.status === 'PUBLISHED') {
    console.warn(`[SocialPublisher] ${scheduledPostId} já está PUBLISHED — ignorando.`)
    return { skipped: true }
  }

  console.log(`[SocialPublisher] Publicando ${scheduledPostId} (${post.sourceType}/${post.sourceId}) para ${post.platform}`)
  await prisma.scheduledPost.update({ where: { id: scheduledPostId }, data: { status: 'PUBLISHING', errorMessage: null } })

  try {
    const result =
      post.platform === 'YOUTUBE_SHORTS'
        ? await publishToYoutube(post)
        : await publishToInstagram(post)

    await prisma.scheduledPost.update({
      where: { id: scheduledPostId },
      data: {
        status: 'PUBLISHED',
        errorMessage: null,
        ...('instagramMediaId' in result ? { instagramMediaId: result.instagramMediaId } : {}),
        ...('youtubeVideoId' in result ? { youtubeVideoId: result.youtubeVideoId } : {}),
        ...(result.publishedUrl ? { publishedUrl: result.publishedUrl } : {}),
      },
    })
    console.log(`[SocialPublisher] ${scheduledPostId} publicado.`)
    return result
  } catch (err: any) {
    console.error(`[SocialPublisher] Falha ao publicar ${scheduledPostId}:`, err.message)
    await prisma.scheduledPost
      .update({ where: { id: scheduledPostId }, data: { status: 'FAILED', errorMessage: err.message } })
      .catch(console.error)
    throw err
  }
}

export function createSocialPublisherWorker() {
  const worker = new Worker('social-publish', processSocialPublish, {
    connection: redisConnection,
    // Cada job passa a maior parte do tempo esperando o container processar
    // do lado da Meta/upload pro Google (não usando CPU local) — pode rodar
    // mais de um em paralelo sem competir por recurso como o render de
    // FFmpeg faz.
    concurrency: 3,
  })

  worker.on('completed', (job) => {
    console.log(`[SocialPublisher] Job ${job.id} concluído`)
  })

  worker.on('failed', (job, err) => {
    console.error(`[SocialPublisher] Job ${job?.id} falhou:`, err.message)
  })

  return worker
}
