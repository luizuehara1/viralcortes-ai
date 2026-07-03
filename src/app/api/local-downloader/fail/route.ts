import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { authorizeLocalDownloader } from '@/lib/local-downloader-auth'

export const runtime = 'nodejs'

// POST /api/local-downloader/fail — o script local tentou baixar e também
// não conseguiu (ex.: sessão do navegador expirou, vídeo foi removido) —
// evita deixar o vídeo travado pra sempre em AWAITING_LOCAL_DOWNLOAD.
export async function POST(req: NextRequest) {
  const unauthorized = authorizeLocalDownloader(req)
  if (unauthorized) return unauthorized

  const body = await req.json().catch(() => null)
  const sourceVideoId = body?.sourceVideoId
  const error = typeof body?.error === 'string' ? body.error : 'Falha ao baixar pelo downloader local'
  if (!sourceVideoId) return NextResponse.json({ error: 'sourceVideoId é obrigatório' }, { status: 400 })

  const video = await prisma.sourceVideo.findUnique({ where: { id: sourceVideoId } })
  if (!video || video.status !== 'AWAITING_LOCAL_DOWNLOAD') {
    return NextResponse.json({ error: 'Vídeo não encontrado ou não está aguardando download local' }, { status: 409 })
  }

  await prisma.sourceVideo.update({
    where: { id: sourceVideoId },
    data: { status: 'FAILED', errorMessage: error, errorCode: null },
  })

  return NextResponse.json({ ok: true })
}
