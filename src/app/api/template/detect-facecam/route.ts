import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { detectFacecamRegion } from '@/lib/facecam-detector'
import { parseMultipart } from '@/lib/multipart'
import { getUploadDir } from '@/lib/utils'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'
export const maxDuration = 120

const SCRATCH_DIR = () => path.join(getUploadDir(), 'templates', '_tmp')
const TEMPLATES_DIR = () => path.join(getUploadDir(), 'templates')

function isSafeTemplateId(id: string): boolean {
  return /^[a-f0-9-]{36}$/i.test(id)
}

// Persists the uploaded video into the template's own dir (so /api/template/generate
// can reference it by mediaId afterwards without a second upload) and runs
// best-effort automatic facecam detection on it.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

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

  const templateId = fields.templateId
  if (!templateId || !isSafeTemplateId(templateId)) {
    if (mediaTempPath) fs.rm(mediaTempPath, { force: true }, () => {})
    return NextResponse.json({ error: 'templateId inválido' }, { status: 400 })
  }

  const templateDir = path.join(TEMPLATES_DIR(), templateId)
  if (!fs.existsSync(templateDir)) {
    if (mediaTempPath) fs.rm(mediaTempPath, { force: true }, () => {})
    return NextResponse.json({ error: 'Template não encontrado. Faça a análise novamente.' }, { status: 404 })
  }

  if (!mediaTempPath || !mediaFilename) {
    return NextResponse.json({ error: 'Envie um vídeo' }, { status: 400 })
  }

  const mediaExt = path.extname(mediaFilename) || '.mp4'
  const mediaId = `media-${uuidv4()}${mediaExt}`
  const mediaPath = path.join(templateDir, mediaId)
  fs.renameSync(mediaTempPath, mediaPath)

  try {
    const detection = await detectFacecamRegion(mediaPath)
    return NextResponse.json({ mediaId, ...detection })
  } catch {
    // Detection failing is not fatal to the flow — the media is already
    // saved, the client just falls back to manual facecam coordinates.
    return NextResponse.json({ mediaId, detected: false, confidence: 0 })
  }
}
