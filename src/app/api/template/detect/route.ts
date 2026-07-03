import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { detectBlueRegions } from '@/lib/template-compositor'
import { parseMultipart } from '@/lib/multipart'
import { getUploadDir } from '@/lib/utils'
import path from 'path'
import fs from 'fs'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'

const SCRATCH_DIR = () => path.join(getUploadDir(), 'templates', '_tmp')
const TEMPLATES_DIR = () => path.join(getUploadDir(), 'templates')

// Acha o arquivo "template.*" dentro da pasta de um templateId já existente
// (extensão varia — png/jpg/webp — por isso não dá pra montar o path direto).
function findExistingTemplateFile(templateId: string): string | null {
  const dir = path.join(TEMPLATES_DIR(), templateId)
  if (!fs.existsSync(dir)) return null
  const match = fs.readdirSync(dir).find((f) => f.startsWith('template.'))
  return match ? path.join(dir, match) : null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const userId = (session.user as any).id

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

  // Sem upload novo: tenta reaproveitar o último template usado (mesma
  // pasta/templateId — evita reenviar o mesmo arquivo toda vez que abre o
  // Template Studio) em vez de sempre cair no template de exemplo.
  if (!uploadedTempPath) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { lastTemplateId: true } })
    const existingPath = user?.lastTemplateId ? findExistingTemplateFile(user.lastTemplateId) : null
    if (existingPath && user?.lastTemplateId) {
      try {
        const { regions, width, height } = await detectBlueRegions(existingPath)
        if (regions.length > 0) {
          return NextResponse.json({
            templateId: user.lastTemplateId,
            width,
            height,
            regions: regions.map((r, i) => ({ index: i, ...r })),
            previewUrl: `/api/template/file/${user.lastTemplateId}/${path.basename(existingPath)}`,
            reused: true,
          })
        }
      } catch {
        // Arquivo corrompido/ilegível — cai pro fallback abaixo em vez de travar.
      }
    }
  }

  const templateId = uuidv4()
  const templateDir = path.join(TEMPLATES_DIR(), templateId)
  fs.mkdirSync(templateDir, { recursive: true })

  const ext = uploadedFilename ? path.extname(uploadedFilename) || '.png' : '.png'
  const templatePath = path.join(templateDir, `template${ext}`)

  if (uploadedTempPath) {
    fs.renameSync(uploadedTempPath, templatePath)
  } else {
    // Nem upload novo, nem template anterior salvo (ou ele sumiu do disco) —
    // cai no template de exemplo, que também passa a ser "lembrado" daqui
    // pra frente (evita criar uma pasta nova a cada vez que a tela carrega).
    const defaultPath = path.join(process.cwd(), 'public', 'templates', 'template-demo.png')
    fs.copyFileSync(defaultPath, templatePath)
  }

  try {
    const { regions, width, height } = await detectBlueRegions(templatePath)
    if (regions.length === 0) {
      fs.rmSync(templateDir, { recursive: true, force: true })
      return NextResponse.json({ error: 'Nenhuma área azul foi encontrada nesse template' }, { status: 422 })
    }

    await prisma.user.update({ where: { id: userId }, data: { lastTemplateId: templateId } })

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
