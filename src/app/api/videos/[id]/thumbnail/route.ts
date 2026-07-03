import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import fs from 'fs'
import path from 'path'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUploadDir } from '@/lib/utils'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id
  const video = await prisma.sourceVideo.findFirst({
    where: { id: params.id, project: { userId } },
    select: { id: true },
  })
  if (!video) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })

  const thumbnailPath = path.join(getUploadDir(), video.id, 'thumbnail.jpg')
  if (!fs.existsSync(thumbnailPath)) {
    return NextResponse.json({ error: 'Thumbnail não encontrada' }, { status: 404 })
  }

  const fileBuffer = fs.readFileSync(thumbnailPath)
  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(fileBuffer.length),
      'Cache-Control': 'private, max-age=86400',
    },
  })
}
