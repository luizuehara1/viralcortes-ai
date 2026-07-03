import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enqueueVideoImport } from '@/lib/queue'
import { detectPlatform, isValidHttpUrl } from '@/lib/platform-detector'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

export const runtime = 'nodejs'

const bodySchema = z.object({
  projectId: z.string().min(1),
  url: z.string().min(1),
  title: z.string().max(300).optional(),
})

// Creates the SourceVideo row and enqueues a background import job —
// downloading never happens inside this request (see src/workers/video-importer.ts).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })

  const { projectId, url, title } = parsed.data
  if (!isValidHttpUrl(url)) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
  }
  const platform = detectPlatform(url)
  if (!platform) {
    return NextResponse.json({ error: 'Link inválido' }, { status: 400 })
  }

  const userId = (session.user as any).id
  const project = await prisma.project.findFirst({ where: { id: projectId, userId } })
  if (!project) {
    return NextResponse.json({ error: 'Projeto não encontrado' }, { status: 404 })
  }

  const sourceVideoId = uuidv4()
  const sourceVideo = await prisma.sourceVideo.create({
    data: {
      id: sourceVideoId,
      projectId,
      title: title || null,
      sourceUrl: url,
      sourceType: 'URL',
      sourcePlatform: platform,
      status: 'IMPORTING',
    },
  })

  await enqueueVideoImport(sourceVideoId)

  return NextResponse.json({ sourceVideoId: sourceVideo.id, status: 'IMPORTING' }, { status: 201 })
}
