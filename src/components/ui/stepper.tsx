import { Check } from 'lucide-react'

interface Step {
  label: string
}

interface Props {
  steps: Step[]
  currentStep: number // 0-indexed
}

// Indicador de progresso horizontal pro fluxo de "Novo projeto" (nome →
// origem do vídeo → importando) e outros fluxos multi-etapa — antes esses
// fluxos não tinham nenhum indicador visual de quantas etapas faltam.
export function Stepper({ steps, currentStep }: Props) {
  return (
    <div className="flex items-center w-full">
      {steps.map((step, i) => {
        const done = i < currentStep
        const active = i === currentStep
        return (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2.5 shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-colors ${
                  done
                    ? 'bg-gradient-brand text-white'
                    : active
                    ? 'border-2 border-violet-500 text-violet-400'
                    : 'border-2 border-white/15 text-white/30'
                }`}
              >
                {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <span className={`text-sm font-medium whitespace-nowrap hidden sm:inline ${active || done ? 'text-white' : 'text-white/30'}`}>
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-px flex-1 mx-3 transition-colors ${done ? 'bg-violet-500' : 'bg-white/10'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
