import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import type { EditorState } from '@/types'
import { mergeEditorState, withDefaultVideoLayer } from '@/lib/editor-state'

// GET  /api/clips/:id/editor  -> dados pro editor abrir (clipe + estado salvo)
// PATCH /api/clips/:id/editor -> autosave do estado do editor (merge parcial)

async function loadOwnedClip(clipId: string, userId: string) {
  return prisma.suggestedClip.findFirst({
    where: { id: clipId, sourceVideo: { project: { userId } } },
    include: { sourceVideo: { select: { id: true, filePath: true, duration: true } } },
  })
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const clip = await loadOwnedClip(params.id, userId)
  if (!clip) return NextResponse.json({ error: 'Clipe não encontrado' }, { status: 404 })
  if (!clip.sourceVideo.filePath) {
    return NextResponse.json({ error: 'Vídeo fonte não disponível para preview' }, { status: 409 })
  }

  const editorState = withDefaultVideoLayer(mergeEditorState(clip.editorState, {}), clip.endTime - clip.startTime)

  // Último ajuste de layout split-screen do usuário — pré-preenche o painel
  // "Layout" quando esse clipe específico ainda não tem um layoutConfig
  // próprio, em vez de sempre partir do zero.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastSplitLayoutConfig: true } })

  return NextResponse.json({
    clip: {
      id: clip.id,
      title: clip.title,
      startTime: clip.startTime,
      endTime: clip.endTime,
      caption: clip.caption,
      status: clip.status,
    },
    sourceVideoId: clip.sourceVideo.id,
    sourceVideoDuration: clip.sourceVideo.duration,
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

const layerTransformSchema = z.object({
  x: z.number().min(-1).max(1),
  y: z.number().min(-1).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
  // Schema permissivo (pensando em futuras camadas com caixa de verdade) —
  // o render trava a camada VIDEO especificamente em [1,4] (ver ffmpeg.ts).
  scale: z.number().min(0.3).max(4),
  rotation: z.number().min(-180).max(180),
  opacity: z.number().min(0).max(1),
  cropX: z.number().min(0).max(1),
  cropY: z.number().min(0).max(1),
  cropWidth: z.number().min(0).max(1),
  cropHeight: z.number().min(0).max(1),
})

const editorLayerSchema = z.object({
  id: z.string(),
  type: z.enum(['VIDEO', 'FACECAM', 'TEXT', 'CAPTION', 'IMAGE', 'EFFECT']),
  name: z.string(),
  visible: z.boolean(),
  locked: z.boolean(),
  startTime: z.number(),
  endTime: z.number(),
  zIndex: z.number(),
  transform: layerTransformSchema,
})

const patchSchema = z.object({
  textOverlays: z.array(textOverlaySchema).optional(),
  captions: z.array(captionSegmentSchema).optional(),
  captionStyle: captionStyleSchema.optional(),
  effects: z.array(effectSchema).optional(),
  layoutMode: z.enum(['MAIN_TOP_FACECAM_BOTTOM', 'FACECAM_TOP_MAIN_BOTTOM']).nullable().optional(),
  layoutConfig: splitLayoutConfigSchema.optional(),
  transform: videoTransformSchema.optional(),
  layers: z.array(editorLayerSchema).optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const clip = await loadOwnedClip(params.id, userId)
  if (!clip) return NextResponse.json({ error: 'Clipe não encontrado' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Estado do editor inválido', details: parsed.error.flatten() }, { status: 400 })
  }

  const nextState = mergeEditorState(clip.editorState, parsed.data as Partial<EditorState>)

  await prisma.suggestedClip.update({
    where: { id: params.id },
    data: { editorState: nextState as any },
  })

  // Lembra o ajuste de layout como "último usado" do usuário — pré-preenche
  // o painel na próxima vez que ele abrir um clipe sem layoutConfig próprio.
  if (parsed.data.layoutConfig) {
    await prisma.user
      .update({ where: { id: userId }, data: { lastSplitLayoutConfig: parsed.data.layoutConfig as any } })
      .catch(console.error)
  }

  return NextResponse.json({ editorState: nextState })
}
