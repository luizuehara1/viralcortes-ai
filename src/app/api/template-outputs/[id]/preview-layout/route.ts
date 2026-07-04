import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import fs from 'fs'
import { z } from 'zod'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { previewSplitLayoutFrame } from '@/lib/ffmpeg'
import { getUploadDir } from '@/lib/utils'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const maxDuration = 30

const regionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
})

const bodySchema = z.object({
  layoutMode: z.enum(['MAIN_TOP_FACECAM_BOTTOM', 'FACECAM_TOP_MAIN_BOTTOM']),
  layoutConfig: z.object({
    facecamRegion: regionSchema,
    facecamZoom: z.number().min(1).max(4),
    splitRatio: z.number().min(0.2).max(0.8),
    facecamConfirmed: z.boolean().optional(),
    mainRegion: regionSchema.optional(),
    mainZoom: z.number().min(1).max(4).optional(),
  }),
})

// Espelha src/app/api/clips/[id]/preview-layout/route.ts pro fluxo de
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
  if (!parsed.success) return NextResponse.json({ error: 'Configuração de layout inválida' }, { status: 400 })

  const tmpPath = path.join(getUploadDir(), '_layout-preview', `${uuidv4()}.jpg`)
  try {
    const atSeconds = (output.duration || 2) / 2
    await previewSplitLayoutFrame(
      output.filePath,
      parsed.data.layoutMode,
      parsed.data.layoutConfig,
      1080,
      1920,
      atSeconds,
      tmpPath
    )
    const buffer = fs.readFileSync(tmpPath)
    return NextResponse.json({ previewDataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Falha ao gerar o preview do layout' }, { status: 500 })
  } finally {
    fs.rm(tmpPath, { force: true }, () => {})
  }
}
