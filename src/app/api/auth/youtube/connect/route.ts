import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'crypto'
import { authOptions } from '@/lib/auth'
import { buildGoogleAuthUrl, YoutubeConfigError } from '@/lib/youtube'

const STATE_COOKIE = 'yt_oauth_state'

// Inicia o fluxo OAuth: gera um state anti-CSRF, guarda em cookie httpOnly
// de curta duração e redireciona para a tela de consentimento do Google.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  let authUrl: string
  try {
    const state = crypto.randomBytes(24).toString('hex')
    authUrl = buildGoogleAuthUrl(state)

    const res = NextResponse.redirect(authUrl)
    res.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 10, // 10 minutos é suficiente para o usuário completar o consentimento
      path: '/',
    })
    return res
  } catch (err) {
    if (err instanceof YoutubeConfigError) {
      const url = new URL('/integrations', process.env.NEXTAUTH_URL || 'http://localhost:3000')
      url.searchParams.set('error', err.message)
      return NextResponse.redirect(url)
    }
    throw err
  }
}
