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
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastSplitLayoutConfig: true } })

  return NextResponse.json({
    templateOutput: {
      id: output.id,
      duration: output.duration,
      caption: output.caption,
      mediaType: output.mediaType,
    },
    editorState,
    lastSplitLayoutConfig: user?.lastSplitLayoutConfig ?? null,
  })
}

const fontFamilySchema = z.enum(['dejavu-sans', 'liberation-sans', 'liberation-serif', 'freemono']).optional()

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
  fontFamily: fontFamilySchema,
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
  fontFamily: fontFamilySchema,
})

const effectSchema = z.object({
  id: z.string(),
  type: z.enum(['colorFilter', 'zoomPan']),
  startTime: z.number(),
  endTime: z.number(),
  params: z.record(z.number()),
})

const splitLayoutRegionSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
})

const splitLayoutConfigSchema = z.object({
  facecamRegion: splitLayoutRegionSchema,
  facecamZoom: z.number().min(1).max(4),
  splitRatio: z.number().min(0.2).max(0.8),
  facecamConfirmed: z.boolean().optional(),
})

const videoTransformSchema = z.object({
  zoom: z.number().min(1).max(4),
  positionX: z.number().min(-1).max(1),
  positionY: z.number().min(-1).max(1),
})

const patchSchema = z.object({
  textOverlays: z.array(textOverlaySchema).optional(),
  captions: z.array(captionSegmentSchema).optional(),
  captionStyle: captionStyleSchema.optional(),
  effects: z.array(effectSchema).optional(),
  layoutMode: z.enum(['MAIN_TOP_FACECAM_BOTTOM', 'FACECAM_TOP_MAIN_BOTTOM']).nullable().optional(),
  layoutConfig: splitLayoutConfigSchema.optional(),
  transform: videoTransformSchema.optional(),
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

  if (parsed.data.layoutConfig) {
    await prisma.user
      .update({ where: { id: userId }, data: { lastSplitLayoutConfig: parsed.data.layoutConfig as any } })
      .catch(console.error)
  }

  return NextResponse.json({ editorState: nextState })
}
