import { Worker, Job } from 'bullmq'
import { redisConnection } from '@/lib/queue'
import { prisma } from '@/lib/prisma'
import { getAppUrl } from '@/lib/app-url'
import {
  getStoredInstagramToken,
  createReelsContainer,
  waitForContainerReady,
  publishContainer,
} from '@/lib/instagram'

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
    const { accessToken, instagramUserId } = await getStoredInstagramToken(post.userId)
    const videoUrl = `${getAppUrl()}/api/public/media/${post.publicToken}`

    console.log(`[SocialPublisher] Criando container de mídia — video_url: ${videoUrl}`)
    const { containerId } = await createReelsContainer(instagramUserId, accessToken, videoUrl, post.caption)

    console.log(`[SocialPublisher] Aguardando container ${containerId} ficar pronto...`)
    await waitForContainerReady(containerId, accessToken)

    console.log(`[SocialPublisher] Publicando container ${containerId}...`)
    const { instagramMediaId } = await publishContainer(instagramUserId, containerId, accessToken)

    await prisma.scheduledPost.update({
      where: { id: scheduledPostId },
      data: { status: 'PUBLISHED', instagramMediaId, errorMessage: null },
    })
    console.log(`[SocialPublisher] ${scheduledPostId} publicado — instagramMediaId: ${instagramMediaId}`)
    return { instagramMediaId }
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
    // do lado da Meta (poll), não usando CPU local — pode rodar mais de um
    // em paralelo sem competir por recurso como o render de FFmpeg faz.
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
