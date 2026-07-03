import Link from 'next/link'
import { Scissors } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Política de Privacidade — ViralCortes AI',
  description: 'Política de Privacidade do ViralCortes AI.',
}

export default function PrivacyPage() {
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
        <h1 className="text-4xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-white/40 text-sm mb-12">Última atualização: 3 de julho de 2026</p>

        <div className="space-y-10 text-white/70 leading-relaxed [&_h2]:text-white [&_h2]:font-semibold [&_h2]:text-xl [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_li]:pl-1">
          <section>
            <p>
              Esta Política de Privacidade explica quais dados o ViralCortes AI coleta, como
              usamos, com quem compartilhamos e quais direitos você tem sobre eles, em conformidade
              com a Lei Geral de Proteção de Dados (LGPD).
            </p>
          </section>

          <section>
            <h2>1. Dados que coletamos</h2>
            <p>
              <strong className="text-white/85">Dados de cadastro:</strong> nome, e-mail e senha
              (armazenada com hash, nunca em texto puro).
            </p>
            <p>
              <strong className="text-white/85">Conteúdo enviado por você:</strong> vídeos ou lives
              enviados por upload ou importados por link, o áudio extraído, a transcrição gerada e os
              cortes produzidos.
            </p>
            <p>
              <strong className="text-white/85">Dados de contas conectadas:</strong> quando você conecta
              sua conta do YouTube, Instagram (via Meta) ou TikTok, armazenamos o identificador da
              conta/canal, nome de exibição, foto/avatar público e os tokens de acesso OAuth
              necessários para operar a integração. Os tokens são <strong className="text-white/85">
              cifrados em repouso</strong> (AES-256-GCM) e nunca são exibidos em texto puro, nem por
              nós nem por terceiros.
            </p>
            <p>
              <strong className="text-white/85">Dados de uso:</strong> registros técnicos de
              processamento (status de jobs, erros, progresso de renderização) usados para operar e
              dar suporte ao serviço.
            </p>
          </section>

          <section>
            <h2>2. Como usamos seus dados</h2>
            <ul>
              <li>Processar o vídeo enviado: extração de áudio, transcrição e detecção de cortes com potencial viral;</li>
              <li>Renderizar os cortes solicitados, incluindo legendas, textos e efeitos aplicados por você no editor;</li>
              <li>Exibir informações da sua conta conectada (ex.: nome do canal do YouTube, @usuário do Instagram) e permitir testar a conexão;</li>
              <li>Publicar conteúdo em suas redes conectadas, mas <strong className="text-white/85">apenas quando você aciona essa ação explicitamente</strong> — nunca de forma automática ou sem sua ciência;</li>
              <li>Comunicação sobre o funcionamento da conta e do serviço.</li>
            </ul>
            <p>Não vendemos seus dados pessoais a terceiros.</p>
          </section>

          <section>
            <h2>3. Compartilhamento com terceiros</h2>
            <p>Para operar o serviço, processamos dados através dos seguintes provedores:</p>
            <ul>
              <li><strong className="text-white/85">OpenAI (Whisper)</strong> — transcrição de áudio;</li>
              <li><strong className="text-white/85">Anthropic (Claude)</strong> — análise da transcrição para identificar trechos virais;</li>
              <li><strong className="text-white/85">Google / YouTube Data API</strong> — quando você conecta sua conta do YouTube;</li>
              <li><strong className="text-white/85">Meta Graph API (Facebook/Instagram)</strong> — quando você conecta sua conta do Instagram;</li>
              <li><strong className="text-white/85">TikTok API</strong> — quando você conecta sua conta do TikTok;</li>
              <li>Provedores de infraestrutura (hospedagem, banco de dados PostgreSQL e fila de processamento) usados para operar a plataforma.</li>
            </ul>
            <p>
              Cada um desses provedores tem sua própria política de privacidade, e recebe apenas os
              dados estritamente necessários para a função que exercem (ex.: a OpenAI recebe o áudio a
              transcrever, não seus dados de conta).
            </p>
          </section>

          <section>
            <h2>4. Retenção e exclusão de dados</h2>
            <p>
              Mantemos seus vídeos, transcrições e cortes enquanto sua conta estiver ativa, para que
              você possa acessá-los quando quiser. Você pode excluir projetos e vídeos a qualquer
              momento pela própria interface. Ao desconectar uma conta social (YouTube/Instagram/TikTok)
              pela tela de Integrações, os tokens de acesso correspondentes são removidos do nosso
              banco de dados imediatamente.
            </p>
            <p>
              Para solicitar a exclusão completa da sua conta e de todos os dados associados, entre em
              contato pelo e-mail abaixo.
            </p>
          </section>

          <section>
            <h2>5. Segurança</h2>
            <p>
              Senhas são armazenadas com hash (bcrypt); tokens de acesso a redes sociais conectadas são
              cifrados em repouso (AES-256-GCM); a comunicação com a plataforma é feita via HTTPS.
              Nenhum sistema é 100% livre de risco, mas adotamos práticas de segurança adequadas ao
              tipo de dado que tratamos.
            </p>
          </section>

          <section>
            <h2>6. Seus direitos (LGPD)</h2>
            <p>Você pode, a qualquer momento, solicitar:</p>
            <ul>
              <li>confirmação de quais dados seus tratamos e acesso a eles;</li>
              <li>correção de dados incompletos ou desatualizados;</li>
              <li>exclusão dos seus dados pessoais, observadas obrigações legais de retenção;</li>
              <li>revogação do consentimento dado a integrações (YouTube/Instagram/TikTok), a qualquer momento, pela tela de Integrações ou diretamente nas configurações da sua conta Google/Meta/TikTok.</li>
            </ul>
          </section>

          <section>
            <h2>7. Cookies e sessão</h2>
            <p>
              Usamos um cookie de sessão (via NextAuth) estritamente necessário para manter você
              autenticado na plataforma. Não usamos cookies de rastreamento publicitário.
            </p>
          </section>

          <section>
            <h2>8. Menores de idade</h2>
            <p>
              O ViralCortes AI não é direcionado a menores de 18 anos e não coleta intencionalmente
              dados de menores.
            </p>
          </section>

          <section>
            <h2>9. Alterações nesta política</h2>
            <p>
              Podemos atualizar esta Política periodicamente. A data no topo desta página indica a
              versão mais recente. Mudanças relevantes serão comunicadas pela plataforma.
            </p>
          </section>

          <section>
            <h2>10. Contato</h2>
            <p>
              Dúvidas sobre esta Política ou solicitações relacionadas aos seus dados:{' '}
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
          <Link href="/terms" className="hover:text-white/50 transition-colors">
            Termos de Uso
          </Link>
        </p>
      </footer>
    </div>
  )
}
