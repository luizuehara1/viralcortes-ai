import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'
import { authOptions } from '@/lib/auth'
import { parseMultipart } from '@/lib/multipart'
import { getUploadDir } from '@/lib/utils'
import { detectMediaType } from '@/lib/template-compositor'
import { persistTemplateOutput } from '@/lib/template-output'

// Upload direto de um vídeo pro editor, sem passar pelo pipeline de IA
// (extração de áudio, transcrição, sugestão de cortes) nem pelo encaixe do
// Template Studio — o usuário quer só abrir o editor com o vídeo dele e
// montar do zero (camadas, zoom, texto, legendas, efeitos). Reaproveita o
// mesmo model TemplateOutput/editor que já existe (ver
// /api/template/generate com `original=true`), só sem exigir a tela do
// Template Studio no meio.
export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_SIZE = Number(process.env.MAX_UPLOAD_SIZE) || 10 * 1024 * 1024 * 1024
const ALLOWED_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.mkv'])
const SCRATCH_DIR = () => path.join(getUploadDir(), 'templates', '_tmp')
const TEMPLATES_DIR = () => path.join(getUploadDir(), 'templates')

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande (máx 10GB)' }, { status: 413 })
  }

  let tempPath: string | null = null
  let filename: string | null = null
  try {
    const parsed = await parseMultipart(req, SCRATCH_DIR(), { maxFileSize: MAX_SIZE })
    const file = parsed.files.find((f) => f.fieldName === 'file')
    if (file) {
      tempPath = file.tempPath
      filename = file.filename
    }
  } catch (err: any) {
    const status = /excede o (tamanho|limite)/.test(err.message || '') ? 413 : 400
    return NextResponse.json({ error: err.message || 'Falha ao ler o upload' }, { status })
  }

  if (!tempPath || !filename) {
    return NextResponse.json({ error: 'Envie um arquivo de vídeo' }, { status: 400 })
  }

  const ext = path.extname(filename).toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    fs.rm(tempPath, { force: true }, () => {})
    return NextResponse.json(
      { error: 'Formato não suportado — envie um vídeo MP4, MOV, WEBM ou MKV' },
      { status: 400 }
    )
  }

  const uploadId = uuidv4()
  const outputDir = path.join(TEMPLATES_DIR(), uploadId)
  fs.mkdirSync(outputDir, { recursive: true })
  const outputPath = path.join(outputDir, `output-${uuidv4()}${ext}`)
  fs.renameSync(tempPath, outputPath)

  if (detectMediaType(outputPath) !== 'video') {
    fs.rm(outputPath, { force: true }, () => {})
    return NextResponse.json({ error: 'O arquivo enviado não é um vídeo válido' }, { status: 400 })
  }

  console.log('[editor/upload] Vídeo recebido', { userId, filename, ext })

  let templateOutputId: string
  try {
    templateOutputId = await persistTemplateOutput(userId, outputPath, 'video')
  } catch (err: any) {
    console.error('[editor/upload] Falha ao ler metadados do vídeo', err instanceof Error ? err.message : err)
    fs.rm(outputPath, { force: true }, () => {})
    return NextResponse.json(
      { error: 'Não foi possível ler este vídeo — verifique se o arquivo não está corrompido.' },
      { status: 422 }
    )
  }

  console.log('[editor/upload] TemplateOutput criado', { userId, templateOutputId })

  return NextResponse.json(
    { templateOutputId, redirectTo: `/template-outputs/${templateOutputId}/editor` },
    { status: 201 }
  )
}
