import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { detectFacecamRegion } from '@/lib/facecam-detector'

export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/clips/:id/detect-facecam — detecta automaticamente a região da
// facecam no vídeo fonte já existente em disco (sem upload — diferente da
// rota equivalente do Template Studio, que recebe o arquivo por multipart).
// Usado pelo painel "Layout" do editor pro botão "Detectar automaticamente".
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const clip = await prisma.suggestedClip.findFirst({
    where: { id: params.id, sourceVideo: { project: { userId } } },
    include: { sourceVideo: { select: { filePath: true } } },
  })
  if (!clip) return NextResponse.json({ error: 'Clipe não encontrado' }, { status: 404 })
  if (!clip.sourceVideo.filePath) {
    return NextResponse.json({ error: 'Vídeo fonte não disponível' }, { status: 409 })
  }

  const result = await detectFacecamRegion(clip.sourceVideo.filePath)
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
