// Rota "limpa" (sem caractere especial no path) que serve a assinatura de
// verificação do TikTok. A URL pública exigida pelo TikTok
// (/tiktok-developers-site-verification=...) tem um "=" literal no path, e
// o Next.js (nesta versão, self-hosted via `next start`) dá 400 pra qualquer
// rota do App Router — estática, dinâmica ou com o nome da pasta
// percent-encoded — assim que a URL de entrada tem um "=" literal, antes
// mesmo de casar com a rota. Por isso a URL pública é mapeada aqui via
// rewrite (next.config.mjs), que não passa por esse bug.
export async function GET() {
  return new Response(
    'tiktok-developers-site-verification=EZnVBtat59J9vN92LTS5rX8wwNnX7Wb5',
    {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  )
}
