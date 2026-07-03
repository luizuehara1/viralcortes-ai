import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto'
import {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchOwnInstagramAccount,
  normalizeScopeString,
  InstagramConfigError,
} from '@/lib/instagram'
import { getAppUrl } from '@/lib/app-url'

const STATE_COOKIE = 'ig_oauth_state'

function redirectWithError(message: string) {
  const url = new URL('/integrations', getAppUrl())
  url.searchParams.set('error', message)
  return NextResponse.redirect(url)
}

function lastDigits(value: string, count = 4): string {
  return value.length > count ? `...${value.slice(-count)}` : value
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.redirect(new URL('/login', getAppUrl()))
  }

  const searchParams = req.nextUrl.searchParams
  const igErrorCode = searchParams.get('error')
  const igErrorReason = searchParams.get('error_reason')
  const igErrorDescription = searchParams.get('error_description')
  console.log(
    '[instagram/callback] recebeu code?', searchParams.has('code'),
    '| redirect_uri configurado:', process.env.INSTAGRAM_REDIRECT_URI,
    '| client_id:', lastDigits(process.env.INSTAGRAM_APP_ID || ''),
    '| scopes:', process.env.INSTAGRAM_SCOPES,
    '| error:', igErrorCode ?? '(nenhum)',
    '| error_reason:', igErrorReason ?? '(nenhum)',
    '| error_description:', igErrorDescription ?? '(nenhum)'
  )

  if (igErrorCode || igErrorReason || igErrorDescription) {
    return redirectWithError(
      `Autorização recusada pelo Instagram: ${[igErrorCode, igErrorReason, igErrorDescription].filter(Boolean).join(' - ')}`
    )
  }

  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const expectedState = req.cookies.get(STATE_COOKIE)?.value

  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError('Falha de segurança no fluxo OAuth (state inválido ou expirado). Tente conectar novamente.')
  }

  let step = 'troca_code_por_token_curto'
  try {
    console.log('[instagram/callback] etapa:', step, '| endpoint: https://api.instagram.com/oauth/access_token')
    const shortLived = await exchangeCodeForShortLivedToken(code)

    step = 'troca_por_token_longo'
    console.log('[instagram/callback] etapa:', step, '| endpoint: https://graph.instagram.com/access_token')
    const longLived = await exchangeForLongLivedToken(shortLived.access_token)

    step = 'buscar_conta_instagram'
    const instagram = await fetchOwnInstagramAccount(shortLived.user_id, longLived.access_token)
    console.log('[instagram/callback] instagram conectado:', instagram.accountName)

    step = 'salvar_conta'
    const userId = (session.user as any).id
    const expiresAt = longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000) : null
    // A API retorna "permissions" como array de strings — a coluna `scope`
    // no banco é uma única string, então normalizamos antes de gravar.
    const scopeString = normalizeScopeString(shortLived.permissions, process.env.INSTAGRAM_SCOPES)

    await prisma.socialAccount.upsert({
      where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
      create: {
        userId,
        provider: 'INSTAGRAM',
        providerAccountId: instagram.instagramUserId,
        accountName: instagram.accountName,
        accountAvatar: instagram.profilePictureUrl,
        accessToken: encrypt(longLived.access_token),
        // Este fluxo não tem refresh_token — o próprio token de longa
        // duração é renovado (não substituído) antes de expirar.
        scope: scopeString,
        expiresAt,
      },
      update: {
        providerAccountId: instagram.instagramUserId,
        accountName: instagram.accountName,
        accountAvatar: instagram.profilePictureUrl,
        accessToken: encrypt(longLived.access_token),
        scope: scopeString,
        expiresAt,
      },
    })

    const res = NextResponse.redirect(new URL('/integrations?connected=instagram', getAppUrl()))
    res.cookies.delete(STATE_COOKIE)
    return res
  } catch (err) {
    // Log técnico completo no servidor — nunca inclui INSTAGRAM_APP_SECRET,
    // access_token ou refresh_token, só a mensagem de erro construída em
    // lib/instagram.ts (que já traz o motivo real do Instagram) e a etapa.
    console.error(`[instagram/callback] Falha na etapa "${step}":`, (err as Error).message)
    const message =
      err instanceof InstagramConfigError || err instanceof Error
        ? err.message
        : 'Erro ao conectar com o Instagram. Tente novamente.'
    return redirectWithError(message)
  }
}
