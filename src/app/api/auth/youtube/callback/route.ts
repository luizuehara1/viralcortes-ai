import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import { exchangeCodeForTokens, fetchOwnChannel, YoutubeConfigError } from '@/lib/youtube'
import { getAppUrl } from '@/lib/app-url'

const STATE_COOKIE = 'yt_oauth_state'

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
  const googleError = searchParams.get('error')
  if (googleError) {
    return redirectWithError(`Autorização recusada pelo Google: ${googleError}`)
  }

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const expectedState = req.cookies.get(STATE_COOKIE)?.value

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError('Falha de segurança no fluxo OAuth (state inválido ou expirado). Tente conectar novamente.')
  }

  try {
    const tokens = await exchangeCodeForTokens(code)
    if (!tokens.refresh_token) {
      // Acontece se o usuário já tinha autorizado antes e o Google não reenviou o
      // refresh_token. Como usamos prompt=consent, isso não deveria ocorrer, mas
      // avisamos com uma mensagem clara em vez de salvar um refresh_token nulo.
      return redirectWithError(
        'Google não retornou refresh_token. Revogue o acesso em https://myaccount.google.com/permissions e tente conectar novamente.'
      )
    }

    const channel = await fetchOwnChannel(tokens.access_token)
    const userId = (session.user as any).id

    await prisma.socialAccount.upsert({
      where: { userId_provider: { userId, provider: 'YOUTUBE' } },
      create: {
        userId,
        provider: 'YOUTUBE',
        providerAccountId: channel.channelId,
        accountName: channel.title,
        accountAvatar: channel.thumbnailUrl,
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        scope: tokens.scope,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
      update: {
        providerAccountId: channel.channelId,
        accountName: channel.title,
        accountAvatar: channel.thumbnailUrl,
        accessToken: encrypt(tokens.access_token),
        refreshToken: encrypt(tokens.refresh_token),
        scope: tokens.scope,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    })

    const res = NextResponse.redirect(new URL('/integrations?connected=youtube', getAppUrl()))
    res.cookies.delete(STATE_COOKIE)
    return res
  } catch (err) {
    // Log técnico completo no servidor (visível nos logs do Railway) — a
    // mensagem mostrada ao usuário continua genérica/amigável, exceto para
    // erros de configuração (YoutubeConfigError), que já são amigáveis.
    console.error('[youtube/callback] Falha ao conectar conta do YouTube:', err)
    const message = err instanceof YoutubeConfigError ? err.message : 'Erro ao conectar com o YouTube. Tente novamente.'
    return redirectWithError(message)
  }
}
