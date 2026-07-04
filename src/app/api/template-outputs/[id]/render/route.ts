import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import path from 'path'
import fs from 'fs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { renderClip } from '@/lib/ffmpeg'
import { getUploadDir } from '@/lib/utils'
import { CANVAS_PRESET_TO_CLIP_FORMAT, type EditorState } from '@/types'

export const runtime = 'nodejs'
export const maxDuration = 300

// POST /api/template-outputs/:id/render -> queima os overlays/legendas/
// efeitos do editorState no arquivo (renderClip com startTime=0, duration
// cheia). Formato de saída vem de editorState.canvas (seletor "Formato de
// saída" no editor) — ausente/nunca escolhido mantém o comportamento de
// sempre (ORIGINAL, já que o resultado do template normalmente já está no
// tamanho certo). Diferente do render de clipe, aqui não existem múltiplos
// formatos/RenderedClip: o próprio TemplateOutput.filePath é atualizado
// para a versão editada, síncrono (mesmo padrão de /api/template/generate).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const output = await prisma.templateOutput.findFirst({ where: { id: params.id, userId } })
  if (!output) return NextResponse.json({ error: 'Resultado do template não encontrado' }, { status: 404 })
  if (output.mediaType !== 'VIDEO') {
    return NextResponse.json({ error: 'Só é possível renderizar edições em resultados de vídeo' }, { status: 409 })
  }
  if (!fs.existsSync(output.filePath)) {
    return NextResponse.json({ error: 'Arquivo do resultado não encontrado no servidor' }, { status: 409 })
  }
  if (!output.duration) {
    return NextResponse.json({ error: 'Duração do resultado desconhecida — gere o resultado novamente' }, { status: 409 })
  }

  const editorState = output.editorState as EditorState | null
  const outputDir = path.join(getUploadDir(), 'templates', '_edited')
  fs.mkdirSync(outputDir, { recursive: true })
  const newPath = path.join(outputDir, `edited-${output.id}-${Date.now()}.mp4`)

  const format = editorState?.canvas ? CANVAS_PRESET_TO_CLIP_FORMAT[editorState.canvas.preset] : 'ORIGINAL'

  try {
    await renderClip({
      inputPath: output.filePath,
      outputPath: newPath,
      startTime: 0,
      duration: output.duration,
      format,
      fitMode: format === 'ORIGINAL' ? undefined : 'CONTAIN',
      exportMode: 'clean',
      editorOverlays: editorState?.textOverlays,
      editorCaptions: editorState?.captions,
      editorCaptionStyle: editorState?.captionStyle,
      editorEffects: editorState?.effects,
      layoutMode: editorState?.layoutMode ?? undefined,
      layoutConfig: editorState?.layoutConfig,
      transform: editorState?.transform,
      layers: editorState?.layers,
    })

    const oldPath = output.filePath
    await prisma.templateOutput.update({ where: { id: output.id }, data: { filePath: newPath } })
    fs.rm(oldPath, { force: true }, () => {})

    return NextResponse.json({ ok: true, outputUrl: `/api/template-outputs/${output.id}/stream` })
  } catch (err: any) {
    console.error('[template-outputs/render] Falha ao renderizar edições:', err)
    fs.rm(newPath, { force: true }, () => {})
    return NextResponse.json({ error: err.message || 'Falha ao renderizar as edições' }, { status: 500 })
  }
}
