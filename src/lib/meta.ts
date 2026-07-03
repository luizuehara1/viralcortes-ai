// OAuth da Meta (Facebook Login) + Graph API para localizar a conta do
// Instagram Business ligada a uma Página do Facebook. Via fetch puro, sem SDK.

import { prisma } from './prisma'
import { decrypt } from './crypto'

const GRAPH_VERSION = 'v19.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`
const FB_DIALOG_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`

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
  return `${FB_DIALOG_URL}?${params.toString()}`
}

interface MetaTokenResponse {
  access_token: string
  token_type: string
  expires_in?: number
}

export async function exchangeCodeForUserToken(code: string): Promise<MetaTokenResponse> {
  const env = requireMetaEnv()
  const params = new URLSearchParams({
    client_id: env.appId,
    client_secret: env.appSecret,
    redirect_uri: env.redirectUri,
    code,
  })
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao trocar code por token (status ${res.status}): ${body.slice(0, 200)}`)
  }
  return res.json()
}

// Troca o token de usuário de curta duração (~2h) por um de longa duração
// (~60 dias). Necessário para não pedir login de novo toda hora.
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<MetaTokenResponse> {
  const env = requireMetaEnv()
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: env.appId,
    client_secret: env.appSecret,
    fb_exchange_token: shortLivedToken,
  })
  const res = await fetch(`${GRAPH_BASE}/oauth/access_token?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao gerar token de longa duração (status ${res.status}): ${body.slice(0, 200)}`)
  }
  return res.json()
}

interface FacebookPage {
  id: string
  name: string
  access_token: string
}

export interface InstagramConnection {
  facebookPageId: string
  facebookPageName: string
  pageAccessToken: string
  instagramAccountId: string
  instagramUsername: string
  instagramProfilePicture: string | null
}

// Percorre as Páginas do Facebook administradas pelo usuário e retorna a
// primeira que tiver uma conta do Instagram Business vinculada. No cenário
// do usuário só existe uma página ("VIRA Cortes IA") ligada ao
// @hawkclipsofc, mas o código não assume isso — ele descobre dinamicamente.
export async function findConnectedInstagramAccount(userAccessToken: string): Promise<InstagramConnection> {
  const pagesRes = await fetch(
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(userAccessToken)}`
  )
  if (!pagesRes.ok) {
    const body = await pagesRes.text()
    throw new Error(`Falha ao listar Páginas do Facebook (status ${pagesRes.status}): ${body.slice(0, 200)}`)
  }
  const pagesData = await pagesRes.json()
  const pages: FacebookPage[] = pagesData.data ?? []

  if (pages.length === 0) {
    throw new Error(
      'Nenhuma Página do Facebook encontrada para esta conta. Confirme que você é administrador da Página "VIRA Cortes IA" e concedeu a permissão pages_show_list.'
    )
  }

  for (const page of pages) {
    const igRes = await fetch(
      `${GRAPH_BASE}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.access_token)}`
    )
    if (!igRes.ok) continue
    const igData = await igRes.json()
    const igAccountId: string | undefined = igData.instagram_business_account?.id
    if (!igAccountId) continue

    const igProfileRes = await fetch(
      `${GRAPH_BASE}/${igAccountId}?fields=username,profile_picture_url&access_token=${encodeURIComponent(page.access_token)}`
    )
    if (!igProfileRes.ok) {
      const body = await igProfileRes.text()
      throw new Error(`Falha ao buscar perfil do Instagram (status ${igProfileRes.status}): ${body.slice(0, 200)}`)
    }
    const igProfile = await igProfileRes.json()

    return {
      facebookPageId: page.id,
      facebookPageName: page.name,
      pageAccessToken: page.access_token,
      instagramAccountId: igAccountId,
      instagramUsername: igProfile.username ?? 'conta_instagram',
      instagramProfilePicture: igProfile.profile_picture_url ?? null,
    }
  }

  throw new Error(
    'Nenhuma das suas Páginas do Facebook tem uma conta do Instagram Business vinculada. Confirme a conexão em Configurações da Página → Instagram.'
  )
}

// Retorna o Page Access Token salvo (usado para chamar a Graph API em nome
// da conta do Instagram). Tokens de Página de longa duração não expiram
// enquanto o app não for revogado — não há refresh_token na Meta.
export async function getStoredPageAccessToken(userId: string): Promise<{ accessToken: string; instagramAccountId: string }> {
  const account = await prisma.socialAccount.findUnique({
    where: { userId_provider: { userId, provider: 'INSTAGRAM' } },
  })
  if (!account) {
    throw new Error('Nenhuma conta do Instagram conectada para este usuário.')
  }
  return { accessToken: decrypt(account.accessToken), instagramAccountId: account.providerAccountId }
}

export interface InstagramAccountInfo {
  username: string
  profilePictureUrl: string | null
  followersCount: number | null
  mediaCount: number | null
}

export async function fetchInstagramAccountInfo(instagramAccountId: string, pageAccessToken: string): Promise<InstagramAccountInfo> {
  const params = new URLSearchParams({
    fields: 'username,profile_picture_url,followers_count,media_count',
    access_token: pageAccessToken,
  })
  const res = await fetch(`${GRAPH_BASE}/${instagramAccountId}?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Falha ao consultar conta do Instagram (status ${res.status}): ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return {
    username: data.username ?? 'conta_instagram',
    profilePictureUrl: data.profile_picture_url ?? null,
    followersCount: data.followers_count ?? null,
    mediaCount: data.media_count ?? null,
  }
}
