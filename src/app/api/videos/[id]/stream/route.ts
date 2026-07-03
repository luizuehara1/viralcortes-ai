import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import fs from 'fs'
import { Readable } from 'stream'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

// Next.js precisa de um Web ReadableStream no body da Response — Readable.toWeb
// converte o stream Node do fs sem carregar o arquivo inteiro na memória
// (diferencial importante aqui: os vídeos fonte podem ser lives de horas).
function toWebStream(nodeStream: fs.ReadStream): ReadableStream {
  return Readable.toWeb(nodeStream) as unknown as ReadableStream
}

// Serve o vídeo fonte (a live/upload original) com suporte a Range requests —
// necessário para o <video> do editor conseguir arrastar na timeline sem
// baixar o arquivo inteiro primeiro. O editor toca só a janela
// [clip.startTime, clip.endTime] desse arquivo (ver ClipEditor no client),
// nunca precisamos gerar um arquivo de preview separado.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id
  const video = await prisma.sourceVideo.findFirst({
    where: { id: params.id, project: { userId } },
    select: { filePath: true },
  })

  if (!video?.filePath || !fs.existsSync(video.filePath)) {
    return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 })
  }

  const stat = fs.statSync(video.filePath)
  const fileSize = stat.size
  const range = req.headers.get('range')

  if (!range) {
    // Sem Range: devolve o arquivo inteiro (players que não pedem range).
    const stream = fs.createReadStream(video.filePath)
    return new NextResponse(toWebStream(stream), {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=0, no-cache',
      },
    })
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range)
  const start = match?.[1] ? parseInt(match[1], 10) : 0
  const end = match?.[2] ? parseInt(match[2], 10) : fileSize - 1
  const chunkSize = end - start + 1

  if (start >= fileSize || end >= fileSize || start > end) {
    return new NextResponse(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileSize}` },
    })
  }

  const stream = fs.createReadStream(video.filePath, { start, end })

  return new NextResponse(toWebStream(stream), {
    status: 206,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(chunkSize),
      'Cache-Control': 'private, max-age=0, no-cache',
    },
  })
}
