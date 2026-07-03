import Link from 'next/link'
import { Scissors } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Termos de Uso — ViralCortes AI',
  description: 'Termos de Uso do ViralCortes AI.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <nav className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center">
              <Scissors className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">
              <span className="gradient-text">ViralCortes</span>{' '}
              <span className="text-white/50 font-normal">AI</span>
            </span>
          </Link>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-4xl font-bold mb-2">Termos de Uso</h1>
        <p className="text-white/40 text-sm mb-12">Última atualização: 3 de julho de 2026</p>

        <div className="space-y-10 text-white/70 leading-relaxed [&_h2]:text-white [&_h2]:font-semibold [&_h2]:text-xl [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_li]:pl-1">
          <section>
            <h2>1. Sobre o ViralCortes AI</h2>
            <p>
              O ViralCortes AI (&quot;nós&quot;, &quot;plataforma&quot; ou &quot;serviço&quot;) é uma ferramenta que
              recebe vídeos e lives enviados ou importados por você, transcreve o áudio,
              usa inteligência artificial para identificar trechos com potencial viral e gera
              cortes prontos para publicação em redes sociais como TikTok, Instagram e YouTube.
              Ao criar uma conta ou usar o serviço, você concorda com estes Termos de Uso.
            </p>
          </section>

          <section>
            <h2>2. Conta e cadastro</h2>
            <p>
              Para usar o ViralCortes AI você precisa criar uma conta com e-mail e senha.
              Você é responsável por manter suas credenciais em sigilo e por todas as atividades
              realizadas na sua conta. Contas novas recebem um número limitado de créditos gratuitos
              para uso do serviço; o consumo e a renovação de créditos podem ser ajustados conforme
              o plano contratado.
            </p>
          </section>

          <section>
            <h2>3. Conteúdo enviado por você</h2>
            <p>
              Você é o único responsável pelos vídeos que envia ou importa (upload direto ou link de
              plataformas como YouTube, Twitch, Kick, TikTok, Instagram ou Facebook), e declara que:
            </p>
            <ul>
              <li>é o titular dos direitos sobre o conteúdo, ou possui autorização para usá-lo e processá-lo;</li>
              <li>o conteúdo não viola direitos autorais, de imagem ou de terceiros;</li>
              <li>o conteúdo não é ilegal, difamatório, discriminatório ou prejudicial.</li>
            </ul>
            <p>
              O ViralCortes AI não analisa manualmente cada vídeo antes do processamento e não se
              responsabiliza pelo conteúdo enviado por usuários. Reservamo-nos o direito de suspender
              contas que violem estes termos.
            </p>
          </section>

          <section>
            <h2>4. Processamento por Inteligência Artificial</h2>
            <p>
              A transcrição de áudio é realizada por serviços de terceiros (Whisper, da OpenAI) e a
              análise de trechos virais é realizada por modelos de linguagem de terceiros (Claude, da
              Anthropic). Esses provedores processam o conteúdo exclusivamente para gerar o resultado
              solicitado por você — veja detalhes na nossa{' '}
              <Link href="/privacy" className="text-violet-400 hover:text-violet-300">
                Política de Privacidade
              </Link>
              . A qualidade das legendas, cortes sugeridos e pontuação viral é gerada automaticamente
              e pode conter imprecisões; a decisão final sobre o que publicar é sempre sua.
            </p>
          </section>

          <section>
            <h2>5. Conexão com redes sociais (YouTube, Instagram, TikTok)</h2>
            <p>
              O ViralCortes AI permite conectar sua conta do YouTube e/ou Instagram (via Meta) para
              consultar informações do seu canal/perfil e, quando essa funcionalidade estiver
              disponível, publicar cortes diretamente. Ao conectar uma conta:
            </p>
            <ul>
              <li>você autoriza explicitamente o acesso via OAuth, com o escopo mostrado na tela de autorização da própria plataforma (Google/Meta/TikTok);</li>
              <li>nenhuma publicação é feita sem uma ação explícita sua — conectar a conta não publica nada automaticamente;</li>
              <li>você pode desconectar a qualquer momento pela tela de Integrações, revogando o acesso do ViralCortes AI aos seus dados.</li>
            </ul>
          </section>

          <section>
            <h2>6. Uso aceitável</h2>
            <p>Você concorda em não usar o ViralCortes AI para:</p>
            <ul>
              <li>processar conteúdo sem autorização do titular dos direitos;</li>
              <li>tentar contornar limites técnicos, de créditos ou de segurança da plataforma;</li>
              <li>enviar vírus, malware ou qualquer código malicioso;</li>
              <li>fazer engenharia reversa ou uso indevido das integrações com YouTube, Meta ou TikTok.</li>
            </ul>
          </section>

          <section>
            <h2>7. Isenção de garantias e limitação de responsabilidade</h2>
            <p>
              O serviço é fornecido &quot;como está&quot;, sem garantias de disponibilidade ininterrupta,
              ausência de erros ou adequação a uma finalidade específica. Na máxima extensão permitida
              por lei, o ViralCortes AI não se responsabiliza por danos indiretos, perda de dados ou
              lucros cessantes decorrentes do uso do serviço.
            </p>
          </section>

          <section>
            <h2>8. Encerramento de conta</h2>
            <p>
              Você pode encerrar sua conta a qualquer momento. Podemos suspender ou encerrar contas
              que violem estes Termos, mediante aviso quando razoavelmente possível.
            </p>
          </section>

          <section>
            <h2>9. Alterações nestes termos</h2>
            <p>
              Podemos atualizar estes Termos periodicamente. Alterações relevantes serão comunicadas
              através da plataforma. O uso continuado do serviço após uma alteração implica aceite dos
              novos termos.
            </p>
          </section>

          <section>
            <h2>10. Contato</h2>
            <p>
              Dúvidas sobre estes Termos? Fale com a gente em{' '}
              <a href="mailto:contato@viralcortes.ai" className="text-violet-400 hover:text-violet-300">
                contato@viralcortes.ai
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-white/5 py-8 px-6 text-center">
        <p className="text-white/30 text-sm">
          © 2026 ViralCortes AI ·{' '}
          <Link href="/privacy" className="hover:text-white/50 transition-colors">
            Política de Privacidade
          </Link>
        </p>
      </footer>
    </div>
  )
}
