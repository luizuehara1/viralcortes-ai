import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'crypto'
import { authOptions } from '@/lib/auth'
import { buildMetaAuthUrl, MetaConfigError } from '@/lib/meta'

const STATE_COOKIE = 'meta_oauth_state'

// Inicia o fluxo OAuth da Meta: gera state anti-CSRF, guarda em cookie
// httpOnly de curta duração e redireciona para o diálogo de login do Facebook.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const state = crypto.randomBytes(24).toString('hex')
    const authUrl = buildMetaAuthUrl(state)

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
    if (err instanceof MetaConfigError) {
      const url = new URL('/integrations', process.env.NEXTAUTH_URL || 'http://localhost:3000')
      url.searchParams.set('error', err.message)
      return NextResponse.redirect(url)
    }
    throw err
  }
}
