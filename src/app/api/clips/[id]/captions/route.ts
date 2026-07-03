import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import path from 'path'
import fs from 'fs'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { extractAudioRangeMp3 } from '@/lib/ffmpeg'
import { transcribeAudioWithWords } from '@/lib/transcription'
import { getClipsDir } from '@/lib/utils'
import { mergeEditorState } from '@/lib/editor-state'
import type { CaptionSegment } from '@/types'

// POST /api/clips/:id/captions -> gera legendas automáticas (palavra a
// palavra) para o trecho do clipe, via Whisper, e já salva no editorState.
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

  const clip = await prisma.suggestedClip.findFirst({
    where: { id: params.id, sourceVideo: { project: { userId } } },
    include: { sourceVideo: { select: { filePath: true } } },
  })
  if (!clip) return NextResponse.json({ error: 'Clipe não encontrado' }, { status: 404 })
  if (!clip.sourceVideo.filePath) {
    return NextResponse.json({ error: 'Vídeo fonte não encontrado no servidor' }, { status: 409 })
  }

  const duration = clip.endTime - clip.startTime
  const clipDir = path.join(getClipsDir(), clip.id)
  fs.mkdirSync(clipDir, { recursive: true })
  const audioPath = path.join(clipDir, 'caption_audio.mp3')

  try {
    await extractAudioRangeMp3(clip.sourceVideo.filePath, audioPath, clip.startTime, duration, CAPTION_TIMEOUT_MS)
    const transcription = await transcribeAudioWithWords(audioPath, CAPTION_TIMEOUT_MS)

    const captions = groupWordsIntoSegments(transcription.words)
    const nextState = mergeEditorState(clip.editorState, {
      captions,
      captionsGeneratedAt: new Date().toISOString(),
    })

    await prisma.suggestedClip.update({
      where: { id: clip.id },
      data: { editorState: nextState as any },
    })

    return NextResponse.json({ editorState: nextState })
  } catch (err: any) {
    console.error('[captions] Falha ao gerar legendas automáticas:', err)
    return NextResponse.json({ error: err.message || 'Falha ao gerar legendas' }, { status: 500 })
  } finally {
    fs.rm(audioPath, { force: true }, () => {})
  }
}
