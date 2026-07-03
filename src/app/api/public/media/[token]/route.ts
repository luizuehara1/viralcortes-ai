import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import { Readable } from 'stream'
import { prisma } from '@/lib/prisma'
import { resolveScheduledPostFilePath } from '@/lib/scheduled-post-media'

export const runtime = 'nodejs'

function toWebStream(nodeStream: fs.ReadStream): ReadableStream {
  return Readable.toWeb(nodeStream) as unknown as ReadableStream
}

// Rota PÚBLICA (sem sessão, de propósito) — é o video_url que os servidores
// da Meta baixam ao criar o container de mídia do Reels
// (createReelsContainer em src/lib/instagram.ts). O único controle de acesso
// é o próprio token opaco do ScheduledPost (crypto.randomUUID(), impossível
// de adivinhar) — nunca aceita o id do clipe/template diretamente. O YouTube
// não usa essa rota — o upload é feito direto pro Google (ver
// src/workers/social-publisher.ts), não por busca de uma URL pública.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const post = await prisma.scheduledPost.findUnique({ where: { publicToken: params.token } })
  const filePath = post ? await resolveScheduledPostFilePath(post) : null
  if (!filePath || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Mídia não encontrada' }, { status: 404 })
  }

  const stat = fs.statSync(filePath)
  const fileSize = stat.size
  const range = req.headers.get('range')

  if (!range) {
    const stream = fs.createReadStream(filePath)
    return new NextResponse(toWebStream(stream), {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(fileSize),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=3600',
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

  const stream = fs.createReadStream(filePath, { start, end })
  return new NextResponse(toWebStream(stream), {
    status: 206,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(chunkSize),
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
