import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useHouseholds } from '../household/useHousehold'
import { useAuth } from '../auth/AuthProvider'
import { getWeekSamen, laatLos, neemOp, planBezoek } from '../../services/weekSamen'
import { claimTask } from '../../services/tasks'
import { localDateKey, maandagVan, plusDagen } from '../../lib/time'
import Icon from '../../components/Icon'
import { tt, uiLocale } from '../../lib/uiTaal'

/**
 * De week samen.
 *
 * De belofte van deze app is dat familie kan samenzorgen "zonder voortdurend
 * te moeten bellen". Voor de persoon was dat opgelost — die ziet wie er komt.
 * Tussen Els, Jan en Sofie onderling niet: wie gaat er donderdag langs, wie
 * rijdt naar de dokter? Dat gesprek gebeurde nog altijd in een groepschat.
 *
 * Dit scherm toont zeven dagen, en per dag wie er langsgaat bij wie. Het
 * belangrijkste wat je erop ziet is niet wat er gepland staat maar wat er
 * níét staat: een dag waarop niemand komt. Daarom staat dat er als een zin
 * en niet als een leeg vak.
 *
 * Over alle huishoudens tegelijk, want wie voor twee ouders zorgt — of voor
 * twee mensen die samenwonen — moest daarvoor heen en weer wisselen. Twee
 * mensen die samenwonen blijven twee huishoudens: hun medicatie en hun
 * dagindeling mogen niet door elkaar lopen. Alleen dit overzicht is gedeeld.
 */
export default function WeekSamen() {
  const { session } = useAuth()
  const { data: alle } = useHouseholds()
  const queryClient = useQueryClient()

  const mijn = useMemo(
    () => (alle ?? []).filter((h) => h.role === 'admin' || h.role === 'member'),
    [alle],
  )
  const tz = mijn[0]?.timezone ?? 'Europe/Brussels'
  const vandaag = localDateKey(new Date(), tz)
  const [maandag, setMaandag] = useState(() => maandagVan(vandaag))

  const sleutel = mijn.map((h) => h.household_id).join(',')

  const { data, isLoading } = useQuery({
    queryKey: ['week-samen', sleutel, maandag],
    queryFn: () =>
      getWeekSamen(
        mijn.map((h) => ({
          household_id: h.household_id,
          person_name: h.person_name,
          timezone: h.timezone,
        })),
        maandag,
      ),
    enabled: mijn.length > 0,
  })

  const vernieuw = () => queryClient.invalidateQueries({ queryKey: ['week-samen'] })

  const opnemen = useMutation({ mutationFn: neemOp, onSuccess: vernieuw })
  const loslaten = useMutation({ mutationFn: laatLos, onSuccess: vernieuw })
  const taakOpnemen = useMutation({ mutationFn: claimTask, onSuccess: vernieuw })
  const bezoek = useMutation({
    mutationFn: (v: { hh: string; dag: string }) => planBezoek(v.hh, v.dag),
    onSuccess: vernieuw,
  })

  const dagNaam = new Intl.DateTimeFormat(uiLocale(), { weekday: 'long', day: 'numeric', month: 'long' })

  if (mijn.length === 0) {
    return (
      <p className="text-ink-soft">
        {tt('Dit scherm toont de week van de mensen voor wie je zorgt. Je bent nog nergens familielid.')}
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tt('De week samen')}</h1>
          <p className="mt-1 max-w-[62ch] text-ink-soft">
            {tt('Wie gaat er wanneer langs, en wie doet wat. Zeg het hier in plaats van het te bellen.')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMaandag(plusDagen(maandag, -7))}
            aria-label={tt('Vorige week')}
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface"
          >
            ‹
          </button>
          <button
            onClick={() => setMaandag(maandagVan(vandaag))}
            className="min-h-touch rounded-pill border border-line bg-surface px-4 font-semibold"
          >
            {tt('Deze week')}
          </button>
          <button
            onClick={() => setMaandag(plusDagen(maandag, 7))}
            aria-label={tt('Volgende week')}
            className="grid h-11 w-11 place-items-center rounded-full border border-line bg-surface"
          >
            ›
          </button>
        </div>
      </header>

      {isLoading ? <p className="text-ink-soft">{tt('Even geduld…')}</p> : null}

      <div className="space-y-4">
        {(data ?? []).map((d) => (
          <section
            key={d.dag}
            className={`rounded-card bg-surface p-5 shadow-card ${
              d.dag === vandaag ? 'border-[1.5px] border-accent' : ''
            }`}
          >
            <h2 className="text-lg font-bold first-letter:uppercase">
              {dagNaam.format(new Date(d.dag + 'T12:00:00'))}
              {d.dag === vandaag ? <span className="ml-2 text-accent-ink">{tt('vandaag')}</span> : null}
            </h2>

            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {d.perPersoon.map((p) => (
                <div key={p.household_id} className="rounded-2xl border border-line p-4">
                  {/* De naam alleen tonen wanneer er meer dan één persoon is:
                      bij één huishouden zou hij op elke kaart staan zonder
                      iets toe te voegen. */}
                  {d.perPersoon.length > 1 ? (
                    <p className="font-semibold text-ink-soft">{p.naam}</p>
                  ) : null}

                  <ul className="mt-1 space-y-2">
                    {p.items.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center gap-2">
                        <span aria-hidden className="text-xl">
                          {e.emoji ?? (e.kind === 'appt' ? '📅' : '👋')}
                        </span>
                        <span className="min-w-[min(8rem,100%)] flex-1">
                          <span className="font-semibold">{e.title}</span>
                          <span className="block text-sm text-ink-soft">
                            {new Date(e.starts_at).toLocaleTimeString(uiLocale(), {
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: tz,
                            })}
                            {e.opnemer ? ` · ${e.opnemer}` : ''}
                          </span>
                        </span>

                        {e.claimed_by === session?.user.id ? (
                          <button
                            onClick={() => loslaten.mutate(e.id)}
                            className="min-h-touch shrink-0 rounded-pill border border-line px-4 text-sm font-semibold"
                          >
                            {tt('Toch niet')}
                          </button>
                        ) : e.claimed_by ? null : (
                          <button
                            onClick={() => opnemen.mutate(e.id)}
                            className="min-h-touch shrink-0 rounded-pill border-[1.5px] border-line-strong px-4 text-sm font-semibold"
                          >
                            {tt('Ik doe dit')}
                          </button>
                        )}
                      </li>
                    ))}

                    {p.taken.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-2">
                        <span aria-hidden className="text-xl">
                          ✓
                        </span>
                        <span className="min-w-[min(8rem,100%)] flex-1">
                          <span className={t.done_at ? 'line-through text-ink-faint' : ''}>
                            {t.title}
                          </span>
                        </span>
                        {!t.assignee && !t.done_at ? (
                          <button
                            onClick={() => taakOpnemen.mutate(t.id)}
                            className="min-h-touch shrink-0 rounded-pill border border-line px-4 text-sm font-semibold"
                          >
                            {tt('Ik doe dit')}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {/* Wat er niet staat is het belangrijkste van dit scherm. */}
                  {p.geenBezoek ? (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <span className="flex items-center gap-2 text-sm text-ink-soft">
                        <Icon naam="wie" size={16} />
                        {tt('Niemand gepland')}
                      </span>
                      <button
                        onClick={() => bezoek.mutate({ hh: p.household_id, dag: d.dag })}
                        disabled={bezoek.isPending}
                        className="min-h-touch rounded-pill border-[1.5px] border-accent bg-accent-soft px-4 text-sm font-semibold disabled:opacity-60"
                      >
                        {tt('Ik ga langs')}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="text-sm text-ink-faint">
        {tt('Een bezoek dat je hier plant, staat om 14:00 en verschijnt meteen op het scherm van de persoon. Het uur verzet je in de kalender.')}
      </p>
    </div>
  )
}
