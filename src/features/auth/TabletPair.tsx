import { useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * De tablet van de persoon wordt één keer gekoppeld, door de familie, met
 * een code uit het familiescherm. Daarna blijft hij ingelogd. De persoon
 * zelf ziet hier nooit iets van.
 */
export default function TabletPair() {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const cijfers = code.replace(/\D/g, '').slice(0, 8)
  const getoond = cijfers.length > 4 ? `${cijfers.slice(0, 4)} ${cijfers.slice(4)}` : cijfers

  async function koppel(e: React.FormEvent) {
    e.preventDefault()
    if (cijfers.length !== 8) {
      setFout('De code heeft acht cijfers.')
      return
    }
    setBusy(true)
    setFout(null)
    try {
      const { data, error } = await supabase.functions.invoke('pair-device', {
        body: { code: cijfers },
      })
      if (error) {
        // De functie geeft een leesbare fout terug in de body.
        const context = (error as { context?: Response }).context
        const tekst = context ? await context.json().catch(() => null) : null
        throw new Error(tekst?.error ?? 'Koppelen lukte niet.')
      }
      if (!data?.token_hash) throw new Error(data?.error ?? 'Koppelen lukte niet.')

      const { error: sessieFout } = await supabase.auth.verifyOtp({
        token_hash: data.token_hash,
        type: 'magiclink',
      })
      if (sessieFout) throw sessieFout
      // Ingelogd: de pagina stuurt vanzelf door naar het scherm van de persoon.
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Koppelen lukte niet.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={koppel} className="rounded-card bg-surface p-6 shadow-lift">
      <h2 className="text-2xl font-bold tracking-tight">Tablet koppelen</h2>
      <p className="mt-2 text-ink-soft">
        Open Thuis op je eigen telefoon, ga naar <strong>Instellingen → Tablet koppelen</strong>, en
        tik de code hier in.
      </p>

      <input
        value={getoond}
        onChange={(e) => {
          setCode(e.target.value)
          setFout(null)
        }}
        inputMode="numeric"
        autoFocus
        placeholder="0000 0000"
        aria-label="Koppelcode van acht cijfers"
        className="mt-6 min-h-[4.2rem] w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-center font-mono text-3xl tracking-[0.25em]"
      />

      <button
        type="submit"
        disabled={busy || cijfers.length !== 8}
        className="mt-4 flex min-h-[3.2rem] w-full items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white disabled:opacity-50"
      >
        {busy ? 'Koppelen…' : 'Koppelen'}
      </button>

      <p className="mt-4 text-sm text-ink-faint">
        De code is tien minuten geldig en werkt maar één keer. Deze tablet blijft daarna ingelogd,
        ook na herstarten.
      </p>

      {fout ? (
        <p role="alert" className="mt-4 rounded-2xl bg-alert-soft p-3 text-sm text-alert">
          {fout}
        </p>
      ) : null}
    </form>
  )
}
