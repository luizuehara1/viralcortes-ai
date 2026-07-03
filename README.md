# ViralCortes AI

SaaS para gerar cortes automáticos de lives longas (até 24 horas) com IA.

## Stack

- **Frontend/Backend**: Next.js 14 (App Router) + TypeScript + TailwindCSS
- **Banco de dados**: PostgreSQL + Prisma ORM
- **Autenticação**: NextAuth.js (credentials)
- **Processamento de vídeo**: FFmpeg (fluent-ffmpeg)
- **Transcrição**: OpenAI Whisper API
- **IA (análise de cortes)**: Anthropic Claude API
- **Fila de processamento**: BullMQ + Redis
- **Storage**: Local (MVP) → S3/R2 (produção)

---

## Pré-requisitos

1. **Node.js 18+** — [nodejs.org](https://nodejs.org)
2. **PostgreSQL** — [postgresql.org](https://www.postgresql.org/download)
3. **Redis** — [redis.io](https://redis.io/download) ou via Docker
4. **FFmpeg** — instalado e no PATH do sistema

### Instalando FFmpeg

**Windows:**
```powershell
winget install Gyan.FFmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Ubuntu/Debian:**
```bash
sudo apt update && sudo apt install ffmpeg
```

### Redis via Docker (recomendado)

```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

---

## Instalação

### 1. Clone e instale as dependências

```bash
git clone <repo>
cd viralcortes-ai
npm install
```

### 2. Configure as variáveis de ambiente

```bash
cp .env.example .env
```

Edite `.env` com suas credenciais:

```env
# PostgreSQL
DATABASE_URL="postgresql://user:senha@localhost:5432/viralcortes"

# NextAuth — gere com: openssl rand -base64 32
NEXTAUTH_SECRET="chave-super-secreta-minimo-32-chars"
NEXTAUTH_URL="http://localhost:3000"

# Anthropic (Claude) — https://console.anthropic.com
ANTHROPIC_API_KEY="sk-ant-..."

# OpenAI (Whisper) — https://platform.openai.com
OPENAI_API_KEY="sk-..."

# Redis
REDIS_URL="redis://localhost:6379"
```

### 3. Configure o banco de dados

```bash
# Gera o Prisma Client
npm run db:generate

# Cria as tabelas no banco
npm run db:push
```

### 4. Crie as pastas de upload (já criadas, mas confirme)

```bash
mkdir -p uploads clips
```

---

## Rodando o projeto

O projeto precisa de **dois processos** rodando simultaneamente:

### Terminal 1 — Servidor Next.js

```bash
npm run dev
```

Acesse: http://localhost:3000

### Terminal 2 — Worker de processamento (BullMQ)

```bash
npm run worker
```

O worker processa os vídeos em background:
- Extrai áudio com FFmpeg
- Transcreve com Whisper
- Analisa com Claude AI
- Renderiza os cortes

---

## Fluxo completo do MVP

1. Acesse http://localhost:3000 e crie uma conta
2. Crie um novo projeto
3. Faça upload de um vídeo (MP4, MOV, MKV, WEBM — até 10GB)
4. Acompanhe o status em tempo real:
   - **Extraindo áudio** → FFmpeg extrai áudio em MP3 mono 16kHz
   - **Transcrevendo** → Whisper API gera transcript com timestamps
   - **Analisando** → Claude AI identifica os melhores cortes virais
5. Veja a lista de cortes rankeados por pontuação viral (0–100)
6. Clique em **Gerar corte 9:16** em cada clip desejado
7. O worker renderiza com FFmpeg (legenda + formato vertical)
8. Baixe os cortes prontos

---

## Estrutura de arquivos

```
viralcortes-ai/
├── prisma/
│   └── schema.prisma          # Modelos do banco
├── src/
│   ├── app/                   # Next.js App Router
│   │   ├── (auth)/           # Login e registro
│   │   ├── (dashboard)/      # Dashboard, projetos
│   │   └── api/              # API Routes
│   ├── components/            # Componentes React
│   ├── lib/                   # Utilitários
│   │   ├── auth.ts           # NextAuth config
│   │   ├── prisma.ts         # Prisma client singleton
│   │   ├── queue.ts          # BullMQ queues
│   │   ├── ffmpeg.ts         # FFmpeg utilities
│   │   ├── transcription.ts  # Whisper API
│   │   ├── ai-analyzer.ts    # Claude AI analysis
│   │   └── utils.ts          # Helpers
│   ├── workers/              # Workers BullMQ
│   │   ├── video-processor.ts # Processamento principal
│   │   └── clip-renderer.ts  # Renderização de cortes
│   ├── types/index.ts        # TypeScript types
│   └── worker.ts             # Entry point do worker
├── uploads/                  # Vídeos enviados
├── clips/                    # Cortes renderizados
└── .env                      # Variáveis de ambiente
```

---

## Configurações avançadas

### Processamento de lives de 24h

Vídeos acima de 25MB de áudio são processados em chunks de 15 min automaticamente.
Configure o tamanho do chunk em `src/workers/video-processor.ts`:

```typescript
const CHUNK_DURATION = 900 // segundos (15 min)
```

### Limite de upload

Por padrão: 10GB. Altere em `.env`:

```env
MAX_UPLOAD_SIZE=10737418240  # bytes
```

### BullMQ Dashboard (monitoramento das filas)

Instale o Bull Board para visualizar as filas:

```bash
npm install @bull-board/express @bull-board/api
```

### Redis em produção

Use Redis Cloud, Upstash ou Railway Redis. Apenas atualize `REDIS_URL`.

---

## Deploy

### Frontend (Vercel)

```bash
npm install -g vercel
vercel
```

Variáveis de ambiente obrigatórias no Vercel:
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `REDIS_URL`

**Atenção**: O worker NÃO roda na Vercel (serverless). Use Railway, Fly.io ou Render para o worker.

### Worker (Railway)

1. Crie um novo serviço no Railway
2. Use o mesmo repositório
3. Start command: `npm run worker`
4. Adicione as mesmas variáveis de ambiente

### Storage em produção

Substitua o storage local por AWS S3 ou Cloudflare R2.
Atualize `src/lib/storage.ts` e as referências a `filePath`.

---

## Roadmap (pós-MVP)

- [ ] Link de YouTube/Twitch (yt-dlp para conteúdo autorizado)
- [ ] Publicação automática (TikTok, Instagram, YouTube)
- [ ] Auto-crop com detecção de rosto (MediaPipe)
- [ ] Templates de legenda estilo CapCut
- [ ] Sistema de créditos + pagamento (Stripe)
- [ ] Fila de processamento paralelo
- [ ] Dashboard de analytics
- [ ] Edição inline do corte (trim, caption)

---

## Segurança e uso responsável

Este app processa **apenas conteúdo próprio ou com autorização do criador**.

- Não processe conteúdo protegido por DRM
- Não contorne sistemas de login ou paywall
- Não use para violar direitos autorais
- Cada usuário é responsável pelo conteúdo que envia
