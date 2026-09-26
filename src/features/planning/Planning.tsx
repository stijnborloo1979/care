import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  HERHALING,
  deleteRoutine,
  getRoutines,
  materialiseToday,
  saveRoutine,
  type Routine,
} from '../../services/routines'
import { useHousehold } from '../household/useHousehold'

function labelVan(rrule: string) {
  return HERHALING.find((h) => h.waarde === rrule)?.label ?? rrule
}

export default function Planning() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const queryClient = useQueryClient()
  const [open, setOpen] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['routines', hh],
    queryFn: () => getRoutines(hh),
    enabled: !!hh,
  })

  const nuToepassen = useMutation({
    mutationFn: () => materialiseToday(hh),
    onSuccess: () => {
      for (const k of ['agenda', 'summary', 'meds-today']) {
        queryClient.invalidateQueries({ queryKey: [k, hh] })
      }
    },
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Routines</h1>
        <p className="mt-1 text-ink-soft">
          Vaste momenten die elke dag terugkomen. De nachtelijke job zet ze om in de agenda van
          morgen.
        </p>
      </header>

      {isLoading ? <p className="text-ink-soft">Bezig met laden…</p> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {(data ?? []).map((r) => (
          <section key={r.id} className="rounded-card bg-surface p-6 shadow-card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">
                  {r.emoji ? `${r.emoji} ` : ''}
                  {r.name}
                </h2>
                <p className="text-sm text-ink-soft">
                  {labelVan(r.rrule)}
                  {r.active ? '' : ' — staat uit'}
                </p>
              </div>
              <button
                onClick={() => setOpen(open === r.id ? null : r.id)}
                className="min-h-[2.4rem] shrink-0 rounded-pill border-[1.5px] border-line-strong px-3 text-sm font-semibold"
              >
                {open === r.id ? 'Sluiten' : 'Wijzigen'}
              </button>
            </div>

            <ul className="mt-3 space-y-1">
              {r.routine_step.map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span className="w-14 shrink-0 font-bold tabular-nums text-ink-soft">
                    {s.at_time.slice(0, 5)}
                  </span>
                  <span>{s.title}</span>
                </li>
              ))}
              {r.routine_step.length === 0 ? (
                <li className="text-sm text-ink-soft">Nog geen stappen.</li>
              ) : null}
            </ul>

            {open === r.id ? (
              <RoutineEditor householdId={hh} routine={r} onDone={() => setOpen(null)} />
            ) : null}
          </section>
        ))}
      </div>

      {open === 'nieuw' ? (
        <RoutineEditor householdId={hh} onDone={() => setOpen(null)} />
      ) : (
        <button
          onClick={() => setOpen('nieuw')}
          className="flex min-h-touch w-full max-w-sm items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white"
        >
          + Routine toevoegen
        </button>
      )}

      <div className="rounded-card border border-line bg-surface-soft p-4">
        <p className="text-sm text-ink-soft">
          Wijzigingen gelden vanaf morgen. Wil je ze vandaag al zien, zet de routines dan nu om.
          Items die al in de agenda staan blijven ongemoeid. Dit zet ook de medicatiemomenten van
          vandaag en morgen klaar.
        </p>
        <button
          onClick={() => nuToepassen.mutate()}
          disabled={nuToepassen.isPending}
          className="mt-3 min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold disabled:opacity-60"
        >
          {nuToepassen.isPending ? 'Bezig…' : 'Vandaag bijwerken'}
        </button>
      </div>
    </div>
  )
}

function RoutineEditor({
  householdId,
  routine,
  onDone,
}: {
  householdId: string
  routine?: Routine
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(routine?.name ?? '')
  const [rrule, setRrule] = useState(routine?.rrule ?? 'FREQ=DAILY')
  const [active, setActive] = useState(routine?.active ?? true)
  const [steps, setSteps] = useState(
    (routine?.routine_step ?? []).map((s) => `${s.at_time.slice(0, 5)} ${s.title}`).join('\n'),
  )
  const [error, setError] = useState<string | null>(null)

  const opslaan = useMutation({
    mutationFn: () =>
      saveRoutine({
        householdId,
        id: routine?.id,
        name: name.trim(),
        rrule,
        active,
        // Eén regel per stap: "08:00 Ontbijt". Korter dan een formulier
        // per stap, en makkelijker te herschikken.
        steps: steps
          .split('\n')
          .map((regel) => {
            const m = regel.trim().match(/^(\d{1,2}[:.]\d{2})\s+(.*)$/)
            if (!m) return null
            return { at: m[1].replace('.', ':').padStart(5, '0'), title: m[2] }
          })
          .filter((s): s is { at: string; title: string } => s !== null),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['routines', householdId] })
      onDone()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Opslaan lukte niet.'),
  })

  const verwijder = useMutation({
    mutationFn: () => deleteRoutine(routine!.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['routines', householdId] })
      onDone()
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        opslaan.mutate()
      }}
      className="mt-4 space-y-3 rounded-2xl border border-line bg-surface-soft p-4"
    >
      <div className="flex flex-wrap gap-3">
        <label className="min-w-[10rem] flex-1">
          <span className="text-sm font-semibold text-ink-soft">Naam</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ochtend"
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
        <label className="min-w-[12rem] flex-1">
          <span className="text-sm font-semibold text-ink-soft">Herhaling</span>
          <select
            value={rrule}
            onChange={(e) => setRrule(e.target.value)}
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          >
            {HERHALING.map((h) => (
              <option key={h.waarde} value={h.waarde}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-ink-soft">Stappen, één per lijn</span>
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          rows={5}
          placeholder={'07:30 Opstaan\n08:00 Ontbijt\n08:30 Medicatie'}
          className="mt-1 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3 font-mono text-sm"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Begin elke lijn met het uur. Regels zonder uur worden overgeslagen.
        </span>
      </label>

      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
          className="h-5 w-5"
        />
        <span className="font-semibold">Actief</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={opslaan.isPending}
          className="flex min-h-touch flex-1 items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
        >
          {opslaan.isPending ? 'Opslaan…' : 'Opslaan'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
        >
          Annuleren
        </button>
        {routine ? (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Routine "${routine.name}" verwijderen?`)) verwijder.mutate()
            }}
            className="min-h-touch rounded-pill border-[1.5px] border-alert px-5 font-semibold text-alert"
          >
            Verwijderen
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
