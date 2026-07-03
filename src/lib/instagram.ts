// OAuth via "Instagram API with Instagram Login" (Instagram Business
// Login) — login direto com a conta profissional do Instagram, sem
// depender de uma Página do Facebook nem do App ID principal da Meta. Via
// fetch puro, sem SDK.
//
// Importante: este app tem DOIS app IDs distintos no painel da Meta —
// META_APP_ID (app "de Facebook") e INSTAGRAM_APP_ID (gerado em "Instagram
// → API setup with Instagram login"). Usar o META_APP_ID aqui faz o
// instagram.com/oauth/authorize recusar com "Invalid platform app". Este
// módulo só deve usar as variáveis INSTAGRAM_*, nunca META_*.
//
// Não usar o fluxo antigo "Facebook Login for Business"
// (facebook.com/dialog/oauth + me/accounts + instagram_business_account) —
// nem os scopes antigos (pages_show_list, pages_read_engagement,
// instagram_basic, instagram_content_publish).

import { prisma } from './prisma'
import { decrypt } from './crypto'

const GRAPH_VERSION = 'v21.0'
const IG_GRAPH_BASE = `https://graph.instagram.com/${GRAPH_VERSION}`
const IG_AUTH_URL = 'https://www.instagram.com/oauth/authorize'
const IG_CODE_EXCHANGE_URL = 'https://api.instagram.com/oauth/access_token'
const IG_LONG_LIVED_URL = 'https://graph.instagram.com/access_token'

export interface InstagramEnv {
  appId: string
  appSecret: string
  redirectUri: string
  scopes: string
}

const REQUIRED_VARS = ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'INSTAGRAM_REDIRECT_URI', 'INSTAGRAM_SCOPES'] as const

export class InstagramConfigError extends Error {}

// Mensagem amigável em pt-BR listando exatamente quais variáveis faltam.
export function requireInstagramEnv(): InstagramEnv {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key])
  if (missing.length > 0) {
    throw new InstagramConfigError(
      `Integração com Instagram não configurada. Faltam as variáveis de ambiente: ${missing.join(', ')}.`
    )
  }
  return {
    appId: process.env.INSTAGRAM_APP_ID!,
    appSecret: process.env.INSTAGRAM_APP_SECRET!,
    redirectUri: process.env.INSTAGRAM_REDIRECT_URI!,
    scopes: process.env.INSTAGRAM_SCOPES!,
  }
}

export function buildInstagramAuthUrl(state: string): string {
  const env = requireInstagramEnv()
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
  // A API retorna isso como array de strings (ex.: ["instagram_business_basic",
  // "instagram_business_content_publish"]), não como string única — apesar
  // de alguma documentação sugerir o contrário.
  permissions?: string | string[]
}

// Normaliza permissions (array ou string, dependendo da resposta) pro
// formato de string única que a coluna `scope` do banco espera.
export function normalizeScopeString(permissions: string | string[] | undefined, fallback: string | undefined): string {
  if (Array.isArray(permissions)) return permissions.join(',')
  return permissions || fallback || ''
}

// O endpoint de troca de code do Instagram Login (api.instagram.com) às
// vezes anexa um sufixo "#_" ao final do code recebido no redirect — se
// isso for enviado de volta na troca, o Instagram rejeita. Removemos por
// segurança.
function stripCodeSuffix(code: string): string {
  return code.replace(/#_$/, '')
}

export async function exchangeCodeForShortLivedToken(code: string): Promise<InstagramShortLivedToken> {
  const env = requireInstagramEnv()
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
// Não é um refresh_token no sentido OAuth2 padrão — este mesmo token de
// longa duração é renovado antes de expirar via /refresh_access_token.
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<InstagramLongLivedToken> {
  const env = requireInstagramEnv()
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

// Retorna o access_token salvo (token direto da conta do Instagram) e o ID
// da conta profissional do Instagram.
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

// ---------------------------------------------------------------------------
// Content Publishing API (Reels) — publica um vídeo já hospedado numa URL
// pública (video_url) na conta do Instagram conectada. Fluxo em 2 passos:
// 1. Cria um "container" de mídia (fica em processamento no lado da Meta).
// 2. Espera o container ficar FINISHED (poll) e então publica de fato.
//
// Limites da API (documentados pela Meta, não impostos por este código):
// - Até 25 publicações por conta do Instagram em uma janela de 24h.
// - O container expira em 24h se nunca for publicado.
// ---------------------------------------------------------------------------

export interface CreateContainerResult {
  containerId: string
}

// media_type=REELS é o único suportado aqui — publicação de feed/story fica
// fora de escopo por ora (não solicitado).
export async function createReelsContainer(
  instagramUserId: string,
  accessToken: string,
  videoUrl: string,
  caption: string
): Promise<CreateContainerResult> {
  const params = new URLSearchParams({
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    access_token: accessToken,
  })
  const res = await fetch(`${IG_GRAPH_BASE}/${instagramUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao criar container de mídia (status ${res.status}): ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  if (!data.id) {
    throw new Error('Resposta inesperada do Instagram ao criar container de mídia (sem id).')
  }
  return { containerId: data.id }
}

// Valores documentados: EXPIRED, ERROR, FINISHED, IN_PROGRESS, PUBLISHED.
export type ContainerStatusCode = 'EXPIRED' | 'ERROR' | 'FINISHED' | 'IN_PROGRESS' | 'PUBLISHED'

export interface ContainerStatus {
  statusCode: ContainerStatusCode
  statusText?: string
}

export async function getContainerStatus(containerId: string, accessToken: string): Promise<ContainerStatus> {
  const params = new URLSearchParams({ fields: 'status_code,status', access_token: accessToken })
  const res = await fetch(`${IG_GRAPH_BASE}/${containerId}?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao consultar status do container (status ${res.status}): ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  return { statusCode: data.status_code, statusText: data.status }
}

export interface PublishResult {
  instagramMediaId: string
}

// Só deve ser chamado depois que getContainerStatus retornar FINISHED —
// publicar um container ainda IN_PROGRESS falha do lado da Meta.
export async function publishContainer(
  instagramUserId: string,
  containerId: string,
  accessToken: string
): Promise<PublishResult> {
  const params = new URLSearchParams({ creation_id: containerId, access_token: accessToken })
  const res = await fetch(`${IG_GRAPH_BASE}/${instagramUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao publicar mídia (status ${res.status}): ${body.slice(0, 300)}`)
  }
  const data = await res.json()
  if (!data.id) {
    throw new Error('Resposta inesperada do Instagram ao publicar mídia (sem id).')
  }
  return { instagramMediaId: data.id }
}

// Espera o container ficar FINISHED antes de publicar — em polling porque a
// Meta processa o vídeo de forma assíncrona depois do createReelsContainer.
// Lança se: der ERROR/EXPIRED, ou não ficar pronto dentro do timeout.
export async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  { timeoutMs = 2 * 60 * 1000, pollIntervalMs = 5000 }: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { statusCode, statusText } = await getContainerStatus(containerId, accessToken)
    if (statusCode === 'FINISHED') return
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Container de mídia falhou no processamento: ${statusCode}${statusText ? ` (${statusText})` : ''}`)
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
  throw new Error(`Timeout esperando o container de mídia ficar pronto (${Math.round(timeoutMs / 1000)}s)`)
}
