import Link from 'next/link'
import {
  Scissors, Zap, TrendingUp, Download, Clock, Star,
  ArrowRight, Play, CheckCircle2, Sparkles
} from 'lucide-react'

const features = [
  {
    icon: Zap,
    title: 'IA detecta os melhores momentos',
    desc: 'Claude AI analisa a transcrição e pontua cada trecho de 0 a 100 em potencial viral.',
  },
  {
    icon: Scissors,
    title: 'Cortes no formato original',
    desc: 'FFmpeg renderiza cada corte mantendo a proporção original do vídeo, sem cortar ou distorcer a imagem.',
  },
  {
    icon: TrendingUp,
    title: 'Legenda dinâmica inclusa',
    desc: 'Legendas estilo CapCut geradas automaticamente com o texto transcrito.',
  },
  {
    icon: Clock,
    title: 'Lives de até 24 horas',
    desc: 'Processamento em chunks — vídeos longos não travam o servidor.',
  },
  {
    icon: Download,
    title: 'Download imediato',
    desc: 'Baixe os cortes individualmente ou todos de uma vez em MP4.',
  },
  {
    icon: Star,
    title: 'Pontuação viral explicada',
    desc: 'Saiba por que cada corte tem potencial — emoção, hook e motivo detalhados.',
  },
]

const steps = [
  { n: '01', title: 'Envie o vídeo', desc: 'Faça upload direto ou cole um link autorizado.' },
  { n: '02', title: 'IA analisa', desc: 'Transcrição automática + Claude AI detecta os melhores momentos.' },
  { n: '03', title: 'Escolha os cortes', desc: 'Veja a lista rankeada por viralização e selecione o que quiser.' },
  { n: '04', title: 'Baixe prontos', desc: 'Cortes no formato original com legendas, prontos para postar.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-hidden">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">
              <span className="gradient-text">ViralCortes</span>{' '}
              <span className="text-white/50 font-normal">AI</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="text-sm text-white/60 hover:text-white transition-colors"
            >
              Entrar
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-medium transition-colors"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-20 px-6">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-violet-600/10 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/3 w-[400px] h-[300px] bg-purple-500/8 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass border border-violet-500/20 text-violet-300 text-sm mb-8">
            <Sparkles className="w-3.5 h-3.5" />
            Powered by Claude AI + Whisper
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] mb-6">
            Transforme sua live em{' '}
            <span className="gradient-text">cortes virais</span>{' '}
            automaticamente
          </h1>

          <p className="text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            Envie um vídeo ou live de até 24 horas. A IA transcreve, detecta os melhores momentos
            e gera cortes no formato original, sem distorcer, prontos para TikTok, Reels e Shorts.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold text-lg transition-all duration-200 glow-brand hover:scale-105"
            >
              Começar grátis
              <ArrowRight className="w-5 h-5" />
            </Link>
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl glass border border-white/10 font-medium text-lg hover:border-white/20 transition-all duration-200"
            >
              <Play className="w-5 h-5" />
              Ver demo
            </Link>
          </div>

          <p className="mt-6 text-sm text-white/30">
            10 cortes grátis para novos usuários · Sem cartão de crédito
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Como funciona</h2>
            <p className="text-white/50 text-lg">4 passos do upload ao viral</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step) => (
              <div key={step.n} className="relative glass rounded-2xl p-6">
                <span className="text-4xl font-bold text-violet-500/30 mb-4 block">{step.n}</span>
                <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Tudo que você precisa para viralizar
            </h2>
            <p className="text-white/50 text-lg">Sem edição manual. Sem horas desperdiçadas.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="glass-hover rounded-2xl p-6 group">
                <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center mb-4 group-hover:bg-violet-500/25 transition-colors">
                  <f.icon className="w-6 h-6 text-violet-400" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="glass rounded-3xl p-12 border border-violet-500/20 glow-brand">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Pronto para criar seu primeiro corte viral?
            </h2>
            <p className="text-white/50 text-lg mb-8">
              Comece com 10 cortes grátis. Sem cartão de crédito.
            </p>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-violet-600 hover:bg-violet-500 font-semibold text-lg transition-all duration-200 hover:scale-105"
            >
              Criar conta grátis
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-8 px-6 text-center space-y-2">
        <p className="text-white/30 text-sm">
          © 2026 ViralCortes AI · Apenas para conteúdo próprio ou com autorização.
        </p>
        <p className="text-white/30 text-sm">
          <Link href="/terms" className="hover:text-white/50 transition-colors">
            Termos de Uso
          </Link>
          {' · '}
          <Link href="/privacy" className="hover:text-white/50 transition-colors">
            Política de Privacidade
          </Link>
        </p>
      </footer>
    </div>
  )
}
