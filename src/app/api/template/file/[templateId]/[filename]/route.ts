import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUploadDir } from '@/lib/utils'
import path from 'path'
import fs from 'fs'

export const runtime = 'nodejs'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
}

function isSafeSegment(id: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(id) && !id.includes('..')
}

export async function GET(_req: NextRequest, { params }: { params: { templateId: string; filename: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { templateId, filename } = params
  if (!isSafeSegment(templateId) || !isSafeSegment(filename)) {
    return NextResponse.json({ error: 'Caminho inválido' }, { status: 400 })
  }

  const filePath = path.join(getUploadDir(), 'templates', templateId, filename)
  const templatesRoot = path.join(getUploadDir(), 'templates')
  if (!filePath.startsWith(templatesRoot) || !fs.existsSync(filePath)) {
    return NextResponse.json({ error: 'Arquivo não encontrado' }, { status: 404 })
  }

  const ext = path.extname(filePath).toLowerCase()
  const contentType = MIME[ext] || 'application/octet-stream'
  const buffer = fs.readFileSync(filePath)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, max-age=0, no-cache',
    },
  })
}
