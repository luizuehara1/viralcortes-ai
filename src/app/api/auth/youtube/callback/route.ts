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
  const googleErrorDescription = searchParams.get('error_description')
  console.log('[youtube/callback] recebeu code?', searchParams.has('code'), '| error:', googleError ?? '(nenhum)', '| error_description:', googleErrorDescription ?? '(nenhum)')

  if (googleError) {
    // access_denied (usuário cancelou), ou o app OAuth ainda não verificado /
    // usuário fora da lista de test users — o Google manda essa razão exata.
    return redirectWithError(`Autorização recusada pelo Google: ${googleError}${googleErrorDescription ? ` (${googleErrorDescription})` : ''}`)
  }

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const expectedState = req.cookies.get(STATE_COOKIE)?.value

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError('Falha de segurança no fluxo OAuth (state inválido ou expirado). Tente conectar novamente.')
  }

  let step = 'troca_code_por_token'
  try {
    console.log('[youtube/callback] etapa:', step, '| redirect_uri configurado:', process.env.GOOGLE_REDIRECT_URI ?? '(ausente)')
    const tokens = await exchangeCodeForTokens(code)
    console.log('[youtube/callback] token trocado com sucesso | recebeu refresh_token?', !!tokens.refresh_token)

    if (!tokens.refresh_token) {
      // Acontece se o usuário já tinha autorizado antes e o Google não reenviou o
      // refresh_token. Como usamos prompt=consent, isso não deveria ocorrer, mas
      // avisamos com uma mensagem clara em vez de salvar um refresh_token nulo.
      return redirectWithError(
        'Google não retornou refresh_token. Revogue o acesso em https://myaccount.google.com/permissions e tente conectar novamente.'
      )
    }

    step = 'buscar_canal'
    let channel
    try {
      channel = await fetchOwnChannel(tokens.access_token)
    } catch (channelErr) {
      // O token é válido (a troca funcionou), só a consulta ao canal falhou —
      // motivo diferente de "não autorizou"/"credenciais erradas", então
      // avisamos separado em vez de misturar com falha geral de conexão.
      console.error('[youtube/callback] token OK mas falha ao buscar canal:', channelErr)
      return redirectWithError(
        `YouTube conectado, mas não foi possível buscar o canal. Detalhe: ${(channelErr as Error).message}`
      )
    }
    console.log('[youtube/callback] canal encontrado:', channel.channelId)

    step = 'salvar_conta'
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
    // Log técnico completo no servidor (visível nos logs do Railway) — nunca
    // inclui client_secret/tokens, só a mensagem de erro construída em
    // lib/youtube.ts (que já traz o motivo real do Google: redirect_uri_mismatch,
    // invalid_client, invalid_grant etc.), e a etapa onde falhou.
    console.error(`[youtube/callback] Falha na etapa "${step}":`, (err as Error).message)
    const message = err instanceof YoutubeConfigError ? err.message : (err as Error).message || 'Erro ao conectar com o YouTube. Tente novamente.'
    return redirectWithError(message)
  }
}
