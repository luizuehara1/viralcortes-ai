import { videoQueue, clipQueue, importQueue, socialPublishQueue } from '@/lib/queue'

// Nunca cacheado — cada carregamento desta página é uma leitura sob demanda
// (getJobCounts), não um polling automático. Ficar sem cache aqui é
// intencional: é justamente o "refresh manual" que a página existe pra dar.
export const dynamic = 'force-dynamic'

const QUEUES = [
  { name: 'video-processing', label: 'Processamento de vídeo', queue: videoQueue },
  { name: 'clip-rendering', label: 'Renderização de cortes', queue: clipQueue },
  { name: 'video-import', label: 'Importação de vídeo', queue: importQueue },
  { name: 'social-publish', label: 'Publicação social', queue: socialPublishQueue },
]

export default async function QueuesDebugPage() {
  const counts = await Promise.all(
    QUEUES.map(async (q) => ({
      name: q.name,
      label: q.label,
      counts: await q.queue.getJobCounts('active', 'waiting', 'delayed', 'completed', 'failed'),
    }))
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Filas (debug)</h1>
          <p className="text-sm text-white/40">
            Uma leitura pontual do Redis por carregamento — sem atualização automática.
          </p>
        </div>
        <a
          href="/debug/queues"
          className="text-xs px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
        >
          Atualizar
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {counts.map((q) => (
          <div key={q.name} className="glass rounded-2xl p-5">
            <h2 className="font-semibold mb-1">{q.label}</h2>
            <p className="text-xs text-white/30 font-mono mb-4">{q.name}</p>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-white/40">Ativos</dt>
              <dd className="text-right font-medium">{q.counts.active ?? 0}</dd>
              <dt className="text-white/40">Aguardando</dt>
              <dd className="text-right font-medium">{q.counts.waiting ?? 0}</dd>
              <dt className="text-white/40">Atrasados</dt>
              <dd className="text-right font-medium">{q.counts.delayed ?? 0}</dd>
              <dt className="text-white/40">Concluídos</dt>
              <dd className="text-right font-medium text-green-400">{q.counts.completed ?? 0}</dd>
              <dt className="text-white/40">Falharam</dt>
              <dd className="text-right font-medium text-red-400">{q.counts.failed ?? 0}</dd>
            </dl>
          </div>
        ))}
      </div>
    </div>
  )
}
