import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { useHousehold } from '../household/useHousehold'
import { usePeople } from '../people/usePeople'
import { hhmm, localDateKey, maandagVan, plusDagen } from '../../lib/time'
import {
  SOORTEN,
  deleteItem,
  getWeek,
  saveItem,
  type KalenderItem,
} from '../../services/calendar'
import type { EventKind } from '../../services/agenda'
import DictateButton from '../../components/DictateButton'
import QuickAdd from '../planning/QuickAdd'

const DAGNAMEN = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']

type Bewerken = { datum: string; item?: KalenderItem } | null

/**
 * Eén week in één oogopslag. Familie en zorgverleners plannen hier; de
 * persoon ziet het vanzelf op zijn Vandaag-scherm. Wie wat plande, staat
 * erbij — zodat niemand elkaars afspraken per ongeluk verplaatst.
 */
export default function Calendar() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const tz = household?.timezone ?? 'Europe/Brussels'
  const vandaag = localDateKey(new Date(), tz)

  const [maandag, setMaandag] = useState(() => maandagVan(vandaag))
  const [bewerken, setBewerken] = useState<Bewerken>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['week', hh, maandag],
    queryFn: () => getWeek(hh, maandag, tz),
    enabled: !!hh,
  })

  const perDag = useMemo(() => {
    const m = new Map<string, KalenderItem[]>()
    for (const e of data ?? []) {
      const k = localDateKey(new Date(e.starts_at), tz)
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return m
  }, [data, tz])

  const dagen = Array.from({ length: 7 }, (_, i) => plusDagen(maandag, i))
  const titel = new Intl.DateTimeFormat('nl-BE', { day: 'numeric', month: 'long' })

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kalender</h1>
          <p className="mt-1 text-ink-soft">
            Wat je hier plant, verschijnt vanzelf op het scherm van{' '}
            {household?.person_name.split(' ')[0] ?? 'de persoon'}.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMaandag(plusDagen(maandag, -7))}
            aria-label="Vorige week"
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface"
          >
            <ChevronLeft size={20} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => setMaandag(maandagVan(vandaag))}
            className="min-h-[2.75rem] rounded-pill border border-line bg-surface px-4 font-semibold"
          >
            Deze week
          </button>
          <button
            onClick={() => setMaandag(plusDagen(maandag, 7))}
            aria-label="Volgende week"
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface"
          >
            <ChevronRight size={20} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <QuickAdd householdId={hh} />

      <p className="text-lg font-semibold">
        {titel.format(new Date(`${maandag}T12:00:00`))} –{' '}
        {titel.format(new Date(`${plusDagen(maandag, 6)}T12:00:00`))}
      </p>

      {isLoading ? <p className="text-ink-soft">Bezig met laden…</p> : null}

      {/* Op een breed scherm zeven kolommen, op een telefoon onder elkaar. */}
      <div className="grid gap-3 lg:grid-cols-7">
        {dagen.map((dag, i) => {
          const items = perDag.get(dag) ?? []
          const isVandaag = dag === vandaag
          const voorbij = dag < vandaag
          return (
            <section
              key={dag}
              className={`flex min-h-[9rem] flex-col rounded-card p-3 ${
                isVandaag ? 'bg-accent-soft ring-1 ring-accent/30' : 'bg-surface shadow-card'
              } ${voorbij ? 'opacity-70' : ''}`}
            >
              <div className="flex items-baseline justify-between px-1">
                <span className="font-bold">
                  {DAGNAMEN[i]} {Number(dag.slice(8))}
                </span>
                {isVandaag ? (
                  <span className="text-xs font-bold uppercase tracking-wide text-accent-ink">
                    vandaag
                  </span>
                ) : null}
              </div>

              <ul className="mt-2 flex-1 space-y-1.5">
                {items.map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => setBewerken({ datum: dag, item: e })}
                      className="w-full rounded-xl bg-surface-soft px-2.5 py-2 text-left hover:bg-surface-deep"
                    >
                      <span className="block text-xs font-bold tabular-nums text-ink-soft">
                        {hhmm(new Date(e.starts_at), tz)}
                        {e.done_at ? ' · gedaan' : ''}
                      </span>
                      <span
                        className={`block text-sm font-semibold leading-snug ${
                          e.done_at ? 'text-ink-faint line-through' : ''
                        }`}
                      >
                        {e.emoji ? `${e.emoji} ` : ''}
                        {e.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {!voorbij ? (
                <button
                  onClick={() => setBewerken({ datum: dag })}
                  className="mt-2 flex min-h-[2.4rem] items-center justify-center gap-1 rounded-xl text-sm font-semibold text-ink-soft hover:bg-surface-soft"
                >
                  <Plus size={16} strokeWidth={1.75} />
                  Toevoegen
                </button>
              ) : null}
            </section>
          )
        })}
      </div>

      {bewerken ? (
        <ItemEditor
          householdId={hh}
          tz={tz}
          datum={bewerken.datum}
          item={bewerken.item}
          dagItems={perDag.get(bewerken.datum) ?? []}
          maandag={maandag}
          onKlaar={() => setBewerken(null)}
        />
      ) : null}
    </div>
  )
}

function ItemEditor({
  householdId,
  tz,
  datum: startDatum,
  item,
  dagItems,
  maandag,
  onKlaar,
}: {
  householdId: string
  tz: string
  datum: string
  item?: KalenderItem
  dagItems: KalenderItem[]
  maandag: string
  onKlaar: () => void
}) {
  const queryClient = useQueryClient()
  const { data: mensen } = usePeople(householdId)

  const [datum, setDatum] = useState(startDatum)
  const [tijd, setTijd] = useState(item ? hhmm(new Date(item.starts_at), tz) : '10:00')
  const [titel, setTitel] = useState(item?.title ?? '')
  const [soort, setSoort] = useState<EventKind>(item?.kind ?? 'appt')
  const [emoji, setEmoji] = useState(item?.emoji ?? '📅')
  const [notitie, setNotitie] = useState(item?.note ?? '')
  const [persoonId, setPersoonId] = useState<string | null>(item?.person_id ?? null)
  const [fout, setFout] = useState<string | null>(null)

  const ververs = async () => {
    await queryClient.invalidateQueries({ queryKey: ['week', householdId, maandag] })
    await queryClient.invalidateQueries({ queryKey: ['agenda', householdId] })
    await queryClient.invalidateQueries({ queryKey: ['summary', householdId] })
  }

  const bewaar = useMutation({
    mutationFn: () =>
      saveItem({
        id: item?.id,
        householdId,
        datum,
        tijd,
        tz,
        titel: titel.trim(),
        soort,
        emoji,
        notitie: notitie.trim(),
        persoonId,
      }),
    onSuccess: async () => {
      await ververs()
      onKlaar()
    },
    onError: (e) =>
      setFout(
        e instanceof Error && e.message.includes('row-level security')
          ? 'Je kan alleen je eigen afspraken wijzigen.'
          : e instanceof Error
            ? e.message
            : 'Opslaan lukte niet.',
      ),
  })

  const wis = useMutation({
    mutationFn: () => deleteItem(item!.id),
    onSuccess: async () => {
      await ververs()
      onKlaar()
    },
  })

  // Twee dingen binnen het uur is voor iemand met geheugenproblemen al
  // snel te veel. We verbieden het niet, maar zeggen het wel.
  const [u, m] = tijd.split(':').map(Number)
  const minuten = u * 60 + m
  const botsing =
    datum === startDatum
      ? dagItems.find((e) => {
          if (e.id === item?.id) return false
          const [eu, em] = hhmm(new Date(e.starts_at), tz).split(':').map(Number)
          return Math.abs(eu * 60 + em - minuten) < 60
        })
      : undefined

  const vanRoutine = !!item?.routine_id

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={item ? 'Afspraak wijzigen' : 'Afspraak toevoegen'}
      onClick={onKlaar}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          setFout(null)
          if (!titel.trim()) {
            setFout('Geef de afspraak een naam.')
            return
          }
          bewaar.mutate()
        }}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-bg p-6 shadow-lift sm:rounded-[28px]"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">
            {item ? 'Afspraak wijzigen' : 'Afspraak toevoegen'}
          </h2>
          <button
            type="button"
            onClick={onKlaar}
            aria-label="Sluiten"
            className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-soft"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
        </div>

        {item?.maker?.full_name ? (
          <p className="mt-1 text-sm text-ink-faint">Gepland door {item.maker.full_name}</p>
        ) : null}
        {vanRoutine ? (
          <p className="mt-2 rounded-2xl bg-surface-soft p-3 text-sm text-ink-soft">
            Dit komt uit een vaste routine. Wat je hier wijzigt, geldt alleen voor deze dag.
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label>
            <span className="text-sm font-semibold text-ink-soft">Dag</span>
            <input
              type="date"
              required
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
              className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-3"
            />
          </label>
          <label>
            <span className="text-sm font-semibold text-ink-soft">Uur</span>
            <input
              type="time"
              required
              value={tijd}
              onChange={(e) => setTijd(e.target.value)}
              className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-3"
            />
          </label>
        </div>

        {botsing ? (
          <p className="mt-2 rounded-2xl bg-accent-soft p-3 text-sm text-accent-ink">
            Om {hhmm(new Date(botsing.starts_at), tz)} staat al <strong>{botsing.title}</strong>.
            Twee dingen zo dicht bij elkaar kan veel zijn.
          </p>
        ) : null}

        <label className="mt-3 block">
          <span className="text-sm font-semibold text-ink-soft">Wat?</span>
          <input
            required
            value={titel}
            onChange={(e) => setTitel(e.target.value)}
            placeholder="Tandarts"
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>

        <div className="mt-3">
          <span className="text-sm font-semibold text-ink-soft">Soort</span>
          <div className="mt-1 flex flex-wrap gap-2">
            {SOORTEN.map((s) => (
              <button
                key={s.waarde}
                type="button"
                onClick={() => {
                  setSoort(s.waarde)
                  setEmoji(s.emoji)
                }}
                aria-pressed={soort === s.waarde}
                className={`min-h-[2.4rem] rounded-pill border px-3 text-sm font-semibold ${
                  soort === s.waarde
                    ? 'border-accent bg-accent-soft text-accent-ink'
                    : 'border-line bg-surface text-ink-soft'
                }`}
              >
                {s.emoji} {s.label}
              </button>
            ))}
          </div>
        </div>

        <label className="mt-3 block">
          <span className="text-sm font-semibold text-ink-soft">Wie komt er, of met wie?</span>
          <select
            value={persoonId ?? ''}
            onChange={(e) => setPersoonId(e.target.value || null)}
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          >
            <option value="">Niemand in het bijzonder</option>
            {(mensen ?? [])
              .filter((p) => p.kind !== 'self')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.relation}
                </option>
              ))}
          </select>
        </label>

        <div className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink-soft">
              Wat moet de persoon weten?
            </span>
            <DictateButton onTekst={(t) => setNotitie(t)} />
          </div>
          <textarea
            value={notitie}
            onChange={(e) => setNotitie(e.target.value)}
            rows={2}
            placeholder="Els haalt je om 13:30 op. Neem je identiteitskaart mee."
            className="mt-1 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
          />
          <span className="mt-1 block text-xs text-ink-faint">
            Dit wordt getoond en voorgelezen vlak voor de afspraak.
          </span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={bewaar.isPending}
            className="flex min-h-touch flex-1 items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
          >
            {bewaar.isPending ? 'Opslaan…' : 'Opslaan'}
          </button>
          {item ? (
            <button
              type="button"
              onClick={() => {
                if (confirm(`"${item.title}" verwijderen?`)) wis.mutate()
              }}
              className="min-h-touch rounded-pill border-[1.5px] border-alert px-5 font-semibold text-alert"
            >
              Verwijderen
            </button>
          ) : null}
        </div>

        {fout ? (
          <p role="alert" className="mt-3 rounded-2xl bg-alert-soft p-3 text-sm text-alert">
            {fout}
          </p>
        ) : null}
      </form>
    </div>
  )
}
