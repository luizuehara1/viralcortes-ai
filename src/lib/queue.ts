import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'

const isProduction = process.env.NODE_ENV === 'production'
// "next build" força NODE_ENV=production e, só de importar este módulo (toda
// rota de API importa @/lib/queue), acaba construindo Queue/IORedis — e o
// construtor do Queue do BullMQ SEMPRE tenta abrir uma conexão de verdade
// (waitUntilReady interno), não tem como evitar isso só com lazyConnect do
// ioredis. Sem essa guarda, cada build/deploy gastava várias conexões reais
// no Upstash à toa, sem nenhuma rota realmente servindo requisição — foi
// isso, inclusive, que estourou a cota (500003/500000) num teste local de
// build. NEXT_PHASE identifica esse momento com precisão; NODE_ENV não dá,
// já que "next build" também o define como 'production'.
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'
const rawRedisUrl = process.env.REDIS_URL

let REDIS_URL: string
if (rawRedisUrl) {
  REDIS_URL = rawRedisUrl
} else if (isProduction && !isBuildPhase) {
  // Falha rápido e claro no boot em vez de deixar BullMQ tentar conectar
  // em localhost silenciosamente num container onde não existe Redis nenhum.
  throw new Error('REDIS_URL não configurada em produção.')
} else {
  REDIS_URL = 'redis://localhost:6379'
}

const redisUrlProtocol = (() => {
  try {
    return new URL(REDIS_URL).protocol.replace(':', '')
  } catch {
    return 'desconhecida'
  }
})()

// Nunca logar REDIS_URL inteira (contém credenciais) — só se está
// configurada e o protocolo (redis/rediss), o suficiente pra depurar. Também
// pulado no build — não é conexão real, não precisa poluir o log do build.
if (!isBuildPhase) {
  console.log(
    `[Redis] configurado=${rawRedisUrl ? 'sim' : 'não (fallback localhost — dev)'} protocolo=${redisUrlProtocol} NODE_ENV=${process.env.NODE_ENV ?? 'undefined'}`
  )
}

// Durante o build, nunca cria um client/Queue de verdade — vira um stub que
// só lançaria erro se alguém realmente chamasse um método dele, o que nunca
// acontece no build (Next só importa o módulo pra inspecionar exports, não
// executa handlers de rota).
function buildPhaseStub<T>(label: string): T {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        throw new Error(`[Redis] "${label}.${String(prop)}" acessado durante o build do Next.js — não deveria acontecer.`)
      },
    }
  ) as T
}

export const redisConnection: IORedis = isBuildPhase
  ? buildPhaseStub<IORedis>('redisConnection')
  : new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      // Upstash (rediss://) às vezes não responde bem ao "ready check" padrão
      // do ioredis (comando INFO) — desabilitar evita falso timeout de conexão.
      enableReadyCheck: false,
    })

if (!isBuildPhase) {
  redisConnection.on('error', (err) => {
    console.error('[Redis] Erro de conexão:', err instanceof Error ? err.message : err)
  })
}

// age em segundos — some sozinho depois de 1h (completo) ou 24h (falho),
// mesmo sem bater no limite de count. Reduz o quanto fica parado no Redis
// entre limpezas (cada job guardado é memória/comandos de scan a mais).
const REMOVE_ON_COMPLETE = { age: 3600, count: 100 }
const REMOVE_ON_FAIL = { age: 86400, count: 100 }

export const videoQueue: Queue = isBuildPhase
  ? buildPhaseStub<Queue>('videoQueue')
  : new Queue('video-processing', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: REMOVE_ON_COMPLETE,
        removeOnFail: REMOVE_ON_FAIL,
      },
    })

export const clipQueue: Queue = isBuildPhase
  ? buildPhaseStub<Queue>('clipQueue')
  : new Queue('clip-rendering', {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 3000 },
        removeOnComplete: REMOVE_ON_COMPLETE,
        removeOnFail: REMOVE_ON_FAIL,
      },
    })

export const importQueue: Queue = isBuildPhase
  ? buildPhaseStub<Queue>('importQueue')
  : new Queue('video-import', {
      connection: redisConnection,
      defaultJobOptions: {
        // Only 2 attempts — a failed import is often a permanent condition
        // (channel not live, unsupported/private content), not worth burning
        // bandwidth retrying like a transient network blip.
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: REMOVE_ON_COMPLETE,
        removeOnFail: REMOVE_ON_FAIL,
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

export const socialPublishQueue: Queue = isBuildPhase
  ? buildPhaseStub<Queue>('socialPublishQueue')
  : new Queue('social-publish', {
      connection: redisConnection,
      defaultJobOptions: {
        // Uma tentativa só — se falhar (container ERROR, timeout, token
        // inválido), o motivo já fica salvo em ScheduledPost.errorMessage;
        // re-tentar sozinho poderia publicar duas vezes se a falha foi só no
        // registro do resultado, não na publicação em si.
        attempts: 1,
        removeOnComplete: REMOVE_ON_COMPLETE,
        removeOnFail: REMOVE_ON_FAIL,
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
