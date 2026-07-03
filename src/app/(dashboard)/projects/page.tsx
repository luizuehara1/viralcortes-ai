import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Plus, FolderOpen, ArrowRight, Film, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDuration } from '@/lib/utils'
import { DeleteProjectButton } from '@/components/projects/delete-project-button'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 24

interface Props {
  searchParams: { page?: string }
}

export default async function ProjectsPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id

  const page = Math.max(1, Number(searchParams.page) || 1)

  const [projects, totalCount] = await Promise.all([
    prisma.project.findMany({
      where: { userId },
      include: {
        sourceVideos: {
          select: {
            id: true, status: true, title: true, duration: true, createdAt: true, thumbnailUrl: true,
            suggestedClips: { select: { id: true, status: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: { select: { sourceVideos: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.project.count({ where: { userId } }),
  ])

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  return (
    <div className="animate-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projetos</h1>
          <p className="text-white/40 text-sm mt-1">{totalCount} projeto{totalCount !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          Novo projeto
        </Link>
      </div>

      {totalCount === 0 ? (
        <div className="glass rounded-2xl p-16 text-center">
          <FolderOpen className="w-14 h-14 text-white/15 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Nenhum projeto ainda</h2>
          <p className="text-white/40 mb-6">Crie seu primeiro projeto para começar a gerar cortes</p>
          <Link
            href="/projects/new"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Criar primeiro projeto
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const video = p.sourceVideos[0]
            const totalClips = video?.suggestedClips.length ?? 0
            const renderedClips = video?.suggestedClips.filter((c) => c.status === 'RENDERED').length ?? 0

            return (
              <div key={p.id} className="relative group">
                <Link
                  href={`/projects/${p.id}`}
                  className="glass-hover rounded-2xl p-6 block"
                >
                <div className="flex items-start justify-between mb-4">
                  {video?.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      loading="lazy"
                      className="w-11 h-11 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-700/20 flex items-center justify-center">
                      <FolderOpen className="w-5 h-5 text-violet-400" />
                    </div>
                  )}
                  <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-white/50 transition-colors mt-1 mr-8" />
                </div>

                <h3 className="font-semibold text-base mb-1 truncate">{p.title}</h3>
                <p className="text-xs text-white/40 mb-3">
                  {p._count.sourceVideos} vídeo{p._count.sourceVideos !== 1 ? 's' : ''}
                  {video?.duration ? ` · ${formatDuration(video.duration)}` : ''}
                </p>

                <div className="flex items-center gap-2">
                  {!video ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/30">
                      Sem vídeo
                    </span>
                  ) : video.status === 'COMPLETED' ? (
                    <>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">
                        {totalClips} cortes
                      </span>
                      {renderedClips > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400">
                          {renderedClips} prontos
                        </span>
                      )}
                    </>
                  ) : video.status === 'FAILED' ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">
                      Falhou
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                      Processando
                    </span>
                  )}
                </div>
                </Link>
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <DeleteProjectButton projectId={p.id} projectTitle={p.title} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href={`/projects?page=${page - 1}`}
            aria-disabled={page <= 1}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl glass text-sm font-medium transition-colors border border-white/10 ${
              page <= 1 ? 'pointer-events-none opacity-30' : 'hover:bg-white/8'
            }`}
          >
            <ChevronLeft className="w-4 h-4" />
            Anterior
          </Link>
          <span className="text-sm text-white/40">
            Página {page} de {totalPages}
          </span>
          <Link
            href={`/projects?page=${page + 1}`}
            aria-disabled={page >= totalPages}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl glass text-sm font-medium transition-colors border border-white/10 ${
              page >= totalPages ? 'pointer-events-none opacity-30' : 'hover:bg-white/8'
            }`}
          >
            Próxima
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      )}
    </div>
  )
}
