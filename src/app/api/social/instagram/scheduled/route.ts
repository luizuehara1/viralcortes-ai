import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/social/instagram/scheduled -> lista os agendamentos do usuário
// (mais recentes primeiro), para a seção de agendamentos em /integrations.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const posts = await prisma.scheduledPost.findMany({
    where: { userId },
    orderBy: { scheduledAt: 'desc' },
    select: {
      id: true,
      sourceType: true,
      platform: true,
      caption: true,
      scheduledAt: true,
      status: true,
      instagramMediaId: true,
      errorMessage: true,
      createdAt: true,
    },
    take: 50,
  })

  return NextResponse.json({ posts })
}
