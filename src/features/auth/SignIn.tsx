import { useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * Magic link, geen wachtwoord. Een wachtwoord dat je moet onthouden is
 * precies wat deze doelgroep niet kan, en voor familie is het een drempel
 * die niets oplost.
 */
export default function SignIn({ intro }: { intro?: string }) {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function verstuur(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      })
      if (error) throw error
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Versturen lukte niet.')
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
          geldig.
        </p>
        <button onClick={() => setSent(false)} className="mt-4 font-semibold text-accent-ink underline underline-offset-4">
          Ander adres gebruiken
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={verstuur} className="rounded-card border border-line bg-surface p-6 shadow-card">
      <h2 className="text-xl font-bold">Inloggen</h2>
      <p className="mt-2 text-ink-soft">{intro ?? 'Vul je e-mailadres in. Je krijgt een link, geen wachtwoord.'}</p>

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

      <button
        type="submit"
        disabled={busy}
        className="mt-4 flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
      >
        {busy ? 'Versturen…' : 'Stuur mij een link'}
      </button>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
