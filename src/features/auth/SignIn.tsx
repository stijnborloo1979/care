import { useState } from 'react'
import { supabase } from '../../lib/supabase'

type Manier = 'link' | 'wachtwoord'

/**
 * Twee manieren, met de magic link als standaard: een wachtwoord dat je
 * moet onthouden is precies wat deze doelgroep niet kan.
 *
 * Wachtwoord staat er wel bij, om twee redenen. De gratis mailservice van
 * Supabase stuurt maar een paar berichten per uur, wat bij het opzetten
 * meteen tegen een limiet loopt. En op de tablet van de persoon wil je
 * niet afhangen van een mailbox die zij moet openen.
 */
export default function SignIn({ intro }: { intro?: string }) {
  const [manier, setManier] = useState<Manier>('link')
  const [email, setEmail] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function verstuur(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (manier === 'wachtwoord') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: wachtwoord,
        })
        if (error) throw error
        // De AuthProvider pikt de nieuwe sessie zelf op.
        return
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      const bericht = err instanceof Error ? err.message : 'Inloggen lukte niet.'
      setError(
        bericht.includes('rate limit') || bericht.includes('Too many')
          ? 'Te veel mails in korte tijd. Wacht een uur, of log in met een wachtwoord.'
          : bericht.includes('Invalid login')
            ? 'Dat e-mailadres of wachtwoord klopt niet.'
            : bericht,
      )
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className="rounded-card border border-line bg-surface p-6 shadow-card">
        <h2 className="text-xl font-bold">Kijk in je mailbox</h2>
        <p className="mt-2 text-ink-soft">
          We stuurden een link naar {email}. Klik erop en je bent binnen. De link blijft een uur
          geldig en werkt maar een keer.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mt-4 font-semibold text-accent-ink underline underline-offset-4"
        >
          Opnieuw proberen
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={verstuur} className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-xl font-bold">Inloggen</h2>
      <p className="mt-2 text-ink-soft">
        {intro ??
          (manier === 'link'
            ? 'Vul je e-mailadres in. Je krijgt een link, geen wachtwoord.'
            : 'Vul je e-mailadres en wachtwoord in.')}
      </p>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-ink-soft">E-mailadres</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="els@voorbeeld.be"
          className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
        />
      </label>

      {manier === 'wachtwoord' ? (
        <label className="mt-3 block">
          <span className="text-sm font-semibold text-ink-soft">Wachtwoord</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={wachtwoord}
            onChange={(e) => setWachtwoord(e.target.value)}
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="mt-4 flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
      >
        {busy ? 'Bezig…' : manier === 'link' ? 'Stuur mij een link' : 'Inloggen'}
      </button>

      <button
        type="button"
        onClick={() => {
          setManier(manier === 'link' ? 'wachtwoord' : 'link')
          setError(null)
        }}
        className="mt-4 w-full text-center text-sm font-semibold text-ink-soft underline underline-offset-4"
      >
        {manier === 'link' ? 'Inloggen met een wachtwoord' : 'Liever een link per mail'}
      </button>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
