import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'

interface Props {
  backHref: string
  backLabel: string
}

// Mostrado quando o registro existe no banco mas o arquivo já não existe
// mais em disco — hoje uploads/clips/templates ficam em armazenamento local
// do container (efêmero no Railway: reinício/redeploy pode apagar o
// disco), então uma linha no banco pode sobreviver ao arquivo que ela
// aponta. Isso evita a experiência confusa de "player preto" + erro só ao
// tentar gerar legenda.
export function MediaMissingNotice({ backHref, backLabel }: Props) {
  return (
    <div className="max-w-lg mx-auto animate-in">
      <div className="glass rounded-2xl p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-500/15 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-amber-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold mb-1">Vídeo não está mais disponível</h1>
          <p className="text-sm text-white/50 leading-relaxed">
            O arquivo desse resultado não foi encontrado no servidor. Isso costuma acontecer quando o
            servidor reinicia depois que o vídeo foi gerado — o armazenamento usado hoje é local ao
            container, não permanente. Gere o resultado novamente para poder editar/legendar.
          </p>
        </div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </Link>
      </div>
    </div>
  )
}
