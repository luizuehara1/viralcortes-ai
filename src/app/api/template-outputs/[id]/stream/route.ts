import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import fs from 'fs'
import { Readable } from 'stream'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

function toWebStream(nodeStream: fs.ReadStream): ReadableStream {
  return Readable.toWeb(nodeStream) as unknown as ReadableStream
}

// Serve o arquivo de um TemplateOutput (vídeo) pro editor conseguir tocar/
// arrastar na timeline, com suporte a Range — mesmo padrão de
// src/app/api/videos/[id]/stream/route.ts.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id
  const output = await prisma.templateOutput.findFirst({
    where: { id: params.id, userId },
    select: { filePath: true, mediaType: true },
  })

  if (!output || !fs.existsSync(output.filePath)) {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }

  const contentType = output.mediaType === 'VIDEO' ? 'video/mp4' : 'image/png'
  const stat = fs.statSync(output.filePath)
  const fileSize = stat.size
  const range = req.headers.get('range')

  if (!range) {
    const stream = fs.createReadStream(output.filePath)
    return new NextResponse(toWebStream(stream), {
      headers: {
        'Content-Type': contentType,
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

  const stream = fs.createReadStream(output.filePath, { start, end })
  return new NextResponse(toWebStream(stream), {
    status: 206,
    headers: {
      'Content-Type': contentType,
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(chunkSize),
      'Cache-Control': 'private, max-age=0, no-cache',
    },
  })
}
