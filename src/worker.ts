import 'dotenv/config'
import { createVideoWorker } from './workers/video-processor'
import { createClipWorker } from './workers/clip-renderer'
import { createImportWorker } from './workers/video-importer'

console.log('🚀 ViralCortes AI Worker iniciando...')

const videoWorker = createVideoWorker()
const clipWorker = createClipWorker()
const importWorker = createImportWorker()

console.log('✅ Workers ativos: video-processing, clip-rendering, video-import')

const shutdown = async () => {
  console.log('Encerrando workers...')
  await videoWorker.close()
  await clipWorker.close()
  await importWorker.close()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
