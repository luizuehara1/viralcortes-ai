import { spawn } from 'child_process'
import fs from 'fs'

const YTDLP_PATH = process.env.YTDLP_PATH || 'yt-dlp'

function runYtDlp(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn(YTDLP_PATH, args)
    } catch (err: any) {
      reject(new Error(`Não foi possível executar o yt-dlp: ${err.message}`))
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      proc.kill('SIGKILL')
      reject(new Error(`yt-dlp não respondeu em ${Math.round(timeoutMs / 1000)}s (timeout)`))
    }, timeoutMs)

    proc.stdout?.on('data', (d) => { stdout += d })
    proc.stderr?.on('data', (d) => { stderr += d })

    proc.on('error', (err: any) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err.code === 'ENOENT') {
        reject(new Error('yt-dlp não está instalado ou não foi encontrado no PATH. Configure YTDLP_PATH no .env.'))
      } else {
        reject(new Error(`Falha ao executar yt-dlp: ${err.message}`))
      }
    })

    proc.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        // yt-dlp's stderr is already a clean, user-presentable one-liner in
        // the common cases ("The channel is not currently live", "Unable to
        // download webpage: HTTP Error 404", "Unsupported URL", ...).
        const clean = stderr.trim().replace(/^ERROR:\s*(\[[^\]]+\]\s*)?/i, '') || `yt-dlp encerrou com código ${code}`
        reject(new Error(clean))
        return
      }
      resolve(stdout)
    })
  })
}

export interface YtDlpMetadata {
  id: string
  title: string
  duration: number | null
  thumbnail: string | null
  isLive: boolean
}

/** Metadata-only lookup (no download) — bounded timeout so "Validar link" never hangs the request forever. */
export async function fetchMetadata(url: string, timeoutMs = 30_000): Promise<YtDlpMetadata> {
  const stdout = await runYtDlp(['--dump-json', '--no-playlist', '--no-warnings', '--socket-timeout', '20', url], timeoutMs)
  const firstLine = stdout.trim().split('\n')[0]
  if (!firstLine) throw new Error('yt-dlp não retornou informações sobre esse link')

  let data: any
  try {
    data = JSON.parse(firstLine)
  } catch {
    throw new Error('yt-dlp retornou uma resposta inesperada para esse link')
  }

  return {
    id: data.id,
    title: data.title || 'Vídeo sem título',
    duration: typeof data.duration === 'number' ? data.duration : null,
    thumbnail: typeof data.thumbnail === 'string' ? data.thumbnail : null,
    isLive: !!data.is_live,
  }
}

const DEFAULT_DOWNLOAD_TIMEOUT_MS = 2 * 60 * 60 * 1000 // 2h — long lives can legitimately take a while

/**
 * Downloads a video (or captures an in-progress live) to outputTemplate
 * (e.g. "uploads/{id}/source.%(ext)s") and returns the actual final file
 * path yt-dlp wrote to — never assume the extension, some sources don't
 * need remuxing to mp4 and keep their native container.
 */
export async function downloadVideo(
  url: string,
  outputTemplate: string,
  timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS
): Promise<string> {
  const stdout = await runYtDlp(
    [
      '-f', 'bestvideo+bestaudio/best',
      '--merge-output-format', 'mp4',
      '--no-playlist',
      '--no-warnings',
      '--print', 'after_move:filepath',
      '-o', outputTemplate,
      url,
    ],
    timeoutMs
  )

  const lines = stdout.trim().split('\n').filter(Boolean)
  const filePath = lines[lines.length - 1]?.trim()
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error('yt-dlp não gerou um arquivo de vídeo válido')
  }
  return filePath
}
