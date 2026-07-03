// Script standalone que roda no PC do dono (fora do Railway) — fica de olho
// na fila de vídeos que o servidor não conseguiu baixar sozinho (bloqueio
// anti-bot de plataformas como Kick), baixa usando os cookies do navegador
// já logado nesse PC, e devolve o arquivo pronto pro servidor continuar o
// processamento normal (transcrição, cortes).
//
// Não usa nenhum pacote externo — só Node.js (20+) e o yt-dlp instalado
// nesse computador. Rodar com: node download-worker.js

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const configPath = path.join(__dirname, 'config.json')
if (!fs.existsSync(configPath)) {
  console.error('config.json não encontrado. Copie config.example.json para config.json e preencha os valores.')
  process.exit(1)
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))

const SERVER_URL = config.serverUrl?.replace(/\/$/, '')
const TOKEN = config.token
const YTDLP_PATH = config.ytDlpPath || 'yt-dlp'
const BROWSER = config.browser || 'chrome'
const POLL_INTERVAL_MS = config.pollIntervalMs || 15000

if (!SERVER_URL || !TOKEN || TOKEN.includes('cole aqui')) {
  console.error('Preencha serverUrl e token em config.json antes de rodar.')
  process.exit(1)
}

function authHeaders(extra = {}) {
  return { Authorization: `Bearer ${TOKEN}`, ...extra }
}

async function fetchNextJob() {
  const res = await fetch(`${SERVER_URL}/api/local-downloader/next`, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Falha ao buscar próximo vídeo (HTTP ${res.status})`)
  const body = await res.json()
  return body.job
}

function runYtDlp(url, outputTemplate) {
  return new Promise((resolve, reject) => {
    const args = [
      '-f', 'bestvideo+bestaudio/best',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--cookies-from-browser', BROWSER,
      '--print', 'after_move:filepath',
      '-o', outputTemplate,
      url,
    ]
    const proc = spawn(YTDLP_PATH, args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => { stdout += d; process.stdout.write(d) })
    proc.stderr.on('data', (d) => { stderr += d; process.stderr.write(d) })
    proc.on('error', (err) => reject(new Error(`Não foi possível executar o yt-dlp: ${err.message}`)))
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `yt-dlp encerrou com código ${code}`))
        return
      }
      const lines = stdout.trim().split('\n').filter(Boolean)
      const filePath = lines[lines.length - 1]?.trim()
      if (!filePath || !fs.existsSync(filePath)) {
        reject(new Error('yt-dlp não gerou um arquivo de vídeo válido'))
        return
      }
      resolve(filePath)
    })
  })
}

async function uploadResult(sourceVideoId, filePath) {
  // fs.openAsBlob evita carregar o arquivo inteiro na memória — ele
  // transmite direto do disco, importante já que lives podem ser vídeos
  // bem grandes.
  const blob = await fs.openAsBlob(filePath)
  const formData = new FormData()
  formData.append('sourceVideoId', sourceVideoId)
  formData.append('file', blob, path.basename(filePath))

  const res = await fetch(`${SERVER_URL}/api/local-downloader/complete`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error || `Falha ao enviar o vídeo de volta (HTTP ${res.status})`)
  }
}

async function reportFailure(sourceVideoId, message) {
  await fetch(`${SERVER_URL}/api/local-downloader/fail`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sourceVideoId, error: message }),
  }).catch(() => {})
}

async function processJob(job) {
  console.log(`\n[downloader] Baixando "${job.title}" (${job.platform}) — ${job.sourceUrl}`)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'viralcortes-'))
  const outputTemplate = path.join(tempDir, 'video.%(ext)s')
  try {
    const filePath = await runYtDlp(job.sourceUrl, outputTemplate)
    console.log(`[downloader] Download concluído: ${filePath} — enviando para o servidor...`)
    await uploadResult(job.sourceVideoId, filePath)
    console.log('[downloader] Enviado com sucesso! O processamento normal continua no servidor.')
  } catch (err) {
    console.error(`[downloader] Falhou: ${err.message}`)
    await reportFailure(job.sourceVideoId, err.message)
  } finally {
    fs.rm(tempDir, { recursive: true, force: true }, () => {})
  }
}

async function loop() {
  console.log(`[downloader] Conectado a ${SERVER_URL} — verificando a cada ${POLL_INTERVAL_MS / 1000}s.`)
  for (;;) {
    try {
      const job = await fetchNextJob()
      if (job) {
        await processJob(job)
        continue // checa de novo na hora, pode ter mais na fila
      }
    } catch (err) {
      console.error(`[downloader] Erro ao verificar a fila: ${err.message}`)
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
}

loop()
