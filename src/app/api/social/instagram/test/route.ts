import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStoredPageAccessToken, fetchInstagramAccountInfo } from '@/lib/meta'

// "Testar conexão": usa o Page Access Token salvo para chamar a Graph API de
// verdade, confirmando que a conta do Instagram ainda está acessível.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id

  try {
    const { accessToken, instagramBusinessAccountId } = await getStoredPageAccessToken(userId)
    const info = await fetchInstagramAccountInfo(instagramBusinessAccountId, accessToken)

    await prisma.socialAccount.update({
      where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
      data: {
        accountName: info.username,
        accountAvatar: info.profilePictureUrl,
      },
    })

    return NextResponse.json({ ok: true, account: info })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao testar a conexão com o Instagram.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
