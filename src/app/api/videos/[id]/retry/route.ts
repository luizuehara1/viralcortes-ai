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

  // Se já existe um job ativo/aguardando (em qualquer uma das duas filas —
  // importação ou processamento) para este vídeo, NÃO enfileira outro por
  // cima — isso causaria dois workers no mesmo vídeo ao mesmo tempo
  // (duplicando transcript segments/suggested clips, ou baixando 2x).
  const [processingJobs, importJobs] = await Promise.all([
    videoQueue.getJobs(['active', 'waiting', 'delayed']),
    importQueue.getJobs(['active', 'waiting', 'delayed']),
  ])
  const stillRunning = [...processingJobs, ...importJobs].some((j) => (j.data as any)?.sourceVideoId === video.id)
  if (stillRunning) {
    return NextResponse.json(
      { error: 'Este vídeo já está sendo processado no momento. Aguarde terminar ou cancele antes de tentar novamente.' },
      { status: 409 }
    )
  }

  // Vídeo por link cujo download ainda não terminou (sem filePath) precisa
  // reiniciar pela importação, não pelo processamento.
  const needsReimport = video.sourceType === 'URL' && !video.filePath

  if (needsReimport) {
    const oldImportJob = await importQueue.getJob(`import-${video.id}`)
    if (oldImportJob) {
      await oldImportJob.remove().catch((err) => {
        console.warn(`[retry] Não foi possível remover job de importação antigo de ${video.id}:`, err.message)
      })
    }

    await prisma.sourceVideo.update({
      where: { id: video.id },
      data: { status: 'IMPORTING', errorMessage: null, errorCode: null, technicalError: null },
    })
    await importQueue.add(
      'import-video',
      { sourceVideoId: video.id },
      { jobId: `import-${video.id}-retry-${Date.now()}` }
    )
    return NextResponse.json({ ok: true })
  }

  // Remove o job antigo (se ainda existir na fila, ex: em estado failed) para
  // não colidir com o jobId antigo — BullMQ ignora silenciosamente add() com
  // um jobId que já existe em estado terminal, então sem isso o retry nunca
  // reprocessaria.
  const oldJob = await videoQueue.getJob(`video-${video.id}`)
  if (oldJob) {
    await oldJob.remove().catch((err) => {
      console.warn(`[retry] Não foi possível remover job antigo de ${video.id}:`, err.message)
    })
  }

  // Cortes sugeridos são sempre regenerados do zero (vêm de uma análise
  // completa no final do pipeline). Segmentos de transcrição, porém, ficam —
  // o worker retoma a transcrição pulando os chunks já feitos em vez de
  // rebaixar tudo de novo (importante em lives longas com dezenas de partes).
  await prisma.suggestedClip.deleteMany({ where: { sourceVideoId: video.id } })

  await prisma.sourceVideo.update({
    where: { id: video.id },
    data: { status: 'EXTRACTING_AUDIO', errorMessage: null, errorCode: null, technicalError: null },
  })

  await videoQueue.add(
    'process-video',
    { sourceVideoId: video.id },
    { jobId: `video-${video.id}-retry-${Date.now()}` }
  )

  return NextResponse.json({ ok: true })
}
