import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStoredInstagramAccessToken, fetchInstagramProfile, InstagramNotProfessionalError } from '@/lib/meta'

// "Testar conexão": usa o access token salvo para chamar a Instagram Graph
// API de verdade, confirmando que a conta ainda está acessível.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const userId = (session.user as any).id

  try {
    const accessToken = await getStoredInstagramAccessToken(userId)
    const profile = await fetchInstagramProfile(accessToken)

    await prisma.socialAccount.update({
      where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
      data: {
        accountName: profile.username,
        metadata: { accountType: profile.accountType },
      },
    })

    return NextResponse.json({
      ok: true,
      account: { username: profile.username, accountType: profile.accountType, mediaCount: profile.mediaCount },
    })
  } catch (err) {
    const message =
      err instanceof InstagramNotProfessionalError || err instanceof Error
        ? err.message
        : 'Falha ao testar a conexão com o Instagram.'
    return NextResponse.json({ ok: false, error: message }, { status: 400 })
  }
}
