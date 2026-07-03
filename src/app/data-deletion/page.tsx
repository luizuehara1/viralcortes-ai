import Link from 'next/link'
import { Scissors } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'User Data Deletion Instructions — ViralCortes AI',
  description: 'How to request deletion of your ViralCortes AI account data, connected social tokens and associated information.',
}

export default function DataDeletionPage() {
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
        <h1 className="text-4xl font-bold mb-2">User Data Deletion Instructions</h1>
        <p className="text-white/40 text-sm mb-12">Last updated: July 3, 2026</p>

        <div className="space-y-10 text-white/70 leading-relaxed [&_h2]:text-white [&_h2]:font-semibold [&_h2]:text-xl [&_h2]:mb-3 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_li]:pl-1">
          <section>
            <p>
              You can request deletion of your ViralCortes AI account and all associated data at
              any time, including data originating from connected social platforms (YouTube,
              Instagram/Meta, TikTok).
            </p>
          </section>

          <section>
            <h2>1. What gets deleted</h2>
            <p>When you request account deletion, we permanently remove:</p>
            <ul>
              <li>Your account profile (name, e-mail, password hash);</li>
              <li>All projects, uploaded/imported videos, transcripts and generated clips;</li>
              <li>
                Connected social accounts and their OAuth tokens (YouTube, Instagram/Meta, TikTok) —
                access and refresh tokens are deleted, not just disconnected;
              </li>
              <li>Any processing job history and metadata tied to your account.</li>
            </ul>
          </section>

          <section>
            <h2>2. How to request deletion</h2>
            <p>
              Send an e-mail to{' '}
              <a href="mailto:contato@viralcortes.ai" className="text-violet-400 hover:text-violet-300">
                contato@viralcortes.ai
              </a>{' '}
              from the e-mail address associated with your account, with the subject{' '}
              <strong className="text-white/85">&quot;Data Deletion Request&quot;</strong>. Include the
              e-mail address (or, if you signed in with a connected platform, the account/channel
              name) you used to sign up, so we can locate your account.
            </p>
            <p>
              You can also disconnect an individual social account (YouTube/Instagram/TikTok) at
              any time from the Integrations page in the app — this immediately removes the stored
              OAuth tokens for that platform without deleting your whole account.
            </p>
          </section>

          <section>
            <h2>3. What happens next</h2>
            <p>
              We confirm your request by e-mail and complete the deletion within 30 days. Some
              minimal records may be retained for a limited period where required by law (e.g. tax
              or billing records), but nothing related to your content, transcripts, clips or social
              tokens is kept.
            </p>
          </section>

          <section>
            <h2>4. Revoking platform access directly</h2>
            <p>
              In addition to requesting deletion here, you can revoke ViralCortes AI&apos;s access
              directly from each platform at any time:
            </p>
            <ul>
              <li>
                Google/YouTube:{' '}
                <span className="text-white/85">myaccount.google.com/permissions</span>
              </li>
              <li>
                Meta/Instagram:{' '}
                <span className="text-white/85">
                  Facebook Settings → Business Integrations
                </span>
              </li>
            </ul>
          </section>

          <section>
            <h2>5. Contact</h2>
            <p>
              Questions about this process or your data:{' '}
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
            Privacy Policy
          </Link>{' '}
          ·{' '}
          <Link href="/terms" className="hover:text-white/50 transition-colors">
            Terms of Use
          </Link>
        </p>
      </footer>
    </div>
  )
}
