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
  return clipQueue.add(
    'render-clip',
    { clipId, format, fitMode },
    { jobId: `clip-${clipId}-${format}-${fitMode}` }
  )
}
