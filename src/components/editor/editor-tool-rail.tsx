'use client'

interface Tool {
  id: string
  icon: React.ReactNode
  label: string
}

interface Props {
  tools: Tool[]
  active: string
  onSelect: (id: string) => void
}

// Faixa vertical de ferramentas à esquerda do editor (estilo CapCut) — troca
// a barra horizontal de abas de cima do painel por ícones empilhados. Mesma
// ideia do TabButton (seleciona uma aba/painel), só que em coluna e com o
// rótulo embaixo do ícone em vez de do lado.
export function EditorToolRail({ tools, active, onSelect }: Props) {
  return (
    <div className="glass rounded-2xl p-1.5 flex flex-col gap-1 h-fit">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => onSelect(tool.id)}
          className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl text-[10px] font-medium transition-all duration-200 ${
            active === tool.id ? 'bg-gradient-brand text-white shadow-brand' : 'text-white/50 hover:text-white/80 hover:bg-white/5'
          }`}
        >
          {tool.icon}
          <span className="leading-none text-center">{tool.label}</span>
        </button>
      ))}
    </div>
  )
}
