import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'crypto'
import { authOptions } from '@/lib/auth'
import { buildInstagramAuthUrl, InstagramConfigError } from '@/lib/instagram'
import { getAppUrl } from '@/lib/app-url'

const STATE_COOKIE = 'ig_oauth_state'

// Últimos 4 dígitos só pra conferir nos logs qual client_id foi usado, sem
// nunca expor o valor completo (não é o secret, mas ainda assim não expomos
// por inteiro).
function lastDigits(value: string, count = 4): string {
  return value.length > count ? `...${value.slice(-count)}` : value
}

// Inicia o fluxo OAuth direto do Instagram (Instagram API with Instagram
// Login): gera state anti-CSRF, guarda em cookie httpOnly de curta duração
// e redireciona para o diálogo de login do Instagram.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const state = crypto.randomBytes(24).toString('hex')
    const authUrl = buildInstagramAuthUrl(state)

    console.log(
      '[instagram/connect] client_id:', lastDigits(process.env.INSTAGRAM_APP_ID || ''),
      '| redirect_uri:', process.env.INSTAGRAM_REDIRECT_URI,
      '| scopes:', process.env.INSTAGRAM_SCOPES,
      '| endpoint: https://www.instagram.com/oauth/authorize'
    )

    const res = NextResponse.redirect(authUrl)
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10,
      path: '/',
    })
    return res
  } catch (err) {
    if (err instanceof InstagramConfigError) {
      console.error('[instagram/connect] Configuração ausente:', err.message)
      const url = new URL('/integrations', getAppUrl())
      url.searchParams.set('error', err.message)
      return NextResponse.redirect(url)
    }
    throw err
  }
}
