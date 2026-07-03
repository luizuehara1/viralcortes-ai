// Instagram API with Instagram Login (Business Login for Instagram) — login
// direto com a conta profissional do Instagram, sem precisar de uma Página
// do Facebook vinculada. Via fetch puro, sem SDK.
//
// Endpoints são da própria Instagram, não do Graph do Facebook:
//   - autorização:      https://www.instagram.com/oauth/authorize
//   - troca code→token: https://api.instagram.com/oauth/access_token
//   - token de longa duração / refresh / dados da conta: https://graph.instagram.com

import { prisma } from './prisma'
import { decrypt } from './crypto'

const IG_AUTH_URL = 'https://www.instagram.com/oauth/authorize'
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token'
const IG_GRAPH_BASE = 'https://graph.instagram.com'

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
      `Integração com Instagram não configurada. Faltam as variáveis de ambiente: ${missing.join(', ')}.`
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

interface ShortLivedTokenResponse {
  access_token: string
  user_id: string
  permissions?: string
}

// POST form-encoded, diferente do fluxo antigo (que usava GET no graph.facebook.com).
export async function exchangeCodeForUserToken(code: string): Promise<ShortLivedTokenResponse> {
  const env = requireMetaEnv()
  const res = await fetch(IG_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.appId,
      client_secret: env.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: env.redirectUri,
      code,
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao trocar code por token (status ${res.status}): ${body.slice(0, 200)}`)
  }
  return res.json()
}

interface LongLivedTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

// Troca o token de curta duração (~1h) por um de longa duração (~60 dias).
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedTokenResponse> {
  const env = requireMetaEnv()
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: env.appSecret,
    access_token: shortLivedToken,
  })
  const res = await fetch(`${IG_GRAPH_BASE}/access_token?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao gerar token de longa duração (status ${res.status}): ${body.slice(0, 200)}`)
  }
  return res.json()
}

// Renova um token de longa duração antes de expirar, gerando outro válido
// por mais ~60 dias. Só funciona em tokens que ainda não expiraram.
export async function refreshLongLivedToken(accessToken: string): Promise<LongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'ig_refresh_token',
    access_token: accessToken,
  })
  const res = await fetch(`${IG_GRAPH_BASE}/refresh_access_token?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao renovar token de acesso (status ${res.status}): ${body.slice(0, 200)}`)
  }
  return res.json()
}

// Tipos de conta retornados pela Instagram Graph API. Só BUSINESS e
// MEDIA_CREATOR (contas profissionais) funcionam com este login — uma conta
// PERSONAL não tem acesso aos escopos de publicação/negócio.
export type InstagramAccountType = 'BUSINESS' | 'MEDIA_CREATOR' | 'PERSONAL'

export interface InstagramProfile {
  instagramUserId: string
  username: string
  accountType: InstagramAccountType
  mediaCount: number | null
}

export class InstagramNotProfessionalError extends Error {}

// Busca o perfil da conta logada. Se a conta não for profissional
// (BUSINESS/MEDIA_CREATOR), lança um erro amigável em vez de salvar uma
// conexão que não vai funcionar para testar/publicar depois.
export async function fetchInstagramProfile(accessToken: string): Promise<InstagramProfile> {
  const params = new URLSearchParams({
    fields: 'user_id,username,account_type,media_count',
    access_token: accessToken,
  })
  const res = await fetch(`${IG_GRAPH_BASE}/v21.0/me?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao consultar o perfil do Instagram (status ${res.status}): ${body.slice(0, 200)}`)
  }
  const data = await res.json()

  const accountType: InstagramAccountType = data.account_type ?? 'PERSONAL'
  if (accountType !== 'BUSINESS' && accountType !== 'MEDIA_CREATOR') {
    throw new InstagramNotProfessionalError(
      'Sua conta do Instagram precisa ser uma conta profissional (Business ou Criador de conteúdo) para conectar. ' +
        'No app do Instagram, vá em Configurações → Conta → Mudar para conta profissional, e tente conectar de novo.'
    )
  }

  return {
    instagramUserId: String(data.user_id ?? data.id),
    username: data.username ?? 'conta_instagram',
    accountType,
    mediaCount: data.media_count ?? null,
  }
}

// Retorna o access token salvo do Instagram para o usuário.
export async function getStoredInstagramAccessToken(userId: string): Promise<string> {
  const account = await prisma.socialAccount.findUnique({
    where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
  })
  if (!account) {
    throw new Error('Nenhuma conta do Instagram conectada para este usuário.')
  }
  return decrypt(account.accessToken)
}
