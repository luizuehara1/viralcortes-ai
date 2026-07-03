/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['fluent-ffmpeg', 'bullmq', 'ioredis'],
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  // A URL de verificação do TikTok tem um "=" literal no path, que quebra
  // (400) qualquer rota do App Router self-hosted. O rewrite mapeia a URL
  // pública pra uma rota interna sem caractere especial (sem mudar a URL
  // visível nem redirecionar) — ver src/app/api/tiktok-verify/route.ts.
  async rewrites() {
    return [
      {
        source: '/tiktok-developers-site-verification=EZnVBtat59J9vN92LTS5rX8wwNnX7Wb5',
        destination: '/api/tiktok-verify',
      },
    ]
  },
}

export default nextConfig
