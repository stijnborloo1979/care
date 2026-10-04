import type { ReactNode } from 'react'
import { tt } from '../../lib/uiTaal'

/** Dezelfde bouwstenen als de familieschermen, op één plaats voor Care. */

export const knop =
  'flex min-h-touch items-center justify-center gap-2 rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60'
export const knopRustig =
  'flex min-h-touch items-center justify-center gap-2 rounded-pill border-[1.5px] border-line-strong bg-surface px-5 font-semibold disabled:opacity-60'
export const knopKlein =
  'shrink-0 rounded-pill border border-line px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-surface-soft disabled:opacity-60'
export const veld =
  'mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4'
export const tekstvak =
  'mt-1 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3'
export const label = 'text-sm font-semibold text-ink-soft'

export function Kop({ titel, uitleg, rechts }: { titel: string; uitleg?: ReactNode; rechts?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight">{titel}</h1>
        {uitleg ? <p className="mt-1 text-ink-soft">{uitleg}</p> : null}
      </div>
      {rechts}
    </header>
  )
}

export function Kaart({ titel, children, className = '' }: { titel?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-card bg-surface p-5 shadow-card sm:p-6 ${className}`}>
      {titel ? <h2 className="flex items-center gap-2 text-lg font-bold">{titel}</h2> : null}
      <div className={titel ? 'mt-3' : ''}>{children}</div>
    </section>
  )
}

export function Leeg({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-surface-soft px-4 py-3 text-ink-soft">{children}</p>
}

/** Een fout van Supabase is een gewoon object met een message, geen Error. */
export function foutTekst(fout: unknown): string {
  // Meldingen van de database zijn Nederlands; tt() vertaalt de gekende.
  if (fout instanceof Error) return tt(fout.message)
  if (fout && typeof fout === 'object' && typeof (fout as { message?: unknown }).message === 'string')
    return tt((fout as { message: string }).message)
  return typeof fout === 'string' ? tt(fout) : tt('Er ging iets mis. Probeer het opnieuw.')
}

export function Fout({ fout }: { fout: unknown }) {
  if (!fout) return null
  return (
    <p role="alert" className="mt-3 rounded-2xl border border-alert bg-surface-soft p-3 text-sm text-alert">
      {foutTekst(fout)}
    </p>
  )
}

export function Laden() {
  return <p className="text-ink-soft">Bezig met laden…</p>
}

export const uur = (iso: string) =>
  new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })

export const dagEnUur = (iso: string) =>
  new Date(iso).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
