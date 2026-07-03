// OAuth do Google + YouTube Data API v3 via fetch puro (sem SDK googleapis,
// para não adicionar dependência pesada só por causa de 3 chamadas REST).

import { prisma } from './prisma'
import { encrypt, decrypt } from './crypto'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

export interface YoutubeEnv {
  clientId: string
  clientSecret: string
  redirectUri: string
  scope: string
}

const REQUIRED_VARS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'YOUTUBE_UPLOAD_SCOPE',
] as const

export class YoutubeConfigError extends Error {}

// Lança um erro com mensagem amigável (em pt-BR) listando exatamente quais
// variáveis faltam, em vez de deixar o fetch estourar com erro genérico.
export function requireYoutubeEnv(): YoutubeEnv {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new YoutubeConfigError(
      `Integração com YouTube não configurada. Faltam as variáveis de ambiente: ${missing.join(', ')}.`
    )
  }
  return {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_REDIRECT_URI!,
    scope: process.env.YOUTUBE_UPLOAD_SCOPE!,
  }
}

// channels.list com part=snippet,statistics (usado logo após conectar, para
// mostrar o canal) exige leitura, que o escopo de upload sozinho não cobre —
// Google responde 403 "insufficientPermissions" mesmo com o token válido.
// Sempre incluímos esse escopo de leitura além do(s) configurado(s) em
// YOUTUBE_UPLOAD_SCOPE, em vez de depender de quem configurar o Railway
// lembrar de incluir os dois.
const YOUTUBE_READONLY_SCOPE = 'https://www.googleapis.com/auth/youtube.readonly'

function withReadonlyScope(configuredScope: string): string {
  const scopes = new Set(configuredScope.split(/\s+/).filter(Boolean))
  scopes.add(YOUTUBE_READONLY_SCOPE)
  return Array.from(scopes).join(' ')
}

export function buildGoogleAuthUrl(state: string): string {
  const env = requireYoutubeEnv()
  const params = new URLSearchParams({
    client_id: env.clientId,
    redirect_uri: env.redirectUri,
    response_type: 'code',
    scope: withReadonlyScope(env.scope),
    access_type: 'offline', // necessário para receber refresh_token
    prompt: 'consent', // força reenvio do refresh_token mesmo se já autorizado antes
    state,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

export interface GoogleTokens {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

// Extrai { error, error_description } do corpo de erro do Google (formato
// padrão OAuth2 — ex.: "redirect_uri_mismatch", "invalid_client",
// "invalid_grant") para expor o motivo real em vez de só o status HTTP.
async function parseGoogleOAuthError(res: Response): Promise<string> {
  const body = await res.text()
  try {
    const parsed = JSON.parse(body)
    const parts = [parsed.error, parsed.error_description].filter(Boolean)
    if (parts.length > 0) return parts.join(': ')
  } catch {}
  return body.slice(0, 300) || `status ${res.status}`
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const env = requireYoutubeEnv()
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      redirect_uri: env.redirectUri,
      grant_type: 'authorization_code',
    }),
  })

  if (!res.ok) {
    throw new Error(`Falha ao trocar code por tokens: ${await parseGoogleOAuthError(res)}`)
  }
  return res.json()
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const env = requireYoutubeEnv()
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.clientId,
      client_secret: env.clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error(`Falha ao renovar access_token (status ${res.status})`)
  }
  return res.json()
}

export interface YoutubeChannelInfo {
  channelId: string
  title: string
  thumbnailUrl: string | null
  subscriberCount: string | null
  videoCount: string | null
}

// Busca dados do canal do usuário autenticado (mine=true). Usada tanto no
// callback do OAuth quanto no botão "Testar conexão".
export async function fetchOwnChannel(accessToken: string): Promise<YoutubeChannelInfo> {
  const params = new URLSearchParams({ part: 'snippet,statistics', mine: 'true' })
  const res = await fetch(`${YOUTUBE_API_BASE}/channels?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`Falha ao consultar canal do YouTube (status ${res.status}): ${(await res.text()).slice(0, 300)}`)
  }

  const data = await res.json()
  const channel = data.items?.[0]
  if (!channel) {
    throw new Error('Nenhum canal do YouTube encontrado para esta conta Google.')
  }

  return {
    channelId: channel.id,
    title: channel.snippet?.title ?? 'Canal sem nome',
    thumbnailUrl: channel.snippet?.thumbnails?.default?.url ?? null,
    subscriberCount: channel.statistics?.subscriberCount ?? null,
    videoCount: channel.statistics?.videoCount ?? null,
  }
}

// Retorna um access_token válido para o SocialAccount YOUTUBE do usuário,
// renovando via refresh_token quando estiver expirado (ou perto disso).
// Lança se a conta não existir — chamador decide como tratar (ex.: pedir
// para reconectar).
export async function getValidAccessToken(userId: string): Promise<string> {
  const account = await prisma.socialAccount.findUnique({
    where: { userId_provider: { userId, provider: 'YOUTUBE' } },
  })
  if (!account) {
    throw new Error('Nenhuma conta do YouTube conectada para este usuário.')
  }

  const expiresSoon = !account.expiresAt || account.expiresAt.getTime() - Date.now() < 60_000
  if (!expiresSoon) {
    return decrypt(account.accessToken)
  }

  if (!account.refreshToken) {
    throw new Error('Conexão com o YouTube expirou e não há refresh_token salvo. Reconecte a conta.')
  }

  const refreshed = await refreshAccessToken(decrypt(account.refreshToken))
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessToken: encrypt(refreshed.access_token),
      expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
    },
  })

  return refreshed.access_token
}
