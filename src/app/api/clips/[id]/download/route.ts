import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import fs from 'fs'
import path from 'path'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id

  const rendered = await prisma.renderedClip.findFirst({
    where: {
      id: params.id,
      suggestedClip: {
        sourceVideo: { project: { userId } },
      },
    },
    include: { suggestedClip: { select: { title: true } } },
  })

  if (!rendered || !rendered.filePath) {
    return NextResponse.json({ error: 'Clip não encontrado' }, { status: 404 })
  }

  if (!fs.existsSync(rendered.filePath) || fs.statSync(rendered.filePath).size === 0) {
    return NextResponse.json({ error: 'Arquivo não encontrado no servidor' }, { status: 404 })
  }

  const fileBuffer = fs.readFileSync(rendered.filePath)
  const filename = `${rendered.suggestedClip.title.slice(0, 50)}_${rendered.format}.mp4`
    .replace(/[^a-zA-Z0-9_\-.]/g, '_')

  return new NextResponse(fileBuffer, {
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(fileBuffer.length),
    },
  })
}
