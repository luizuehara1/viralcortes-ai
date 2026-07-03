import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getValidAccessToken, fetchOwnChannel } from '@/lib/youtube'

// "Testar conexão": busca um access_token válido (renovando se preciso) e
// chama a API do YouTube de verdade, para confirmar que a conta ainda está
// autorizada e os tokens salvos funcionam.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id

  try {
    const accessToken = await getValidAccessToken(userId)
    const channel = await fetchOwnChannel(accessToken)

    await prisma.socialAccount.update({
      where: { userId_provider: { userId, provider: 'YOUTUBE' } },
      data: {
        accountName: channel.title,
        accountAvatar: channel.thumbnailUrl,
      },
    })

    return NextResponse.json({ ok: true, channel })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao testar a conexão com o YouTube.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
