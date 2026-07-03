import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { EditorState } from '@/types'
import { mergeEditorState } from '@/lib/editor-state'

// GET  /api/template-outputs/:id/editor  -> dados pro editor abrir
// PATCH /api/template-outputs/:id/editor -> autosave do estado do editor
// Espelha src/app/api/clips/[id]/editor/route.ts, mas o dono é direto
// (TemplateOutput.userId), sem cadeia de projeto/vídeo fonte no meio.

async function loadOwnedOutput(id: string, userId: string) {
  return prisma.templateOutput.findFirst({ where: { id, userId } })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const output = await loadOwnedOutput(params.id, userId)
  if (!output) return NextResponse.json({ error: 'Resultado do template não encontrado' }, { status: 404 })
  if (output.mediaType !== 'VIDEO') {
    return NextResponse.json({ error: 'Edição/legendas só estão disponíveis para resultados em vídeo' }, { status: 409 })
  }

  const editorState = mergeEditorState(output.editorState, {})

  return NextResponse.json({
    templateOutput: {
      id: output.id,
      duration: output.duration,
      caption: output.caption,
      mediaType: output.mediaType,
    },
    editorState,
  })
}

const textOverlaySchema = z.object({
  id: z.string(),
  text: z.string(),
  startTime: z.number(),
  endTime: z.number(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  fontSize: z.number().positive(),
  color: z.string(),
  strokeColor: z.string(),
  animation: z.enum(['none', 'fade', 'pop', 'slide']),
})

const captionWordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
})

const captionSegmentSchema = z.object({
  id: z.string(),
  words: z.array(captionWordSchema),
  editedText: z.string().optional(),
})

const captionStyleSchema = z.object({
  fontSize: z.number().positive(),
  color: z.string(),
  highlightColor: z.string(),
  strokeColor: z.string(),
  position: z.enum(['top', 'center', 'bottom']),
})

const effectSchema = z.object({
  id: z.string(),
  type: z.enum(['colorFilter', 'zoomPan']),
  startTime: z.number(),
  endTime: z.number(),
  params: z.record(z.number()),
})

const patchSchema = z.object({
  textOverlays: z.array(textOverlaySchema).optional(),
  captions: z.array(captionSegmentSchema).optional(),
  captionStyle: captionStyleSchema.optional(),
  effects: z.array(effectSchema).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const output = await loadOwnedOutput(params.id, userId)
  if (!output) return NextResponse.json({ error: 'Resultado do template não encontrado' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Estado do editor inválido', details: parsed.error.flatten() }, { status: 400 })
  }

  const nextState = mergeEditorState(output.editorState, parsed.data as Partial<EditorState>)

  await prisma.templateOutput.update({
    where: { id: params.id },
    data: { editorState: nextState as any },
  })

  return NextResponse.json({ editorState: nextState })
}
