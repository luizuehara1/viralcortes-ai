// URL pública canônica do app — usada para montar redirects de OAuth
// (YouTube/Meta) em vez de confiar em req.url. Atrás de um proxy reverso
// (Railway), req.url pode refletir o host/porta interno do container em
// vez do domínio público, o que já causou redirects quebrados para
// localhost em produção.
//
// Prioridade: APP_URL > NEXT_PUBLIC_APP_URL > NEXTAUTH_URL > fallback local.
// Em produção, nunca cai silenciosamente para localhost — se nenhuma env
// var estiver configurada (ou apontar pra localhost por engano), lança um
// erro claro em vez de gerar um redirect que não vai funcionar.
export function getAppUrl(): string {
  const candidate = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL
  const isLocalhost = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(url)

  if (candidate && !(process.env.NODE_ENV === 'production' && isLocalhost(candidate))) {
    return candidate.replace(/\/$/, '')
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'APP_URL/NEXT_PUBLIC_APP_URL/NEXTAUTH_URL não configurada corretamente em produção ' +
        '(ausente ou apontando para localhost). Configure o domínio público real no Railway.'
    )
  }

  return candidate || 'http://localhost:3000'
}
