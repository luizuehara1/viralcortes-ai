import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import {
  Plus, FolderOpen, Scissors, Clock, ArrowRight, Upload, CalendarClock, Link2,
} from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { StatCard } from '@/components/ui/stat-card'
import { GlassCard } from '@/components/ui/glass-card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id

  const [projects, totalClips, recentVideos, totalVideos, scheduledCount, connectedAccounts] = await Promise.all([
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
      where: { project: { userId }, status: { in: ['EXTRACTING_AUDIO', 'TRANSCRIBING', 'ANALYZING', 'AWAITING_LOCAL_DOWNLOAD'] } },
      select: { id: true, title: true, status: true, projectId: true },
      take: 3,
    }),
    prisma.sourceVideo.count({ where: { project: { userId } } }),
    prisma.scheduledPost.count({ where: { userId, status: { in: ['PENDING', 'MANUAL_SCHEDULED'] } } }),
    prisma.socialAccount.count({ where: { userId } }),
  ])

  const stats = [
    { label: 'Vídeos enviados', value: totalVideos, icon: Upload, tone: 'violet' as const },
    { label: 'Cortes gerados', value: totalClips, icon: Scissors, tone: 'violet' as const },
    { label: 'Cortes agendados', value: scheduledCount, icon: CalendarClock, tone: 'neon' as const },
    { label: 'Redes conectadas', value: connectedAccounts, icon: Link2, tone: 'neon' as const },
  ]

  const statusLabel: Record<string, string> = {
    EXTRACTING_AUDIO: 'Extraindo áudio...',
    TRANSCRIBING: 'Transcrevendo...',
    ANALYZING: 'Analisando com IA...',
    AWAITING_LOCAL_DOWNLOAD: 'Aguardando download automático...',
  }

  return (
    <div className="space-y-8 animate-in">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl glass p-6 sm:p-8">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-violet-600/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-neon-500/10 rounded-full blur-3xl" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">
              Bem-vindo de volta, <span className="gradient-text">{session?.user?.name?.split(' ')[0] || 'criador'}</span>
            </h1>
            <p className="text-white/40 text-sm mt-1.5">Transforme suas lives e vídeos longos em cortes virais com IA.</p>
          </div>
          <Link href="/projects/new">
            <Button icon={<Plus className="w-4 h-4" />}>Novo projeto</Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} tone={s.tone} />
        ))}
      </div>

      {/* Processing */}
      {recentVideos.length > 0 && (
        <GlassCard className="p-6">
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
        </GlassCard>
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
          <EmptyState
            icon={FolderOpen}
            title="Nenhum projeto ainda"
            description="Crie seu primeiro projeto pra importar uma live ou vídeo e deixar a IA encontrar os melhores cortes."
            action={
              <Link href="/projects/new">
                <Button icon={<Plus className="w-4 h-4" />}>Criar primeiro projeto</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => {
              const video = p.sourceVideos[0]
              return (
                <GlassCard key={p.id} href={`/projects/${p.id}`} hover className="p-5 group">
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
                      <Badge tone={video.status === 'COMPLETED' ? 'success' : video.status === 'FAILED' ? 'error' : 'violet'}>
                        {video.status === 'COMPLETED'
                          ? `${video.suggestedClips.length} cortes`
                          : video.status === 'FAILED'
                          ? 'Falhou'
                          : 'Processando...'}
                      </Badge>
                    </div>
                  )}
                </GlassCard>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
