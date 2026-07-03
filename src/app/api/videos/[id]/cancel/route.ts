import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { videoQueue, importQueue } from '@/lib/queue'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id
  const video = await prisma.sourceVideo.findFirst({
    where: { id: params.id, project: { userId } },
  })
  if (!video) return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 })
  if (video.status === 'COMPLETED') {
    return NextResponse.json({ error: 'Este vídeo já foi processado' }, { status: 400 })
  }

  // Best-effort: se o job ainda estiver esperando/travado na fila, remove.
  // Se já estiver ativo num worker, não há como matar o processo ffmpeg/yt-dlp
  // remotamente — mas o status no banco já deixa de aparecer como "processando".
  const [job, importJob] = await Promise.all([
    videoQueue.getJob(`video-${video.id}`),
    importQueue.getJob(`import-${video.id}`),
  ])
  if (job) {
    await job.remove().catch((err) => {
      console.warn(`[cancel] Não foi possível remover job de ${video.id}:`, err.message)
    })
  }
  if (importJob) {
    await importJob.remove().catch((err) => {
      console.warn(`[cancel] Não foi possível remover job de importação de ${video.id}:`, err.message)
    })
  }

  await prisma.sourceVideo.update({
    where: { id: video.id },
    data: { status: 'FAILED', errorMessage: 'Cancelado pelo usuário' },
  })

  return NextResponse.json({ ok: true })
}
