import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'crypto'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enqueueSocialPublish } from '@/lib/queue'

const schema = z.object({
  sourceType: z.enum(['CLIP', 'TEMPLATE_OUTPUT']),
  // Para CLIP, sourceId é o id do RenderedClip (o arquivo final já
  // renderizado num formato específico) — não o SuggestedClip.
  sourceId: z.string().min(1),
  caption: z.string().max(2200), // limite de legenda do Instagram
  scheduledAt: z.string().datetime(),
})

// POST /api/social/instagram/schedule -> agenda a publicação de um clipe
// renderizado ou resultado do Template Studio no Instagram (Reels). Cria o
// ScheduledPost e enfileira o job com delay = scheduledAt - agora (mínimo 0,
// ou seja "agora" publica assim que o worker pegar o job).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos', details: parsed.error.flatten() }, { status: 400 })
  }
  const { sourceType, sourceId, caption, scheduledAt } = parsed.data

  const instagramAccount = await prisma.socialAccount.findUnique({
    where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
  })
  if (!instagramAccount) {
    return NextResponse.json({ error: 'Conecte sua conta do Instagram antes de agendar uma publicação.' }, { status: 409 })
  }

  if (sourceType === 'CLIP') {
    const rendered = await prisma.renderedClip.findFirst({
      where: { id: sourceId, suggestedClip: { sourceVideo: { project: { userId } } } },
    })
    if (!rendered) return NextResponse.json({ error: 'Corte renderizado não encontrado' }, { status: 404 })
    if (!rendered.filePath) return NextResponse.json({ error: 'Corte ainda não terminou de renderizar' }, { status: 409 })
  } else {
    const output = await prisma.templateOutput.findFirst({ where: { id: sourceId, userId } })
    if (!output) return NextResponse.json({ error: 'Resultado do template não encontrado' }, { status: 404 })
  }

  const publicToken = crypto.randomUUID()
  const scheduledDate = new Date(scheduledAt)
  const delayMs = scheduledDate.getTime() - Date.now()

  const post = await prisma.scheduledPost.create({
    data: {
      userId,
      sourceType,
      sourceId,
      platform: 'INSTAGRAM',
      caption,
      scheduledAt: scheduledDate,
      publicToken,
    },
  })

  try {
    await enqueueSocialPublish(post.id, delayMs)
  } catch (err: any) {
    // Se não conseguiu nem enfileirar, o ScheduledPost criado acima nunca
    // vai disparar — apaga em vez de deixar um registro PENDING órfão, e
    // devolve o motivo real (ex.: Redis fora do ar / cota estourada) em vez
    // de um 500 genérico em HTML que o cliente não consegue parsear.
    await prisma.scheduledPost.delete({ where: { id: post.id } }).catch(() => {})
    console.error('[instagram/schedule] Falha ao enfileirar publicação:', err.message)
    return NextResponse.json(
      { error: `Falha ao agendar: não foi possível enfileirar o job (${err.message}). Tente novamente em instantes.` },
      { status: 503 }
    )
  }

  return NextResponse.json({ id: post.id, status: post.status, scheduledAt: post.scheduledAt }, { status: 201 })
}
