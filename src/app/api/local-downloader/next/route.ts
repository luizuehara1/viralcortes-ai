import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeLocalDownloader } from '@/lib/local-downloader-auth'

export const runtime = 'nodejs'

// GET /api/local-downloader/next — chamado pelo script que roda no PC do
// dono (com o navegador logado nas plataformas que bloqueiam o yt-dlp do
// servidor). Devolve o próximo vídeo esperando download manual, ou null
// se não tiver nenhum na fila.
export async function GET(req: NextRequest) {
  const unauthorized = authorizeLocalDownloader(req)
  if (unauthorized) return unauthorized

  const video = await prisma.sourceVideo.findFirst({
    where: { status: 'AWAITING_LOCAL_DOWNLOAD' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, sourceUrl: true, sourcePlatform: true, title: true },
  })

  if (!video) return NextResponse.json({ job: null })

  return NextResponse.json({
    job: {
      sourceVideoId: video.id,
      sourceUrl: video.sourceUrl,
      platform: video.sourcePlatform,
      title: video.title,
    },
  })
}
