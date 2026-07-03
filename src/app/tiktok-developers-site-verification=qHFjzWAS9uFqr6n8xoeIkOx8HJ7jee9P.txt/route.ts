// Verificação de domínio do TikTok Developers — texto puro, sem layout do
// app, sem autenticação (não há middleware.ts no projeto, então nada
// intercepta esta rota).
export async function GET() {
  return new Response(
    'tiktok-developers-site-verification=qHFjzWAS9uFqr6n8xoeIkOx8HJ7jee9P',
    {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  )
}
