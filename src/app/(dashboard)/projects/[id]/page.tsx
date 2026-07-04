import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, FolderOpen, Plus, Scissors, TrendingUp,
  Download, Upload, LinkIcon
} from 'lucide-react'
import { formatDuration, formatFileSize } from '@/lib/utils'
import { StatusTracker } from '@/components/processing/status-tracker'
import { ClipsGrid } from '@/components/clips/clips-grid'
import { ProjectRefresher } from '@/components/clips/project-refresher'
import { DeleteProjectButton } from '@/components/projects/delete-project-button'
import { DeleteVideoButton } from '@/components/projects/delete-video-button'
import { SOURCE_PLATFORM_LABELS } from '@/types'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'

interface Props {
  params: { id: string }
}

export const dynamic = 'force-dynamic'

export default async function ProjectPage({ params }: Props) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id

  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    include: {
      sourceVideos: {
        include: {
          suggestedClips: {
            include: { renderedClips: true },
            orderBy: { viralScore: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!project) notFound()

  const latestVideo = project.sourceVideos[0]
  const clips = latestVideo?.suggestedClips ?? []
  const renderedCount = clips.filter((c) => c.status === 'RENDERED').length
  // StatusTracker owns the whole non-terminal + FAILED experience (steps,
  // stuck detection, retry/cancel, technical error). Only auto-refresh the
  // page in the background while something is genuinely still running —
  // once FAILED there's nothing new to poll for from the server.
  const isProcessing = latestVideo && !['COMPLETED', 'FAILED'].includes(latestVideo.status)
  const showStatusTracker = latestVideo && latestVideo.status !== 'COMPLETED'

  return (
    <div className="max-w-5xl mx-auto animate-in space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg glass hover:bg-white/8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{project.title}</h1>
            {latestVideo && (
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-white/5 text-white/40 border border-white/10">
                  {latestVideo.sourceType === 'URL' ? <LinkIcon className="w-3 h-3" /> : <Upload className="w-3 h-3" />}
                  {latestVideo.sourceType === 'URL' && latestVideo.sourcePlatform
                    ? SOURCE_PLATFORM_LABELS[latestVideo.sourcePlatform]
                    : 'Upload do PC'}
                </span>
                {latestVideo.duration && (
                  <span className="text-white/40 text-sm">
                    {formatDuration(latestVideo.duration)}
                    {latestVideo.fileSize ? ` · ${formatFileSize(Number(latestVideo.fileSize))}` : ''}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latestVideo && (
            <DeleteVideoButton
              videoId={latestVideo.id}
              className="flex items-center gap-2 px-3 py-2 rounded-xl glass hover:bg-red-500/20 text-white/40 hover:text-red-400 text-sm font-medium transition-colors border border-white/10 disabled:opacity-50"
            />
          )}
          <Link href="/projects/new">
            <Button variant="glass" icon={<Plus className="w-4 h-4" />}>Novo vídeo</Button>
          </Link>
          <DeleteProjectButton
            projectId={project.id}
            projectTitle={project.title}
            redirectTo="/projects"
            className="p-2.5 rounded-xl glass hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-colors border border-white/10 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Status tracker: covers processing steps, stuck detection, and the
          FAILED state (with retry/cancel) in one place. */}
      {showStatusTracker && (
        isProcessing ? (
          <ProjectRefresher>
            <StatusTracker
              sourceVideoId={latestVideo.id}
              projectId={project.id}
              initialStatus={latestVideo.status as any}
              initialErrorMessage={latestVideo.errorMessage}
              initialErrorCode={latestVideo.errorCode}
              sourceType={latestVideo.sourceType as any}
              isLongLive={latestVideo.isLongLive}
            />
          </ProjectRefresher>
        ) : (
          <StatusTracker
            sourceVideoId={latestVideo.id}
            projectId={project.id}
            initialStatus={latestVideo.status as any}
            initialErrorMessage={latestVideo.errorMessage}
            initialErrorCode={latestVideo.errorCode}
            sourceType={latestVideo.sourceType as any}
            isLongLive={latestVideo.isLongLive}
          />
        )
      )}

      {/* Stats when completed */}
      {latestVideo?.status === 'COMPLETED' && clips.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={Scissors} label="Cortes sugeridos" value={clips.length} />
          <StatCard
            icon={TrendingUp}
            label="Score médio"
            value={clips.length ? Math.round(clips.reduce((a, c) => a + c.viralScore, 0) / clips.length) : 0}
            tone="neon"
          />
          <StatCard icon={Download} label="Prontos para baixar" value={renderedCount} tone="neon" />
        </div>
      )}

      {/* No video yet */}
      {!latestVideo && (
        <EmptyState
          icon={FolderOpen}
          title="Nenhum vídeo neste projeto"
          action={
            <Link href="/projects/new">
              <Button icon={<Plus className="w-4 h-4" />}>Adicionar vídeo</Button>
            </Link>
          }
        />
      )}

      {/* Clips grid */}
      {clips.length > 0 && <ClipsGrid clips={clips} />}

      {/* Waiting for clips */}
      {latestVideo?.status === 'COMPLETED' && clips.length === 0 && (
        <EmptyState
          icon={Scissors}
          title="Nenhum corte foi identificado neste vídeo."
          description="Tente com um vídeo diferente."
        />
      )}
    </div>
  )
}

