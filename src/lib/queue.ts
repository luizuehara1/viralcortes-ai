import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
})

export const videoQueue = new Queue('video-processing', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

export const clipQueue = new Queue('clip-rendering', {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

export const importQueue = new Queue('video-import', {
  connection: redisConnection,
  defaultJobOptions: {
    // Only 2 attempts — a failed import is often a permanent condition
    // (channel not live, unsupported/private content), not worth burning
    // bandwidth retrying like a transient network blip.
    attempts: 2,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: 50,
    removeOnFail: 100,
  },
})

export async function enqueueVideoProcessing(sourceVideoId: string) {
  return videoQueue.add('process-video', { sourceVideoId }, { jobId: `video-${sourceVideoId}` })
}

export async function enqueueVideoImport(sourceVideoId: string) {
  return importQueue.add('import-video', { sourceVideoId }, { jobId: `import-${sourceVideoId}` })
}

export async function enqueueClipRendering(clipId: string, format: string = 'ORIGINAL', fitMode: string = 'CONTAIN') {
  // jobId precisa ser único POR TENTATIVA, não só por clip+formato: o BullMQ
  // trata add() com um jobId que já existe (mesmo já COMPLETO ou FALHO,
  // enquanto o registro não for varrido pelo removeOnComplete/removeOnFail)
  // como um no-op silencioso — não lança erro, só devolve o job antigo sem
  // enfileirar nada novo. Isso fazia "Tentar novamente" (mesmo formato de um
  // corte que já falhou antes) marcar o clip como RENDERING no banco sem
  // nenhum job real rodar. A proteção contra clique duplicado já existe do
  // jeito certo em route.ts (bloqueia se clip.status === 'RENDERING').
  const jobId = `clip-${clipId}-${format}-${fitMode}-${Date.now()}`
  return clipQueue.add('render-clip', { clipId, format, fitMode }, { jobId })
}

export const socialPublishQueue = new Queue('social-publish', {
  connection: redisConnection,
  defaultJobOptions: {
    // Uma tentativa só — se falhar (container ERROR, timeout, token
    // inválido), o motivo já fica salvo em ScheduledPost.errorMessage;
    // re-tentar sozinho poderia publicar duas vezes se a falha foi só no
    // registro do resultado, não na publicação em si.
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 200,
  },
})

// delayMs <= 0 publica assim que o worker pegar o job (ScheduledPost com
// scheduledAt no passado/agora).
export async function enqueueSocialPublish(scheduledPostId: string, delayMs: number) {
  return socialPublishQueue.add(
    'publish',
    { scheduledPostId },
    { jobId: `publish-${scheduledPostId}`, delay: Math.max(0, delayMs) }
  )
}
