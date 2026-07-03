import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  insertMediaIntoBlueRectangle,
  insertMultipleMediaIntoRegions,
  detectBlueRegions,
  detectMediaType,
} from '@/lib/template-compositor'
import { cropVideoRegion, getVideoMetadata } from '@/lib/ffmpeg'
import { parseMultipart } from '@/lib/multipart'
import { getUploadDir } from '@/lib/utils'
import { prisma } from '@/lib/prisma'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

// Registra o resultado no banco (TemplateOutput) pra poder ser editado/
// legendado e agendado pro Instagram depois — antes só existia como arquivo
// solto em disco.
async function persistTemplateOutput(userId: string, outputPath: string, mediaType: 'image' | 'video') {
  const duration = mediaType === 'video' ? (await getVideoMetadata(outputPath)).duration : null
  const created = await prisma.templateOutput.create({
    data: {
      userId,
      filePath: outputPath,
      mediaType: mediaType === 'video' ? 'VIDEO' : 'IMAGE',
      duration,
    },
  })
  return created.id
}

export const runtime = 'nodejs'
export const maxDuration = 300

const SCRATCH_DIR = () => path.join(getUploadDir(), 'templates', '_tmp')
const TEMPLATES_DIR = () => path.join(getUploadDir(), 'templates')

function isSafeTemplateId(id: string): boolean {
  return /^[a-f0-9-]{36}$/i.test(id)
}

// Matches the media-{uuid}.{ext} naming used when a file is first staged
// (by this route or by /api/template/detect-facecam) — guards mediaId
// against path traversal when resolving it back to a file on disk.
function isSafeMediaId(id: string): boolean {
  return /^media-[a-f0-9-]+\.[a-zA-Z0-9]+$/i.test(id)
}

interface FacecamRegionInput {
  x: number
  y: number
  width: number
  height: number
}

function parseFacecamRegion(raw: string | undefined): FacecamRegionInput | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (
      typeof parsed.x === 'number' && typeof parsed.y === 'number' &&
      typeof parsed.width === 'number' && typeof parsed.height === 'number' &&
      parsed.width > 0 && parsed.height > 0
    ) {
      return parsed
    }
  } catch {
    // fall through to null
  }
  return null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  let fields: Record<string, string>
  let mediaTempPath: string | null = null
  let mediaFilename: string | null = null

  try {
    const parsed = await parseMultipart(req, SCRATCH_DIR())
    fields = parsed.fields
    const mediaFile = parsed.files.find((f) => f.fieldName === 'mediaFile')
    if (mediaFile) {
      mediaTempPath = mediaFile.tempPath
      mediaFilename = mediaFile.filename
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Falha ao ler o upload' }, { status: 400 })
  }

  // Modo "Manter original": pula o encaixe no template por completo — a
  // mídia enviada vira o resultado do jeito que está, mas ainda registrada
  // como TemplateOutput (mesmo fluxo de editar/legendar/agendar de depois).
  if (fields.original === 'true') {
    if (!mediaTempPath || !mediaFilename) {
      return NextResponse.json({ error: 'Envie uma foto ou vídeo' }, { status: 400 })
    }
    const originalId = uuidv4()
    const originalDir = path.join(TEMPLATES_DIR(), originalId)
    fs.mkdirSync(originalDir, { recursive: true })
    const mediaExt = path.extname(mediaFilename) || '.mp4'
    const outputPath = path.join(originalDir, `output-${uuidv4()}${mediaExt}`)
    fs.renameSync(mediaTempPath, outputPath)
    const mediaType = detectMediaType(outputPath)

    try {
      const templateOutputId = await persistTemplateOutput(userId, outputPath, mediaType)
      return NextResponse.json(
        {
          outputUrl: `/api/template/file/${originalId}/${path.basename(outputPath)}`,
          mediaType,
          region: null,
          templateOutputId,
        },
        { status: 201 }
      )
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Falha ao processar o arquivo' }, { status: 500 })
    }
  }

  const templateId = fields.templateId
  if (!templateId || !isSafeTemplateId(templateId)) {
    if (mediaTempPath) fs.rm(mediaTempPath, { force: true }, () => {})
    return NextResponse.json({ error: 'templateId inválido' }, { status: 400 })
  }

  const templateDir = path.join(TEMPLATES_DIR(), templateId)
  const existing = fs.existsSync(templateDir)
    ? fs.readdirSync(templateDir).find((f) => f.startsWith('template.'))
    : null
  if (!existing) {
    if (mediaTempPath) fs.rm(mediaTempPath, { force: true }, () => {})
    return NextResponse.json({ error: 'Template não encontrado. Faça a análise novamente.' }, { status: 404 })
  }
  const templatePath = path.join(templateDir, existing)

  // The media can arrive as a fresh upload (existing flow) OR by referencing
  // a file already staged in this template's dir via a prior call to
  // /api/template/detect-facecam (avoids re-uploading a large video twice).
  let mediaPath: string
  if (fields.mediaId) {
    if (!isSafeMediaId(fields.mediaId)) {
      if (mediaTempPath) fs.rm(mediaTempPath, { force: true }, () => {})
      return NextResponse.json({ error: 'mediaId inválido' }, { status: 400 })
    }
    const resolved = path.join(templateDir, fields.mediaId)
    if (!fs.existsSync(resolved)) {
      if (mediaTempPath) fs.rm(mediaTempPath, { force: true }, () => {})
      return NextResponse.json({ error: 'Mídia não encontrada — envie novamente' }, { status: 404 })
    }
    mediaPath = resolved
    if (mediaTempPath) fs.rm(mediaTempPath, { force: true }, () => {}) // shouldn't normally happen together, but don't leak a temp file
  } else {
    if (!mediaTempPath || !mediaFilename) {
      return NextResponse.json({ error: 'Envie uma foto ou vídeo' }, { status: 400 })
    }
    const mediaExt = path.extname(mediaFilename) || '.jpg'
    mediaPath = path.join(templateDir, `media-${uuidv4()}${mediaExt}`)
    fs.renameSync(mediaTempPath, mediaPath)
  }

  const mediaType = detectMediaType(mediaPath)
  const outputId = uuidv4()
  const outputExt = mediaType === 'video' ? '.mp4' : '.png'
  const outputPath = path.join(templateDir, `output-${outputId}${outputExt}`)

  const trimSeconds = fields.trimSeconds ? Number(fields.trimSeconds) : undefined
  const facecamRegion = parseFacecamRegion(fields.facecamRegion)

  // Auto-split mode: template has exactly 2 blue regions, the media is a
  // single video with an embedded facecam corner. Largest region gets the
  // full video, smallest gets a crop of the facecam corner.
  if (facecamRegion) {
    if (mediaType !== 'video') {
      return NextResponse.json({ error: 'facecamRegion só se aplica a vídeos' }, { status: 400 })
    }
    const { regions } = await detectBlueRegions(templatePath)
    if (regions.length !== 2) {
      return NextResponse.json(
        { error: `Este template tem ${regions.length} área(s) azul(is) — o modo facecam precisa de exatamente 2` },
        { status: 400 }
      )
    }

    const facecamCropPath = path.join(templateDir, `facecam-crop-${uuidv4()}.mp4`)
    try {
      await cropVideoRegion(mediaPath, facecamCropPath, facecamRegion)
      // regions[0] = largest (main), regions[1] = smallest (facecam) — detectBlueRegions sorts largest-first.
      const result = await insertMultipleMediaIntoRegions(
        templatePath,
        new Map([[0, mediaPath], [1, facecamCropPath]]),
        outputPath,
        { trimSeconds }
      )
      const templateOutputId = await persistTemplateOutput(userId, outputPath, result.mediaType)
      return NextResponse.json(
        {
          outputUrl: `/api/template/file/${templateId}/${path.basename(outputPath)}`,
          mediaType: result.mediaType,
          region: result.region,
          templateOutputId,
        },
        { status: 201 }
      )
    } catch (err: any) {
      return NextResponse.json({ error: err.message || 'Falha ao gerar a arte' }, { status: 500 })
    } finally {
      fs.rm(facecamCropPath, { force: true }, () => {})
    }
  }

  const regionIndexRaw = fields.regionIndex
  const regionIndex: number | 'all' | undefined =
    regionIndexRaw === 'all' ? 'all' : regionIndexRaw !== undefined && regionIndexRaw !== '' ? Number(regionIndexRaw) : undefined

  try {
    const result = await insertMediaIntoBlueRectangle(templatePath, mediaPath, outputPath, {
      regionIndex,
      trimSeconds,
    })
    const templateOutputId = await persistTemplateOutput(userId, outputPath, result.mediaType)
    return NextResponse.json(
      {
        outputUrl: `/api/template/file/${templateId}/${path.basename(outputPath)}`,
        mediaType: result.mediaType,
        region: result.region,
        templateOutputId,
      },
      { status: 201 }
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Falha ao gerar a arte' }, { status: 500 })
  }
}
