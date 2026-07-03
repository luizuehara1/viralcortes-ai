import Busboy from 'busboy'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import type { NextRequest } from 'next/server'

export interface ParsedFile {
  fieldName: string
  tempPath: string
  filename: string
  size: number
}

export interface ParsedMultipart {
  fields: Record<string, string>
  files: ParsedFile[]
}

/**
 * Streams a multipart/form-data request body directly to disk instead of
 * buffering it in memory (Next.js's built-in request.formData() breaks on
 * large uploads — see src/app/api/upload/route.ts for the same fix).
 */
export function parseMultipart(
  req: NextRequest,
  tempDir: string,
  opts: { maxFileSize?: number } = {}
): Promise<ParsedMultipart> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers.get('content-type') || ''
    const busboy = Busboy({
      headers: { 'content-type': contentType },
      limits: opts.maxFileSize ? { fileSize: opts.maxFileSize } : undefined,
    })

    fs.mkdirSync(tempDir, { recursive: true })
    const fields: Record<string, string> = {}
    const files: ParsedFile[] = []
    const pendingWrites: Promise<void>[] = []
    let sizeLimitHit = false
    let settled = false

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      busboy.destroy()
      for (const f of files) fs.rm(f.tempPath, { force: true }, () => {})
      reject(err)
    }

    busboy.on('field', (name, value) => {
      fields[name] = value
    })

    busboy.on('file', (name, fileStream, info) => {
      const tempPath = path.join(tempDir, `tmp-${uuidv4()}`)
      let size = 0
      fileStream.on('data', (chunk: Buffer) => {
        size += chunk.length
      })
      fileStream.on('limit', () => {
        sizeLimitHit = true
      })
      const writeStream = fs.createWriteStream(tempPath)
      const p = pipeline(fileStream, writeStream)
        .then(() => {
          if (!sizeLimitHit) files.push({ fieldName: name, tempPath, filename: info.filename || 'file', size })
        })
        .catch((err) => {
          if (!sizeLimitHit) fail(err)
        })
      pendingWrites.push(p)
    })

    busboy.on('close', async () => {
      if (settled) return
      try {
        await Promise.all(pendingWrites)
      } catch {
        return // fail() already rejected the promise
      }
      if (settled) return
      if (sizeLimitHit) {
        fail(new Error('Arquivo excede o tamanho máximo permitido'))
        return
      }
      settled = true
      resolve({ fields, files })
    })

    busboy.on('error', (err: any) => fail(err instanceof Error ? err : new Error(String(err))))

    if (!req.body) {
      fail(new Error('Corpo da requisição vazio'))
      return
    }

    const nodeStream = Readable.fromWeb(req.body as any)
    nodeStream.on('error', fail)
    nodeStream.pipe(busboy)
  })
}
