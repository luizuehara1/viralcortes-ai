import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { prisma } from '@/lib/prisma'
import { enqueueVideoProcessing } from '@/lib/queue'
import { getUploadDir } from '@/lib/utils'
import { parseMultipart } from '@/lib/multipart'
import { authorizeLocalDownloader } from '@/lib/local-downloader-auth'

export const runtime = 'nodejs'
export const maxDuration = 300

const SCRATCH_DIR = () => path.join(getUploadDir(), '_local-downloader-tmp')

// POST /api/local-downloader/complete — o script local baixou o vídeo
// (usando cookies do navegador logado) e envia o arquivo pronto de volta.
// Assume o mesmo lugar na esteira que um download automático bem-sucedido
// teria assumido: salva em uploads/{id}/source.ext e enfileira o
// processamento normal (áudio, transcrição, IA).
export async function POST(req: NextRequest) {
  const unauthorized = authorizeLocalDownloader(req)
  if (unauthorized) return unauthorized

  let sourceVideoId: string | undefined
  let tempPath: string | undefined
  let filename: string | undefined

  try {
    const { fields, files } = await parseMultipart(req, SCRATCH_DIR())
    sourceVideoId = fields.sourceVideoId
    const file = files.find((f) => f.fieldName === 'file')
    if (file) {
      tempPath = file.tempPath
      filename = file.filename
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Falha ao ler o upload' }, { status: 400 })
  }

  if (!sourceVideoId) {
    if (tempPath) fs.rm(tempPath, { force: true }, () => {})
    return NextResponse.json({ error: 'sourceVideoId é obrigatório' }, { status: 400 })
  }
  if (!tempPath || !filename) {
    return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
  }

  const video = await prisma.sourceVideo.findUnique({ where: { id: sourceVideoId } })
  if (!video || video.status !== 'AWAITING_LOCAL_DOWNLOAD') {
    fs.rm(tempPath, { force: true }, () => {})
    return NextResponse.json({ error: 'Vídeo não encontrado ou não está aguardando download local' }, { status: 409 })
  }

  const videoDir = path.join(getUploadDir(), sourceVideoId)
  fs.mkdirSync(videoDir, { recursive: true })
  const ext = path.extname(filename) || '.mp4'
  const filePath = path.join(videoDir, `source${ext}`)
  fs.renameSync(tempPath, filePath)

  const stats = fs.statSync(filePath)
  await prisma.sourceVideo.update({
    where: { id: sourceVideoId },
    data: { filePath, fileSize: BigInt(stats.size), status: 'EXTRACTING_AUDIO', errorMessage: null, errorCode: null, technicalError: null },
  })

  await enqueueVideoProcessing(sourceVideoId)

  return NextResponse.json({ ok: true })
}
