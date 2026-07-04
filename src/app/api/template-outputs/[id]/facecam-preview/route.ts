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

// Espelha src/app/api/clips/[id]/facecam-preview/route.ts pro fluxo de
// resultado de template.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const output = await prisma.templateOutput.findFirst({ where: { id: params.id, userId } })
  if (!output) return NextResponse.json({ error: 'Resultado do template não encontrado' }, { status: 404 })
  if (output.mediaType !== 'VIDEO') {
    return NextResponse.json({ error: 'Preview só está disponível para resultados em vídeo' }, { status: 409 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Região da facecam inválida' }, { status: 400 })

  const tmpPath = path.join(getUploadDir(), '_facecam-preview', `${uuidv4()}.jpg`)
  try {
    const atSeconds = (output.duration || 2) / 2
    await previewFacecamCrop(output.filePath, parsed.data, atSeconds, tmpPath)
    const buffer = fs.readFileSync(tmpPath)
    return NextResponse.json({ previewDataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Falha ao gerar o preview do recorte' }, { status: 500 })
  } finally {
    fs.rm(tmpPath, { force: true }, () => {})
  }
}
