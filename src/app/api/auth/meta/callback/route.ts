import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedToken,
  fetchInstagramProfile,
  InstagramNotProfessionalError,
  MetaConfigError,
} from '@/lib/meta'
import { getAppUrl } from '@/lib/app-url'

const STATE_COOKIE = 'meta_oauth_state'

function redirectWithError(message: string) {
  const url = new URL('/integrations', getAppUrl())
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', getAppUrl()))
  }

  const searchParams = req.nextUrl.searchParams
  const metaError = searchParams.get('error') || searchParams.get('error_description')
  if (metaError) {
    return redirectWithError(`Autorização recusada pelo Instagram: ${metaError}`)
  }

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const expectedState = req.cookies.get(STATE_COOKIE)?.value

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError('Falha de segurança no fluxo OAuth (state inválido ou expirado). Tente conectar novamente.')
  }

  try {
    const shortLived = await exchangeCodeForUserToken(code)
    const longLived = await exchangeForLongLivedToken(shortLived.access_token)
    const profile = await fetchInstagramProfile(longLived.access_token)

    const userId = (session.user as any).id
    const expiresAt = new Date(Date.now() + longLived.expires_in * 1000)

    await prisma.socialAccount.upsert({
      where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
      create: {
        userId,
        provider: 'INSTAGRAM',
        providerAccountId: profile.instagramUserId,
        accountName: profile.username,
        accountAvatar: null,
        accessToken: encrypt(longLived.access_token),
        scope: process.env.META_SCOPES,
        expiresAt,
        metadata: { accountType: profile.accountType },
      },
      update: {
        providerAccountId: profile.instagramUserId,
        accountName: profile.username,
        accessToken: encrypt(longLived.access_token),
        scope: process.env.META_SCOPES,
        expiresAt,
        metadata: { accountType: profile.accountType },
      },
    })

    const res = NextResponse.redirect(new URL('/integrations?connected=instagram', getAppUrl()))
    res.cookies.delete(STATE_COOKIE)
    return res
  } catch (err) {
    console.error('[meta/callback] Falha ao conectar conta do Instagram:', err)
    const message =
      err instanceof InstagramNotProfessionalError || err instanceof MetaConfigError || err instanceof Error
        ? err.message
        : 'Erro ao conectar com o Instagram. Tente novamente.'
    return redirectWithError(message)
  }
}
