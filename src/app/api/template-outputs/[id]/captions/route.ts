import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import path from 'path'
import fs from 'fs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractAudioMp3 } from '@/lib/ffmpeg'
import { transcribeAudioWithWords } from '@/lib/transcription'
import { getClipsDir } from '@/lib/utils'
import { mergeEditorState } from '@/lib/editor-state'
import type { CaptionSegment } from '@/types'

// POST /api/template-outputs/:id/captions -> gera legendas automáticas
// (palavra a palavra) via Whisper para o TemplateOutput inteiro — diferente
// de um clipe, aqui não há startTime/endTime (o resultado do template já É
// o arquivo inteiro), então extrai o áudio do arquivo completo em vez de um
// recorte. Espelha src/app/api/clips/[id]/captions/route.ts.
const WORDS_PER_SEGMENT = 6
const CAPTION_TIMEOUT_MS = 3 * 60 * 1000

function groupWordsIntoSegments(words: { word: string; start: number; end: number }[]): CaptionSegment[] {
  const segments: CaptionSegment[] = []
  for (let i = 0; i < words.length; i += WORDS_PER_SEGMENT) {
    const chunk = words.slice(i, i + WORDS_PER_SEGMENT)
    segments.push({ id: `seg-${i}`, words: chunk })
  }
  return segments
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const output = await prisma.templateOutput.findFirst({ where: { id: params.id, userId } })
  if (!output) return NextResponse.json({ error: 'Resultado do template não encontrado' }, { status: 404 })
  if (output.mediaType !== 'VIDEO') {
    return NextResponse.json({ error: 'Legendas automáticas só se aplicam a resultados em vídeo' }, { status: 409 })
  }
  if (!fs.existsSync(output.filePath)) {
    return NextResponse.json({ error: 'Arquivo do resultado não encontrado no servidor' }, { status: 409 })
  }

  const outputDir = path.join(getClipsDir(), 'template-outputs', output.id)
  fs.mkdirSync(outputDir, { recursive: true })
  const audioPath = path.join(outputDir, 'caption_audio.mp3')

  try {
    await extractAudioMp3(output.filePath, audioPath, CAPTION_TIMEOUT_MS)
    const transcription = await transcribeAudioWithWords(audioPath, CAPTION_TIMEOUT_MS)

    const captions = groupWordsIntoSegments(transcription.words)
    const nextState = mergeEditorState(output.editorState, {
      captions,
      captionsGeneratedAt: new Date().toISOString(),
    })

    await prisma.templateOutput.update({
      where: { id: output.id },
      data: { editorState: nextState as any },
    })

    return NextResponse.json({ editorState: nextState })
  } catch (err: any) {
    console.error('[template-outputs/captions] Falha ao gerar legendas automáticas:', err)
    return NextResponse.json({ error: err.message || 'Falha ao gerar legendas' }, { status: 500 })
  } finally {
    fs.rm(audioPath, { force: true }, () => {})
  }
}
