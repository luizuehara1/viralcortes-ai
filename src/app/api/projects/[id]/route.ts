import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import fs from 'fs/promises'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUploadDir, getClipsDir } from '@/lib/utils'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    include: {
      sourceVideos: {
        include: {
          suggestedClips: {
            include: { renderedClips: true },
            orderBy: { viralScore: 'desc' },
          },
          processingJobs: { orderBy: { createdAt: 'desc' }, take: 5 },
        },
        orderBy: { createdAt: 'desc' },
      },
    },
  })

  if (!project) return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  return NextResponse.json({
    ...project,
    sourceVideos: project.sourceVideos.map((v) => ({
      ...v,
      fileSize: v.fileSize ? v.fileSize.toString() : null,
      suggestedClips: v.suggestedClips.map((c) => ({
        ...c,
        renderedClips: c.renderedClips.map((r) => ({
          ...r,
          fileSize: r.fileSize ? r.fileSize.toString() : null,
        })),
      })),
    })),
  })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id
  const project = await prisma.project.findFirst({
    where: { id: params.id, userId },
    include: { sourceVideos: { include: { suggestedClips: { select: { id: true } } } } },
  })
  if (!project) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const uploadDir = getUploadDir()
  const clipsDir = getClipsDir()

  await Promise.all(
    project.sourceVideos.flatMap((video) => [
      fs.rm(path.join(uploadDir, video.id), { recursive: true, force: true }),
      ...video.suggestedClips.map((clip) =>
        fs.rm(path.join(clipsDir, clip.id), { recursive: true, force: true })
      ),
    ])
  ).catch((err) => console.error('[projects.DELETE] Falha ao remover arquivos:', err))

  await prisma.project.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
