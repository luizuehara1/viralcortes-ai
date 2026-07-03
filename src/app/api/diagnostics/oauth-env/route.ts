import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAppUrl } from '@/lib/app-url'

// Rota de diagnóstico temporária — mostra só SE cada variável de ambiente de
// OAuth está presente e, para as que não são segredo (URLs/scopes), o valor
// exato que está configurado (para bater com o que foi cadastrado no Google
// Cloud / Meta Developers). Nunca mostra client secret, tokens ou API keys.
// Exige sessão logada — não é uma rota pública.
const SECRET_VARS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'META_APP_ID', 'META_APP_SECRET'] as const
const PLAIN_VARS = ['GOOGLE_REDIRECT_URI', 'YOUTUBE_UPLOAD_SCOPE', 'META_REDIRECT_URI', 'META_SCOPES'] as const

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const result: Record<string, string> = {}
  for (const key of SECRET_VARS) {
    result[key] = process.env[key] ? 'configurado' : 'ausente'
  }
  for (const key of PLAIN_VARS) {
    result[key] = process.env[key] || 'ausente'
  }

  let resolvedAppUrl: string
  try {
    resolvedAppUrl = getAppUrl()
  } catch (err) {
    resolvedAppUrl = `ERRO: ${(err as Error).message}`
  }

  return NextResponse.json({
    ...result,
    APP_URL_RESOLVIDA: resolvedAppUrl,
    NODE_ENV: process.env.NODE_ENV ?? 'ausente',
  })
}
