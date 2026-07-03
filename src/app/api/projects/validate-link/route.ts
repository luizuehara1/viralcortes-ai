import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { z } from 'zod'
import { detectPlatform, isValidHttpUrl } from '@/lib/platform-detector'
import { fetchMetadata } from '@/lib/ytdlp'

export const runtime = 'nodejs'
export const maxDuration = 45

const bodySchema = z.object({ url: z.string().min(1) })

// Metadata-only (no download) so this stays fast enough to run inline in
// the "Validar link" click — the actual import/download always happens in
// a background worker job (see /api/upload/link).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Link inválido' }, { status: 400 })

  const { url } = parsed.data
  if (!isValidHttpUrl(url)) {
    return NextResponse.json({ error: 'Link inválido — use uma URL http(s) completa' }, { status: 400 })
  }

  const platform = detectPlatform(url)
  if (!platform) {
    return NextResponse.json({ error: 'Link inválido — use uma URL http(s) completa' }, { status: 400 })
  }

  try {
    const metadata = await fetchMetadata(url)
    return NextResponse.json({
      platform,
      title: metadata.title,
      duration: metadata.duration,
      thumbnail: metadata.thumbnail,
      isLive: metadata.isLive,
    })
  } catch (err: any) {
    return NextResponse.json(
      {
        error:
          err.message ||
          'Não foi possível importar esse link automaticamente. Baixe o vídeo e envie pelo upload manual.',
      },
      { status: 422 }
    )
  }
}
