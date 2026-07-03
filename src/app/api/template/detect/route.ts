import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { detectBlueRegions } from '@/lib/template-compositor'
import { parseMultipart } from '@/lib/multipart'
import { getUploadDir } from '@/lib/utils'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'

const SCRATCH_DIR = () => path.join(getUploadDir(), 'templates', '_tmp')
const TEMPLATES_DIR = () => path.join(getUploadDir(), 'templates')

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  let uploadedTempPath: string | null = null
  let uploadedFilename: string | null = null

  try {
    const { files } = await parseMultipart(req, SCRATCH_DIR())
    const uploaded = files.find((f) => f.fieldName === 'templateFile')
    if (uploaded) {
      uploadedTempPath = uploaded.tempPath
      uploadedFilename = uploaded.filename
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Falha ao ler o template enviado' }, { status: 400 })
  }

  const templateId = uuidv4()
  const templateDir = path.join(TEMPLATES_DIR(), templateId)
  fs.mkdirSync(templateDir, { recursive: true })

  const ext = uploadedFilename ? path.extname(uploadedFilename) || '.png' : '.png'
  const templatePath = path.join(templateDir, `template${ext}`)

  if (uploadedTempPath) {
    fs.renameSync(uploadedTempPath, templatePath)
  } else {
    const defaultPath = path.join(process.cwd(), 'public', 'templates', 'template-demo.png')
    fs.copyFileSync(defaultPath, templatePath)
  }

  try {
    const { regions, width, height } = await detectBlueRegions(templatePath)
    if (regions.length === 0) {
      fs.rmSync(templateDir, { recursive: true, force: true })
      return NextResponse.json({ error: 'Nenhuma área azul foi encontrada nesse template' }, { status: 422 })
    }
    return NextResponse.json({
      templateId,
      width,
      height,
      regions: regions.map((r, i) => ({ index: i, ...r })),
      previewUrl: `/api/template/file/${templateId}/${path.basename(templatePath)}`,
    })
  } catch (err: any) {
    fs.rmSync(templateDir, { recursive: true, force: true })
    return NextResponse.json({ error: err.message || 'Falha ao analisar o template' }, { status: 500 })
  }
}
