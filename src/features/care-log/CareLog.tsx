import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addCareEntry, deleteCareEntry, getCareLog } from '../../services/careLog'
import { hhmm } from '../../lib/time'
import { useHousehold } from '../household/useHousehold'
import DictateButton from '../../components/DictateButton'

const HERKOMST: Record<string, string> = {
  family: 'familie',
  caregiver: 'zorgverlener',
  person: 'zelf afgevinkt',
  system: 'automatisch',
}

export default function CareLog() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const tz = household?.timezone ?? 'Europe/Brussels'
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['carelog', hh],
    queryFn: () => getCareLog(hh),
    enabled: !!hh,
  })

  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const voegToe = useMutation({
    mutationFn: () =>
      addCareEntry({
        householdId: hh,
        occurredAt: new Date().toISOString(),
        title: title.trim(),
        note: note.trim(),
      }),
    onSuccess: async () => {
      setTitle('')
      setNote('')
      await queryClient.invalidateQueries({ queryKey: ['carelog', hh] })
      await queryClient.invalidateQueries({ queryKey: ['summary', hh] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Toevoegen lukte niet.'),
  })

  const verwijder = useMutation({
    mutationFn: (id: string) => deleteCareEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['carelog', hh] }),
  })

  // Per dag groeperen: een lange lijst zonder koppen leest niemand na.
  const perDag = new Map<string, typeof data extends undefined ? never : NonNullable<typeof data>>()
  ;(data ?? []).forEach((e) => {
    const dag = new Intl.DateTimeFormat('nl-BE', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(e.occurred_at))
    const lijst = perDag.get(dag) ?? []
    lijst.push(e)
    perDag.set(dag, lijst)
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Zorglogboek</h1>
        <p className="mt-1 text-ink-soft">
          Wat er gebeurd is, door familie, zorgverleners en de app zelf.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          voegToe.mutate()
        }}
        className="rounded-card bg-surface p-6 shadow-card"
      >
        <label className="block">
          <span className="text-sm font-semibold text-ink-soft">Wat gebeurde er?</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Samen gewandeld"
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink-soft">Notitie, mag leeg blijven</span>
            <DictateButton onTekst={(t) => setNote((v) => (v ? v + ' ' + t : t))} />
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Vandaag wat vermoeid."
            className="mt-1 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
          />
        </div>

        <button
          type="submit"
          disabled={voegToe.isPending}
          className="mt-3 flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
        >
          {voegToe.isPending ? 'Bezig…' : 'Toevoegen'}
        </button>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-alert">
            {error}
          </p>
        ) : null}
      </form>

      {isLoading ? <p className="text-ink-soft">Bezig met laden…</p> : null}

      {[...perDag.entries()].map(([dag, entries]) => (
        <section key={dag} className="rounded-card bg-surface p-6 shadow-card">
          <h2 className="text-lg font-bold capitalize">{dag}</h2>
          <ul className="mt-3 space-y-3">
            {entries.map((e) => (
              <li key={e.id} className="flex items-start gap-3 border-b border-line pb-3 last:border-none last:pb-0">
                <span className="w-12 shrink-0 font-bold tabular-nums text-ink-soft">
                  {hhmm(new Date(e.occurred_at), tz)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{e.title}</span>
                  {e.note ? <span className="block text-ink-soft">{e.note}</span> : null}
                  <span className="block text-sm text-ink-faint">{HERKOMST[e.source] ?? e.source}</span>
                </span>
                {e.source === 'family' ? (
                  <button
                    onClick={() => verwijder.mutate(e.id)}
                    className="shrink-0 rounded-pill border border-line px-3 py-1 text-sm font-semibold text-ink-soft"
                  >
                    Wissen
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!isLoading && (data ?? []).length === 0 ? (
        <p className="text-ink-soft">Nog niets genoteerd deze week.</p>
      ) : null}
    </div>
  )
}
