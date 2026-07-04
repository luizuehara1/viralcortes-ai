import { AlertTriangle } from 'lucide-react'
import { Button } from './button'

interface Props {
  title?: string
  message: string
  onRetry?: () => void
}

// Estado de erro padrão — mensagens de erro no app hoje são divs vermelhas
// soltas com texto cru; isso dá um pouco mais de estrutura (título + ação
// de tentar de novo) sem exigir reescrever cada chamador.
export function ErrorState({ title = 'Algo deu errado', message, onRetry }: Props) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-red-400/70 mt-0.5">{message}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
            Tentar de novo
          </Button>
        )}
      </div>
    </div>
  )
}
