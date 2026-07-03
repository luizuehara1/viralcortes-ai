import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchOwnInstagramAccount,
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
  const metaErrorCode = searchParams.get('error')
  const metaErrorDescription = searchParams.get('error_description')
  console.log('[meta/callback] recebeu code?', searchParams.has('code'), '| error:', metaErrorCode ?? '(nenhum)', '| error_description:', metaErrorDescription ?? '(nenhum)')

  if (metaErrorCode || metaErrorDescription) {
    return redirectWithError(`Autorização recusada pela Meta: ${[metaErrorCode, metaErrorDescription].filter(Boolean).join(' - ')}`)
  }

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const expectedState = req.cookies.get(STATE_COOKIE)?.value

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError('Falha de segurança no fluxo OAuth (state inválido ou expirado). Tente conectar novamente.')
  }

  let step = 'troca_code_por_token_curto'
  try {
    console.log('[meta/callback] etapa:', step, '| redirect_uri configurado:', process.env.META_REDIRECT_URI ?? '(ausente)')
    const shortLived = await exchangeCodeForShortLivedToken(code)

    step = 'troca_por_token_longo'
    const longLived = await exchangeForLongLivedToken(shortLived.access_token)

    step = 'buscar_conta_instagram'
    const instagram = await fetchOwnInstagramAccount(shortLived.user_id, longLived.access_token)
    console.log('[meta/callback] instagram conectado:', instagram.accountName)

    step = 'salvar_conta'
    const userId = (session.user as any).id
    const expiresAt = longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000) : null

    await prisma.socialAccount.upsert({
      where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
      create: {
        userId,
        provider: 'INSTAGRAM',
        providerAccountId: instagram.instagramUserId,
        accountName: instagram.accountName,
        accountAvatar: instagram.profilePictureUrl,
        accessToken: encrypt(longLived.access_token),
        scope: process.env.META_SCOPES,
        expiresAt,
      },
      update: {
        providerAccountId: instagram.instagramUserId,
        accountName: instagram.accountName,
        accountAvatar: instagram.profilePictureUrl,
        accessToken: encrypt(longLived.access_token),
        scope: process.env.META_SCOPES,
        expiresAt,
      },
    })

    const res = NextResponse.redirect(new URL('/integrations?connected=instagram', getAppUrl()))
    res.cookies.delete(STATE_COOKIE)
    return res
  } catch (err) {
    console.error(`[meta/callback] Falha na etapa "${step}":`, (err as Error).message)
    const message =
      err instanceof MetaConfigError || err instanceof Error
        ? err.message
        : 'Erro ao conectar com o Instagram. Tente novamente.'
    return redirectWithError(message)
  }
}
