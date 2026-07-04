'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

interface Props {
  onClose?: () => void
  title?: string
  children: React.ReactNode
  maxWidth?: string
  closable?: boolean
  // Rodapé fixo (ex.: botões "Cancelar"/"Confirmar") que fica FORA da área
  // com scroll — sem isso, um modal com conteúdo longo (ex.: FormatPickerModal
  // com todas as opções de layout) empurra o botão de ação pra fora da vista
  // e o usuário precisa rolar pra achar. Opcional pra não afetar modais que
  // já cabem inteiros sem scroll.
  footer?: React.ReactNode
}

// Casca padrão de modal (backdrop + painel glass + botão de fechar) —
// substitui o backdrop/painel que cada modal (FormatPickerModal,
// ScheduleModal, ExportModal) reconstruía do zero com as mesmas classes.
//
// Renderizado via portal direto em document.body: sem isso, quando um modal
// é aberto a partir de um componente com `overflow-hidden` no ancestral (ex.:
// o card de corte, que usa overflow-hidden pro badge "TOP" não vazar dos
// cantos arredondados), o `position: fixed` NÃO escapa do clipping do
// ancestral — o overlay/botão final ficava cortado às vezes exatamente como
// se tivesse "sumido".
export function Modal({ onClose, title, children, maxWidth = 'max-w-md', closable = true, footer }: Props) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const node = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => e.target === e.currentTarget && closable && onClose?.()}
    >
      <div className={`glass rounded-2xl w-full ${maxWidth} border border-white/10 animate-scale-in max-h-[90vh] flex flex-col overflow-hidden`}>
        <div className="p-6 space-y-5 overflow-y-auto">
          {(title || closable) && (
            <div className="flex items-center justify-between">
              {title && <h2 className="font-semibold text-lg">{title}</h2>}
              {closable && (
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-white/8 text-white/40 hover:text-white transition-colors ml-auto"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          {children}
        </div>
        {footer && <div className="px-6 py-4 border-t border-white/10 shrink-0">{footer}</div>}
      </div>
    </div>
  )

  if (!mounted) return null
  return createPortal(node, document.body)
}
