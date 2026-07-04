import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { detectFacecamRegion } from '@/lib/facecam-detector'

export const runtime = 'nodejs'
export const maxDuration = 60

// Espelha src/app/api/clips/[id]/detect-facecam/route.ts, mas pro fluxo de
// resultado de template (dono é direto, TemplateOutput.userId).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const output = await prisma.templateOutput.findFirst({ where: { id: params.id, userId } })
  if (!output) return NextResponse.json({ error: 'Resultado do template não encontrado' }, { status: 404 })
  if (output.mediaType !== 'VIDEO') {
    return NextResponse.json({ error: 'Detecção só está disponível para resultados em vídeo' }, { status: 409 })
  }

  const result = await detectFacecamRegion(output.filePath)
  if (!result.detected || !result.region) {
    return NextResponse.json({ detected: false, confidence: result.confidence })
  }

  return NextResponse.json({
    detected: true,
    confidence: result.confidence,
    region: {
      x: result.region.x / result.videoWidth,
      y: result.region.y / result.videoHeight,
      width: result.region.width / result.videoWidth,
      height: result.region.height / result.videoHeight,
    },
  })
}
