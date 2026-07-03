import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import fs from 'fs/promises'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUploadDir, getClipsDir } from '@/lib/utils'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id
  const video = await prisma.sourceVideo.findFirst({
    where: { id: params.id, project: { userId } },
    include: { suggestedClips: { select: { id: true } } },
  })
  if (!video) return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 })

  const uploadDir = getUploadDir()
  const clipsDir = getClipsDir()

  await Promise.all([
    fs.rm(path.join(uploadDir, video.id), { recursive: true, force: true }),
    ...video.suggestedClips.map((clip) =>
      fs.rm(path.join(clipsDir, clip.id), { recursive: true, force: true })
    ),
  ]).catch((err) => console.error('[videos.DELETE] Falha ao remover arquivos:', err))

  await prisma.sourceVideo.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
