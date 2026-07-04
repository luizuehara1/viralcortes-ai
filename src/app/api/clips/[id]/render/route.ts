import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enqueueClipRendering } from '@/lib/queue'
import { z } from 'zod'

const schema = z.object({
  format: z.enum(['ORIGINAL', 'VERTICAL_9_16', 'SQUARE_1_1', 'HORIZONTAL_16_9', 'FEED_4_5']).default('ORIGINAL'),
  fitMode: z.enum(['CONTAIN', 'COVER', 'BLUR_BACKGROUND']).default('CONTAIN'),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id
  const body = await req.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Formato ou modo de encaixe inválido' }, { status: 400 })
  const { format, fitMode } = parsed.data

  const clip = await prisma.suggestedClip.findFirst({
    where: {
      id: params.id,
      sourceVideo: { project: { userId } },
    },
    include: { sourceVideo: { select: { projectId: true } } },
  })

  if (!clip) return NextResponse.json({ error: 'Clip não encontrado' }, { status: 404 })
  if (clip.status === 'RENDERING') {
    return NextResponse.json({ error: 'Clip já está sendo renderizado' }, { status: 409 })
  }

  const queueName = 'clip-rendering'
  console.log('[clips/render] Enfileirando corte', {
    clipId: params.id,
    projectId: clip.sourceVideo.projectId,
    format,
    fitMode,
    queueName,
  })

  let job
  try {
    job = await enqueueClipRendering(params.id, format, fitMode)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[clips/render] Falha ao enfileirar na fila BullMQ', { clipId: params.id, queueName, error: message })
    await prisma.suggestedClip
      .update({
        where: { id: params.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Não foi possível colocar este corte na fila de renderização. Verifique Redis/worker.',
        },
      })
      .catch((updateErr) => console.error('[clips/render] Falha ao salvar status FAILED', updateErr))
    return NextResponse.json(
      { error: 'Não foi possível colocar este corte na fila de renderização. Verifique Redis/worker.' },
      { status: 502 }
    )
  }

  console.log('[clips/render] Corte enfileirado', { clipId: params.id, jobId: job.id, queueName, status: 'RENDERING' })

  await prisma.suggestedClip.update({
    where: { id: params.id },
    data: { status: 'RENDERING', jobId: job.id ?? null, errorMessage: null },
  })

  return NextResponse.json({ clipId: params.id, status: 'RENDERING', format, fitMode, jobId: job.id })
}
