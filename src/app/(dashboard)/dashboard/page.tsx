import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import {
  Plus, FolderOpen, TrendingUp, Scissors, Clock, ArrowRight
} from 'lucide-react'
import { formatDuration } from '@/lib/utils'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id

  const [projects, totalClips, recentVideos] = await Promise.all([
    prisma.project.findMany({
      where: { userId },
      include: {
        _count: { select: { sourceVideos: true } },
        sourceVideos: {
          select: { id: true, status: true, title: true, duration: true, createdAt: true, thumbnailUrl: true, suggestedClips: { select: { id: true } } },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.suggestedClip.count({
      where: { sourceVideo: { project: { userId } } },
    }),
    prisma.sourceVideo.findMany({
      where: { project: { userId }, status: { in: ['EXTRACTING_AUDIO', 'TRANSCRIBING', 'ANALYZING'] } },
      select: { id: true, title: true, status: true, projectId: true },
      take: 3,
    }),
  ])

  const stats = [
    { label: 'Projetos', value: projects.length, icon: FolderOpen },
    { label: 'Cortes Gerados', value: totalClips, icon: Scissors },
    { label: 'Em processamento', value: recentVideos.length, icon: Clock },
  ]

  const statusLabel: Record<string, string> = {
    EXTRACTING_AUDIO: 'Extraindo áudio...',
    TRANSCRIBING: 'Transcrevendo...',
    ANALYZING: 'Analisando com IA...',
  }

  return (
    <div className="space-y-8 animate-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1">
            Bem-vindo de volta, {session?.user?.name?.split(' ')[0]}
          </p>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-all duration-200"
        >
          <Plus className="w-4 h-4" />
          Novo projeto
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-violet-500/15 flex items-center justify-center">
                <s.icon className="w-4.5 h-4.5 text-violet-400" />
              </div>
              <span className="text-white/50 text-sm">{s.label}</span>
            </div>
            <p className="text-3xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Processing */}
      {recentVideos.length > 0 && (
        <div className="glass rounded-2xl p-6">
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-4 h-4 text-violet-400" />
            Em processamento
          </h2>
          <div className="space-y-3">
            {recentVideos.map((v) => (
              <Link
                key={v.id}
                href={`/projects/${v.projectId}`}
                className="flex items-center justify-between p-3 rounded-xl bg-white/3 hover:bg-white/6 transition-colors"
              >
                <div>
                  <p className="font-medium text-sm">{v.title || 'Vídeo sem título'}</p>
                  <p className="text-xs text-violet-400 mt-0.5">{statusLabel[v.status] || v.status}</p>
                </div>
                <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse-slow" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Projects */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Projetos recentes</h2>
          <Link href="/projects" className="text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1">
            Ver todos <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="glass rounded-2xl p-12 text-center">
            <FolderOpen className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/50 mb-4">Nenhum projeto ainda</p>
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Criar primeiro projeto
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => {
              const video = p.sourceVideos[0]
              return (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="glass-hover rounded-2xl p-5 block group"
                >
                  <div className="flex items-start justify-between mb-3">
                    {video?.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={video.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="w-10 h-10 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-700/20 flex items-center justify-center">
                        <FolderOpen className="w-5 h-5 text-violet-400" />
                      </div>
                    )}
                    <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/60 transition-colors" />
                  </div>
                  <h3 className="font-semibold mb-1 truncate">{p.title}</h3>
                  <p className="text-xs text-white/40">
                    {p._count.sourceVideos} vídeo{p._count.sourceVideos !== 1 ? 's' : ''}
                    {video?.duration ? ` · ${formatDuration(video.duration)}` : ''}
                  </p>
                  {video && (
                    <div className="mt-3 pt-3 border-t border-white/5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        video.status === 'COMPLETED'
                          ? 'bg-green-500/15 text-green-400'
                          : video.status === 'FAILED'
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-violet-500/15 text-violet-400'
                      }`}>
                        {video.status === 'COMPLETED'
                          ? `${video.suggestedClips.length} cortes`
                          : video.status === 'FAILED'
                          ? 'Falhou'
                          : 'Processando...'}
                      </span>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
