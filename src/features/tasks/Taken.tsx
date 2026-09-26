import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addTask,
  assignTask,
  claimTask,
  completeTask,
  deleteTask,
  getFamilie,
  getTasks,
  reopenTask,
  type Herhaling,
  type Task,
} from '../../services/tasks'
import { localDateKey } from '../../lib/time'
import { useAuth } from '../auth/AuthProvider'
import { useHousehold } from '../household/useHousehold'
import Icon from '../../components/Icon'

const HERHALING: { waarde: Herhaling; label: string }[] = [
  { waarde: 'none', label: 'Eenmalig' },
  { waarde: 'daily', label: 'Elke dag' },
  { waarde: 'weekly', label: 'Elke week' },
  { waarde: 'monthly', label: 'Elke maand' },
]

/**
 * Het regelwerk van de familie: wie doet wat, en wanneer. Bewust een eigen
 * scherm en niet iets op Vandaag — de persoon ziet taken nooit.
 *
 * Een taak zonder naam erbij is normaal: dan staat ze in "nog op te nemen"
 * tot iemand op "neem ik" drukt. Toewijzen kan ook, maar opnemen is de
 * gewone gang van zaken in een gezin.
 */
export default function Taken() {
  const { household } = useHousehold()
  const { session } = useAuth()
  const hh = household?.household_id ?? ''
  const tz = household?.timezone ?? 'Europe/Brussels'
  const ik = session?.user.id ?? ''
  const queryClient = useQueryClient()
  const [fout, setFout] = useState<string | null>(null)

  const { data: taken, isLoading } = useQuery({
    queryKey: ['tasks', hh],
    queryFn: () => getTasks(hh),
    enabled: !!hh,
  })

  const { data: familie } = useQuery({
    queryKey: ['familie', hh],
    queryFn: () => getFamilie(hh),
    enabled: !!hh,
  })

  function verversen() {
    return queryClient.invalidateQueries({ queryKey: ['tasks', hh] })
  }

  function melden(e: unknown, val: string) {
    setFout(e instanceof Error ? e.message : val)
  }

  const opnemen = useMutation({
    mutationFn: claimTask,
    onSuccess: verversen,
    onError: (e) => melden(e, 'Opnemen lukte niet.'),
  })

  const toewijzen = useMutation({
    mutationFn: (p: { id: string; wie: string | null }) => assignTask(p.id, p.wie),
    onSuccess: verversen,
    onError: (e) => melden(e, 'Toewijzen lukte niet.'),
  })

  const afvinken = useMutation({
    mutationFn: completeTask,
    onSuccess: verversen,
    onError: (e) => melden(e, 'Afvinken lukte niet.'),
  })

  const heropenen = useMutation({
    mutationFn: reopenTask,
    onSuccess: verversen,
    onError: (e) => melden(e, 'Terugzetten lukte niet.'),
  })

  const wissen = useMutation({
    mutationFn: deleteTask,
    onSuccess: verversen,
    onError: (e) => melden(e, 'Verwijderen lukte niet.'),
  })

  const naam = (id: string | null) => {
    if (!id) return null
    if (id === ik) return 'jij'
    return familie?.find((f) => f.profile_id === id)?.naam ?? 'iemand'
  }

  const vandaag = localDateKey(new Date(), tz)
  const open = (taken ?? []).filter((t) => !t.done_at)
  const gedaan = (taken ?? []).filter((t) => t.done_at)

  const groepen: { titel: string; uitleg?: string; rijen: Task[] }[] = [
    {
      titel: 'Te laat',
      rijen: open.filter((t) => t.due_on && t.due_on < vandaag),
    },
    {
      titel: 'Vandaag',
      rijen: open.filter((t) => t.due_on === vandaag),
    },
    {
      titel: 'Later',
      rijen: open.filter((t) => t.due_on && t.due_on > vandaag),
    },
    {
      titel: 'Ooit',
      uitleg: 'Zonder dag erbij.',
      rijen: open.filter((t) => !t.due_on),
    },
  ].filter((g) => g.rijen.length > 0)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Taken</h1>
        <p className="mt-1 text-ink-soft">
          Het regelwerk onder elkaar verdelen. {household?.person_name.split(' ')[0] ?? 'De persoon'}{' '}
          ziet dit scherm niet.
        </p>
      </header>

      <NieuweTaak
        householdId={hh}
        familie={familie ?? []}
        ik={ik}
        onKlaar={verversen}
        onFout={(b) => setFout(b)}
      />

      {fout ? (
        <p role="alert" className="rounded-card bg-surface p-4 text-alert shadow-card">
          {fout}
        </p>
      ) : null}

      {isLoading ? <p className="text-ink-soft">Bezig met laden…</p> : null}

      {!isLoading && open.length === 0 ? (
        <p className="rounded-card bg-surface p-6 text-ink-soft shadow-card">
          Niets openstaand. Wat hierboven bijkomt, verschijnt hier.
        </p>
      ) : null}

      {groepen.map((g) => (
        <section key={g.titel} className="rounded-card bg-surface p-4 shadow-card sm:p-6">
          <h2 className="text-lg font-bold">
            {g.titel} <span className="font-semibold text-ink-faint">{g.rijen.length}</span>
          </h2>
          {g.uitleg ? <p className="mt-1 text-sm text-ink-soft">{g.uitleg}</p> : null}

          <ul className="mt-3 divide-y divide-line">
            {g.rijen.map((t) => (
              <li key={t.id} className="flex flex-wrap items-start gap-3 py-3">
                <button
                  onClick={() => afvinken.mutate(t.id)}
                  aria-label={`${t.title} afvinken`}
                  className="mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-full border-2 border-line-strong text-ink-faint hover:border-accent hover:text-accent"
                >
                  <Icon naam="gedaan" className="h-5 w-5" />
                </button>

                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.title}</p>
                  {t.note ? <p className="text-sm text-ink-soft">{t.note}</p> : null}
                  <p className="mt-0.5 text-sm text-ink-faint">
                    {t.due_on ? dagLabel(t.due_on, vandaag, tz) : 'geen dag'}
                    {t.repeat !== 'none'
                      ? ` · ${HERHALING.find((h) => h.waarde === t.repeat)?.label.toLowerCase()}`
                      : ''}
                    {t.assignee ? ` · ${naam(t.assignee)}` : ''}
                  </p>
                </div>

                {t.assignee ? (
                  <select
                    aria-label={`Wie doet ${t.title}`}
                    value={t.assignee}
                    onChange={(e) => toewijzen.mutate({ id: t.id, wie: e.target.value || null })}
                    className="min-h-[2.6rem] rounded-pill border border-line bg-surface-soft px-3 font-semibold"
                  >
                    <option value="">Niemand</option>
                    {(familie ?? []).map((f) => (
                      <option key={f.profile_id} value={f.profile_id}>
                        {f.profile_id === ik ? 'Ik' : f.naam}
                      </option>
                    ))}
                  </select>
                ) : (
                  <button
                    onClick={() => opnemen.mutate(t.id)}
                    className="min-h-[2.6rem] rounded-pill bg-accent-ink px-4 font-bold text-white"
                  >
                    Neem ik
                  </button>
                )}

                <button
                  onClick={() => wissen.mutate(t.id)}
                  aria-label={`${t.title} verwijderen`}
                  className="min-h-[2.6rem] rounded-pill px-3 text-sm font-semibold text-ink-faint underline underline-offset-4"
                >
                  weg
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {gedaan.length > 0 ? (
        <details className="rounded-card bg-surface p-4 shadow-card sm:p-6">
          <summary className="cursor-pointer text-lg font-bold">
            Afgevinkt deze week <span className="text-ink-faint">{gedaan.length}</span>
          </summary>
          <ul className="mt-3 divide-y divide-line">
            {gedaan.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 text-ink-soft line-through">{t.title}</span>
                <span className="text-sm text-ink-faint">{naam(t.done_by)}</span>
                <button
                  onClick={() => heropenen.mutate(t.id)}
                  className="min-h-[2.4rem] rounded-pill px-3 text-sm font-semibold underline underline-offset-4"
                >
                  terugzetten
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

/** Toevoegen in één regel, met de rest ingeklapt: de meeste taken hebben
 *  alleen een naam en een dag nodig. */
function NieuweTaak({
  householdId,
  familie,
  ik,
  onKlaar,
  onFout,
}: {
  householdId: string
  familie: { profile_id: string; naam: string }[]
  ik: string
  onKlaar: () => Promise<unknown>
  onFout: (b: string) => void
}) {
  const [titel, setTitel] = useState('')
  const [dag, setDag] = useState('')
  const [wie, setWie] = useState('')
  const [herhaling, setHerhaling] = useState<Herhaling>('none')

  const toevoegen = useMutation({
    mutationFn: () =>
      addTask({
        householdId,
        title: titel,
        assignee: wie || null,
        dueOn: dag || null,
        repeat: herhaling,
      }),
    onSuccess: async () => {
      setTitel('')
      setDag('')
      setWie('')
      setHerhaling('none')
      await onKlaar()
    },
    onError: (e) => onFout(e instanceof Error ? e.message : 'Toevoegen lukte niet.'),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (titel.trim()) toevoegen.mutate()
      }}
      className="rounded-card bg-surface p-4 shadow-card sm:p-6"
    >
      <label htmlFor="taak" className="font-semibold">
        Wat moet er gebeuren?
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <input
          id="taak"
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder="Boodschappen doen"
          className="min-h-touch min-w-[min(14rem,100%)] flex-1 rounded-pill border border-line bg-surface-soft px-4"
        />
        <button
          type="submit"
          disabled={!titel.trim() || toevoegen.isPending}
          className="min-h-touch rounded-pill bg-accent-ink px-5 font-bold text-white disabled:opacity-50"
        >
          Toevoegen
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          type="date"
          aria-label="Wanneer"
          value={dag}
          onChange={(e) => setDag(e.target.value)}
          className="min-h-[2.6rem] rounded-pill border border-line bg-surface-soft px-3"
        />
        <select
          aria-label="Wie doet het"
          value={wie}
          onChange={(e) => setWie(e.target.value)}
          className="min-h-[2.6rem] rounded-pill border border-line bg-surface-soft px-3"
        >
          <option value="">Nog op te nemen</option>
          {familie.map((f) => (
            <option key={f.profile_id} value={f.profile_id}>
              {f.profile_id === ik ? 'Ik' : f.naam}
            </option>
          ))}
        </select>
        <select
          aria-label="Hoe vaak"
          value={herhaling}
          onChange={(e) => setHerhaling(e.target.value as Herhaling)}
          className="min-h-[2.6rem] rounded-pill border border-line bg-surface-soft px-3"
        >
          {HERHALING.map((h) => (
            <option key={h.waarde} value={h.waarde}>
              {h.label}
            </option>
          ))}
        </select>
      </div>
    </form>
  )
}

/** "vandaag", "morgen", of gewoon de dag. Een datum van deze week lees je
 *  sneller als weekdag dan als 25/09. */
function dagLabel(dag: string, vandaag: string, tz: string): string {
  if (dag === vandaag) return 'vandaag'

  const d = new Date(`${dag}T12:00:00Z`)
  const verschil = Math.round(
    (Date.parse(`${dag}T12:00:00Z`) - Date.parse(`${vandaag}T12:00:00Z`)) / 86_400_000,
  )
  if (verschil === 1) return 'morgen'
  if (verschil === -1) return 'gisteren'
  if (verschil > 1 && verschil < 7) {
    return new Intl.DateTimeFormat('nl-BE', { timeZone: tz, weekday: 'long' }).format(d)
  }
  return new Intl.DateTimeFormat('nl-BE', { timeZone: tz, day: 'numeric', month: 'long' }).format(d)
}
