import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'

type Stap = 'email' | 'code' | 'wachtwoord'

/**
 * Een code van zes cijfers in plaats van een link. Een link opent soms in
 * de verkeerde browser, wordt door mailscanners verbruikt voor je klikt,
 * en werkt niet wanneer je de mail op je telefoon leest maar de tablet
 * wil inloggen. Een code tik je gewoon over.
 *
 * Supabase stuurt de code in dezelfde mail als de link, zolang het
 * mailsjabloon {{ .Token }} bevat. De link blijft dus ook werken.
 */
export default function CodeLogin({
  titel = 'Inloggen of een account maken',
  uitleg,
}: {
  titel?: string
  uitleg?: string
}) {
  const [stap, setStap] = useState<Stap>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [wachtwoord, setWachtwoord] = useState('')
  const [busy, setBusy] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (stap === 'code') codeRef.current?.focus()
  }, [stap])

  function vertaal(e: unknown) {
    const b = e instanceof Error ? e.message : String(e)
    if (b.includes('rate limit') || b.includes('Too many'))
      return 'Te veel mails in korte tijd. Wacht een uur, of log in met een wachtwoord.'
    if (b.includes('Token has expired') || b.includes('invalid'))
      return 'Deze code klopt niet of is verlopen. Vraag een nieuwe aan.'
    if (b.includes('Invalid login')) return 'Dat e-mailadres of wachtwoord klopt niet.'
    return b
  }

  async function stuurCode(e?: React.FormEvent) {
    e?.preventDefault()
    setBusy(true)
    setFout(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          // Wie toch op de link klikt, komt ook goed terecht.
          emailRedirectTo:
            window.location.pathname.startsWith('/login')
              ? window.location.origin + '/'
              : window.location.href,
        },
      })
      if (error) throw error
      setStap('code')
    } catch (err) {
      setFout(vertaal(err))
    } finally {
      setBusy(false)
    }
  }

  async function controleer(waarde: string) {
    setBusy(true)
    setFout(null)
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: waarde,
        type: 'email',
      })
      if (error) throw error
      // De AuthProvider pikt de sessie op; de pagina stuurt dan door.
    } catch (err) {
      setFout(vertaal(err))
      setCode('')
    } finally {
      setBusy(false)
    }
  }

  async function metWachtwoord(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFout(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: wachtwoord,
      })
      if (error) throw error
    } catch (err) {
      setFout(vertaal(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-card bg-surface p-6 shadow-lift">
      {/* Waar je zit, in drie stappen. */}
      <ol className="flex items-center gap-2 text-sm font-semibold" aria-label="Stappen">
        {[
          ['email', 'E-mail'],
          ['code', 'Code'],
          ['klaar', 'Binnen'],
        ].map(([id, label], i) => {
          const actief =
            (id === 'email' && (stap === 'email' || stap === 'wachtwoord')) ||
            (id === 'code' && stap === 'code')
          const gedaan = id === 'email' && stap === 'code'
          return (
            <li key={id} className="flex items-center gap-2">
              {i > 0 ? <span className="h-px w-5 bg-line-strong" aria-hidden="true" /> : null}
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-xs ${
                  actief
                    ? 'bg-accent-ink text-white'
                    : gedaan
                      ? 'bg-accent-soft text-accent-ink'
                      : 'bg-surface-deep text-ink-faint'
                }`}
              >
                {gedaan ? '✓' : i + 1}
              </span>
              <span className={actief ? 'text-ink' : 'text-ink-faint'}>{label}</span>
            </li>
          )
        })}
      </ol>

      <h2 className="mt-6 text-2xl font-bold tracking-tight">
        {stap === 'code' ? 'Vul de code in' : titel}
      </h2>

      {stap === 'email' ? (
        <form onSubmit={stuurCode}>
          <p className="mt-2 text-ink-soft">
            {uitleg ??
              'Vul je e-mailadres in. Je krijgt een code van zes cijfers. Heb je nog geen account, dan wordt het meteen aangemaakt.'}
          </p>
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-ink-soft">E-mailadres</span>
            <input
              type="email"
              required
              autoFocus
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="naam@voorbeeld.be"
              className="mt-1 min-h-[3.2rem] w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-lg"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 flex min-h-[3.2rem] w-full items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Bezig…' : 'Stuur mij een code'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStap('wachtwoord')
              setFout(null)
            }}
            className="mt-4 w-full text-center text-sm font-semibold text-ink-soft underline underline-offset-4"
          >
            Ik heb een wachtwoord
          </button>
        </form>
      ) : null}

      {stap === 'code' ? (
        <div>
          <p className="mt-2 text-ink-soft">
            We stuurden een code naar <strong>{email}</strong>. Kijk ook even in je spam.
          </p>
          <input
            ref={codeRef}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6)
              setCode(v)
              // Zes cijfers ingevuld: meteen controleren, geen extra knop nodig.
              if (v.length === 6) controleer(v)
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            aria-label="Code van zes cijfers"
            className="mt-5 min-h-[4rem] w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-center font-mono text-3xl tracking-[0.5em]"
          />
          <p className="mt-2 text-center text-sm text-ink-faint">
            {busy ? 'Controleren…' : 'De code is een uur geldig.'}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-4 text-sm font-semibold text-ink-soft">
            <button
              onClick={() => stuurCode()}
              disabled={busy}
              className="underline underline-offset-4"
            >
              Nieuwe code sturen
            </button>
            <button
              onClick={() => {
                setStap('email')
                setCode('')
                setFout(null)
              }}
              className="underline underline-offset-4"
            >
              Ander e-mailadres
            </button>
          </div>
        </div>
      ) : null}

      {stap === 'wachtwoord' ? (
        <form onSubmit={metWachtwoord}>
          <label className="mt-5 block">
            <span className="text-sm font-semibold text-ink-soft">E-mailadres</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 min-h-[3.2rem] w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-lg"
            />
          </label>
          <label className="mt-3 block">
            <span className="text-sm font-semibold text-ink-soft">Wachtwoord</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={wachtwoord}
              onChange={(e) => setWachtwoord(e.target.value)}
              className="mt-1 min-h-[3.2rem] w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-lg"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="mt-4 flex min-h-[3.2rem] w-full items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Bezig…' : 'Inloggen'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStap('email')
              setFout(null)
            }}
            className="mt-4 w-full text-center text-sm font-semibold text-ink-soft underline underline-offset-4"
          >
            Liever een code per mail
          </button>
        </form>
      ) : null}

      {fout ? (
        <p role="alert" className="mt-4 rounded-2xl bg-alert-soft p-3 text-sm text-alert">
          {fout}
        </p>
      ) : null}
    </div>
  )
}
