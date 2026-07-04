import { Loader2 } from 'lucide-react'

interface Props {
  message?: string
  className?: string
}

export function LoadingState({ message = 'Carregando...', className = '' }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-12 text-white/40 ${className}`}>
      <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
