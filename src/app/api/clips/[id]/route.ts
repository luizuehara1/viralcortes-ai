import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id

  const clip = await prisma.suggestedClip.findFirst({
    where: {
      id: params.id,
      sourceVideo: { project: { userId } },
    },
    select: {
      id: true,
      status: true,
      errorMessage: true,
      updatedAt: true,
      renderedClips: {
        select: { id: true, format: true, filePath: true },
      },
    },
  })

  if (!clip) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(clip)
}
