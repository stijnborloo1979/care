import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import { tt } from '../../lib/uiTaal'

export const MIN_LENGTE = 8

/** Nagaan voor het naar Supabase gaat; geeft een zin terug of null. */
export function controleerWachtwoord(nieuw: string, herhaal: string): string | null {
  if (nieuw.length < MIN_LENGTE) return tt('Kies minstens {n} tekens.', { n: MIN_LENGTE })
  if (nieuw !== herhaal) return tt('De twee wachtwoorden zijn niet gelijk.')
  return null
}

function vertaal(err: unknown): string {
  const b = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : ''
  if (b.includes('different from the old')) return tt('Dat is al je wachtwoord. Kies een ander.')
  if (b.includes('reauthentication') || b.includes('nonce'))
    return tt('Log voor de zekerheid opnieuw in met een code uit je mail, en probeer het dan nog eens.')
  if (b.toLowerCase().includes('weak') || b.toLowerCase().includes('password should'))
    return tt('Dit wachtwoord is te zwak. Maak het langer, of meng letters, cijfers en tekens.')
  return b || tt('Er ging iets mis. Probeer het opnieuw.')
}

/**
 * Mijn account: wie inlogde met een code of een link uit de mail, kan hier
 * een wachtwoord kiezen. Daarna kan hij op elk toestel inloggen zonder mail.
 */
export default function Account() {
  const { session, signOut } = useAuth()
  const navigate = useNavigate()
  const [nieuw, setNieuw] = useState('')
  const [herhaal, setHerhaal] = useState('')
  const [busy, setBusy] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [klaar, setKlaar] = useState(false)

  async function bewaar(e: React.FormEvent) {
    e.preventDefault()
    const probleem = controleerWachtwoord(nieuw, herhaal)
    if (probleem) {
      setFout(probleem)
      return
    }
    setBusy(true)
    setFout(null)
    try {
      const { error } = await supabase.auth.updateUser({ password: nieuw })
      if (error) throw error
      setKlaar(true)
      setNieuw('')
      setHerhaal('')
    } catch (err) {
      setFout(vertaal(err))
    } finally {
      setBusy(false)
    }
  }

  const veld =
    'mt-1 block min-h-touch w-full rounded-2xl border border-line-strong bg-surface px-4 text-lg focus:border-accent-ink focus:outline-none'

  return (
    <main className="mx-auto max-w-[32rem] px-5 py-10">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-2 font-semibold text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={18} strokeWidth={1.75} aria-hidden="true" />
        {tt('Terug')}
      </button>

      <div className="rounded-card border border-line bg-surface p-6 shadow-card">
        <h1 className="text-2xl font-bold tracking-tight">{tt('Mijn account')}</h1>
        <p className="mt-1 break-all text-ink-soft">{session?.user.email}</p>

        <form onSubmit={bewaar} className="mt-6">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <KeyRound size={20} strokeWidth={1.75} aria-hidden="true" />
            {tt('Wachtwoord')}
          </h2>
          <p className="mt-1 text-ink-soft">
            {tt('Met een wachtwoord log je op elk toestel in zonder op een mail te wachten. Inloggen met een code blijft ook altijd kunnen.')}
          </p>

          <label className="mt-4 block">
            <span className="text-sm font-semibold">{tt('Nieuw wachtwoord')}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={nieuw}
              onChange={(e) => {
                setNieuw(e.target.value)
                setKlaar(false)
              }}
              className={veld}
            />
          </label>
          <label className="mt-3 block">
            <span className="text-sm font-semibold">{tt('Nog eens')}</span>
            <input
              type="password"
              autoComplete="new-password"
              value={herhaal}
              onChange={(e) => setHerhaal(e.target.value)}
              className={veld}
            />
          </label>
          <p className="mt-1 text-sm text-ink-faint">{tt('Minstens {n} tekens.', { n: MIN_LENGTE })}</p>

          <button
            type="submit"
            disabled={busy || !nieuw}
            className="mt-5 min-h-touch w-full rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white disabled:opacity-50"
          >
            {busy ? tt('Bezig…') : tt('Wachtwoord bewaren')}
          </button>

          {fout ? (
            <p role="alert" className="mt-3 rounded-2xl border border-alert bg-surface-soft p-3 text-sm text-alert">
              {fout}
            </p>
          ) : null}
          {klaar ? (
            <p role="status" className="mt-3 rounded-2xl bg-accent-soft p-3 text-sm font-semibold text-accent-ink">
              {tt('Bewaard. Kies voortaan "Ik heb een wachtwoord" bij het inloggen.')}
            </p>
          ) : null}
        </form>

        <button
          onClick={() => signOut()}
          className="mt-8 w-full text-center font-semibold text-ink-faint underline underline-offset-4"
        >
          {tt('Uitloggen')}
        </button>
      </div>
    </main>
  )
}
