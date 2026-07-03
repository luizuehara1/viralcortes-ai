import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enqueueVideoProcessing } from '@/lib/queue'
import { getUploadDir } from '@/lib/utils'
import path from 'path'
import fs from 'fs'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { v4 as uuidv4 } from 'uuid'
import Busboy from 'busboy'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_SIZE = Number(process.env.MAX_UPLOAD_SIZE) || 10 * 1024 * 1024 * 1024 // 10GB

interface ParsedUpload {
  tempPath: string
  filename: string
  fileSize: number
  fields: Record<string, string>
}

function parseMultipart(req: NextRequest, tempPath: string): Promise<ParsedUpload> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers.get('content-type') || ''
    const busboy = Busboy({
      headers: { 'content-type': contentType },
      limits: { fileSize: MAX_SIZE, files: 1 },
    })

    const fields: Record<string, string> = {}
    let filename = ''
    let fileSize = 0
    let fileSeen = false
    let sizeLimitHit = false
    let settled = false

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      busboy.destroy()
      fs.rm(tempPath, { force: true }, () => {})
      reject(err)
    }

    busboy.on('field', (name, value) => {
      fields[name] = value
    })

    busboy.on('file', (_name, fileStream, info) => {
      fileSeen = true
      filename = info.filename || 'video.mp4'
      const writeStream = fs.createWriteStream(tempPath)

      fileStream.on('data', (chunk: Buffer) => {
        fileSize += chunk.length
      })
      fileStream.on('limit', () => {
        sizeLimitHit = true
      })

      pipeline(fileStream, writeStream).catch((err) => {
        if (!sizeLimitHit) fail(err)
      })
    })

    busboy.on('close', () => {
      if (settled) return
      if (sizeLimitHit) {
        fail(new Error(`Arquivo excede o limite de ${Math.round(MAX_SIZE / 1024 / 1024 / 1024)}GB`))
        return
      }
      if (!fileSeen) {
        fail(new Error('Nenhum arquivo enviado'))
        return
      }
      settled = true
      resolve({ tempPath, filename, fileSize, fields })
    })

    busboy.on('error', (err: any) => fail(err instanceof Error ? err : new Error(String(err))))

    if (!req.body) {
      fail(new Error('Corpo da requisição vazio'))
      return
    }

    const nodeStream = Readable.fromWeb(req.body as any)
    nodeStream.on('error', fail)
    nodeStream.pipe(busboy)
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const contentLength = Number(req.headers.get('content-length') || 0)
  if (contentLength > MAX_SIZE) {
    return NextResponse.json({ error: 'Arquivo muito grande (máx 10GB)' }, { status: 413 })
  }

  const uploadDir = getUploadDir()
  fs.mkdirSync(uploadDir, { recursive: true })
  const tempPath = path.join(uploadDir, `tmp-${uuidv4()}`)

  let parsed: ParsedUpload
  try {
    parsed = await parseMultipart(req, tempPath)
  } catch (err: any) {
    const message = err?.message || 'Falha ao processar o upload'
    const status = /excede o limite/.test(message) ? 413 : 400
    return NextResponse.json({ error: message }, { status })
  }

  const { fields, tempPath: finishedTempPath, filename, fileSize } = parsed
  const projectId = fields.projectId
  const title = fields.title || filename.replace(/\.[^.]+$/, '') || 'Vídeo sem título'

  if (!projectId) {
    fs.rm(finishedTempPath, { force: true }, () => {})
    return NextResponse.json({ error: 'projectId é obrigatório' }, { status: 400 })
  }

  const userId = (session.user as any).id
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) {
    fs.rm(finishedTempPath, { force: true }, () => {})
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const sourceVideoId = uuidv4()
  const videoDir = path.join(uploadDir, sourceVideoId)
  fs.mkdirSync(videoDir, { recursive: true })

  const ext = path.extname(filename) || '.mp4'
  const filePath = path.join(videoDir, `source${ext}`)
  fs.renameSync(finishedTempPath, filePath)

  const sourceVideo = await prisma.sourceVideo.create({
    data: {
      id: sourceVideoId,
      projectId,
      title,
      filePath,
      fileSize: BigInt(fileSize),
      status: 'UPLOADING',
    },
  })

  await enqueueVideoProcessing(sourceVideoId)
  await prisma.sourceVideo.update({ where: { id: sourceVideoId }, data: { status: 'EXTRACTING_AUDIO' } })

  return NextResponse.json({ sourceVideoId: sourceVideo.id, status: 'QUEUED' }, { status: 201 })
}
