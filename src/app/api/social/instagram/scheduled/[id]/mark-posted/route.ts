import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  publishedUrl: z.string().url().optional(),
})

// POST /api/social/instagram/scheduled/:id/mark-posted -> usado pelos
// agendamentos MANUAL_SCHEDULED (hoje, YouTube Shorts) — o usuário posta na
// mão e confirma aqui, opcionalmente com o link do vídeo publicado.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const post = await prisma.scheduledPost.findFirst({ where: { id: params.id, userId } })
  if (!post) return NextResponse.json({ error: 'Agendamento não encontrado' }, { status: 404 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

  const updated = await prisma.scheduledPost.update({
    where: { id: post.id },
    data: { status: 'POSTED', publishedUrl: parsed.data.publishedUrl },
  })

  return NextResponse.json({ id: updated.id, status: updated.status })
}
