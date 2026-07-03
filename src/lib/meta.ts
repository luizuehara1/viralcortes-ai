// OAuth via "Instagram API with Instagram Login" (Instagram Business
// Login) — login direto com a conta profissional do Instagram, sem
// depender de uma Página do Facebook vinculada. Via fetch puro, sem SDK.
//
// Não usar o fluxo antigo "Facebook Login for Business"
// (facebook.com/dialog/oauth + me/accounts + instagram_business_account) —
// o app da Meta deste projeto foi reconfigurado para o produto "Instagram
// API with Instagram Login", cujos scopes (instagram_business_basic,
// instagram_business_content_publish) e endpoints (instagram.com/oauth,
// api.instagram.com, graph.instagram.com) são diferentes do fluxo antigo.

import { prisma } from './prisma'
import { decrypt } from './crypto'

const GRAPH_VERSION = 'v21.0'
const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`
const IG_AUTH_URL = 'https://www.instagram.com/oauth/authorize'
const IG_CODE_EXCHANGE_URL = 'https://api.instagram.com/oauth/access_token'
const IG_LONG_LIVED_URL = 'https://graph.instagram.com/access_token'

export interface MetaEnv {
  appId: string
  appSecret: string
  redirectUri: string
  scopes: string
}

const REQUIRED_VARS = ['META_APP_ID', 'META_APP_SECRET', 'META_REDIRECT_URI', 'META_SCOPES'] as const

export class MetaConfigError extends Error {}

// Mensagem amigável em pt-BR listando exatamente quais variáveis faltam.
export function requireMetaEnv(): MetaEnv {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new MetaConfigError(
      `Integração com Instagram/Meta não configurada. Faltam as variáveis de ambiente: ${missing.join(', ')}.`
    )
  }
  return {
    appId: process.env.META_APP_ID!,
    appSecret: process.env.META_APP_SECRET!,
    redirectUri: process.env.META_REDIRECT_URI!,
    scopes: process.env.META_SCOPES!,
  }
}

export function buildMetaAuthUrl(state: string): string {
  const env = requireMetaEnv()
  const params = new URLSearchParams({
    client_id: env.appId,
    redirect_uri: env.redirectUri,
    scope: env.scopes,
    response_type: 'code',
    state,
  })
  return `${IG_AUTH_URL}?${params.toString()}`
}

interface InstagramShortLivedToken {
  access_token: string
  user_id: string
  permissions?: string
}

// O endpoint de troca de code do Instagram Login (api.instagram.com) às
// vezes anexa um sufixo "#_" ao final do code recebido no redirect — se
// isso for enviado de volta na troca, o Instagram rejeita. Removemos por
// segurança.
function stripCodeSuffix(code: string): string {
  return code.replace(/#_$/, '')
}

export async function exchangeCodeForShortLivedToken(code: string): Promise<InstagramShortLivedToken> {
  const env = requireMetaEnv()
  const res = await fetch(IG_CODE_EXCHANGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.appId,
      client_secret: env.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: env.redirectUri,
      code: stripCodeSuffix(code),
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao trocar code por token (status ${res.status}): ${body.slice(0, 300)}`)
  }
  const json = await res.json()
  // A resposta pode vir como { data: [{...}] } ou já no formato direto,
  // dependendo da versão/config do produto — cobrimos os dois.
  const entry = Array.isArray(json?.data) ? json.data[0] : json
  if (!entry?.access_token || !entry?.user_id) {
    throw new Error('Resposta inesperada do Instagram ao trocar code por token (sem access_token/user_id).')
  }
  return entry
}

interface InstagramLongLivedToken {
  access_token: string
  token_type: string
  expires_in: number
}

// Troca o token de curta duração (~1h) por um de longa duração (~60 dias).
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<InstagramLongLivedToken> {
  const env = requireMetaEnv()
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: env.appSecret,
    access_token: shortLivedToken,
  })
  const res = await fetch(`${IG_LONG_LIVED_URL}?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao gerar token de longa duração (status ${res.status}): ${body.slice(0, 300)}`)
  }
  return res.json()
}

export interface InstagramConnection {
  instagramUserId: string
  accountName: string
  profilePictureUrl: string | null
}

// Busca os dados básicos da própria conta profissional do Instagram
// (username, foto) usando o token direto do Instagram Login — sem Página
// do Facebook no meio.
export async function fetchOwnInstagramAccount(userId: string, accessToken: string): Promise<InstagramConnection> {
  const params = new URLSearchParams({
    fields: 'id,username,profile_picture_url',
    access_token: accessToken,
  })
  const res = await fetch(`${IG_GRAPH_BASE}/${userId}?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao buscar perfil do Instagram (status ${res.status}): ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  return {
    instagramUserId: data.id ?? userId,
    accountName: data.username ?? 'conta_instagram',
    profilePictureUrl: data.profile_picture_url ?? null,
  }
}

// Retorna o access_token salvo (token direto da conta do Instagram, não
// mais um Page Access Token) e o ID da conta profissional do Instagram.
export async function getStoredInstagramToken(userId: string): Promise<{ accessToken: string; instagramUserId: string }> {
  const account = await prisma.socialAccount.findUnique({
    where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
  })
  if (!account) {
    throw new Error('Nenhuma conta do Instagram conectada para este usuário.')
  }
  return { accessToken: decrypt(account.accessToken), instagramUserId: account.providerAccountId }
}

export interface InstagramAccountInfo {
  username: string
  profilePictureUrl: string | null
  followersCount: number | null
  mediaCount: number | null
}

export async function fetchInstagramAccountInfo(instagramUserId: string, accessToken: string): Promise<InstagramAccountInfo> {
  const params = new URLSearchParams({
    fields: 'username,profile_picture_url,followers_count,media_count',
    access_token: accessToken,
  })
  const res = await fetch(`${IG_GRAPH_BASE}/${instagramUserId}?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao consultar conta do Instagram (status ${res.status}): ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  return {
    username: data.username ?? 'conta_instagram',
    profilePictureUrl: data.profile_picture_url ?? null,
    followersCount: data.followers_count ?? null,
    mediaCount: data.media_count ?? null,
  }
}
