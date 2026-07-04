import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import fs from 'fs'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { previewFacecamCrop } from '@/lib/ffmpeg'
import { getUploadDir } from '@/lib/utils'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const maxDuration = 30

const bodySchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0.005).max(1),
  height: z.number().min(0.005).max(1),
})

// POST /api/clips/:id/facecam-preview — "Testar recorte da facecam": mostra
// só o crop da região informada (num frame real do vídeo fonte) ANTES do
// usuário rodar o render inteiro — evita descobrir que a região está
// errada só depois de esperar todo o vídeo processar.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const clip = await prisma.suggestedClip.findFirst({
    where: { id: params.id, sourceVideo: { project: { userId } } },
    include: { sourceVideo: { select: { filePath: true } } },
  })
  if (!clip) return NextResponse.json({ error: 'Clipe não encontrado' }, { status: 404 })
  if (!clip.sourceVideo.filePath) return NextResponse.json({ error: 'Vídeo fonte não disponível' }, { status: 409 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Região da facecam inválida' }, { status: 400 })

  const tmpPath = path.join(getUploadDir(), '_facecam-preview', `${uuidv4()}.jpg`)
  try {
    // Meio do corte — mais chance de o rosto estar visível/em quadro do que o frame 0.
    const atSeconds = clip.startTime + (clip.endTime - clip.startTime) / 2
    await previewFacecamCrop(clip.sourceVideo.filePath, parsed.data, atSeconds, tmpPath)
    const buffer = fs.readFileSync(tmpPath)
    return NextResponse.json({ previewDataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Falha ao gerar o preview do recorte' }, { status: 500 })
  } finally {
    fs.rm(tmpPath, { force: true }, () => {})
  }
}
