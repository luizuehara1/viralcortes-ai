import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id

  const video = await prisma.sourceVideo.findFirst({
    where: {
      id: params.id,
      project: { userId },
    },
    select: {
      id: true,
      status: true,
      title: true,
      duration: true,
      errorMessage: true,
      errorCode: true,
      updatedAt: true,
      isLongLive: true,
      suggestedClips: {
        select: { id: true, viralScore: true, status: true },
        orderBy: { viralScore: 'desc' },
      },
      processingJobs: {
        where: { type: { in: ['TRANSCRIBE', 'ANALYZE_CLIPS'] } },
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: { type: true, status: true, progress: true, metadata: true },
      },
    },
  })

  if (!video) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const chunkJob = video.processingJobs[0]
  const { processingJobs, ...rest } = video
  return NextResponse.json({
    ...rest,
    chunkProgress: chunkJob
      ? {
          type: chunkJob.type,
          progress: chunkJob.progress,
          ...(chunkJob.metadata as Record<string, unknown> | null),
        }
      : null,
  })
}
