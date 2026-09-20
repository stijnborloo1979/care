import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dismissAlert, getSummary, type Summary } from '../../services/dashboard'
import { dateLine, greeting, hhmm } from '../../lib/time'
import { useNow } from '../today/useAgenda'
import Icon from '../../components/Icon'
import Skeleton from '../../components/Skeleton'

interface Props {
  householdId: string
  personName: string
  timezone: string
  viewerName: string
}

type Toestand = { kleur: string; titel: string; onder: string; ok: boolean }

/**
 * De statuskaart is de hele bedoeling van dit scherm: familie moet in
 * één blik zien of ze zich zorgen moeten maken. Alles daaronder is
 * verdieping voor wie het wil weten.
 */
function toestandVan(s: Summary, now: Date): Toestand {
  const medLaat = s.meds.filter(
    (m) => !m.taken_at && new Date(m.due_at).getTime() < now.getTime() - 3600_000,
  )
  if (medLaat.length > 0) {
    return {
      kleur: 'var(--warn)',
      titel: 'Eén punt van aandacht',
      onder: `${medLaat.length} medicatiemoment${medLaat.length > 1 ? 'en' : ''} niet bevestigd`,
      ok: false,
    }
  }

  const gemist = s.events.filter(
    (e) => !e.done_at && new Date(e.starts_at).getTime() < now.getTime() - 3600_000,
  )
  if (gemist.length >= 3) {
    return {
      kleur: 'var(--warn)',
      titel: 'De dag wijkt af',
      onder: `${gemist.length} momenten zijn niet afgevinkt`,
      ok: false,
    }
  }

  return {
    kleur: 'var(--ok)',
    titel: 'Vandaag verloopt normaal',
    onder: 'Geen bijzonderheden',
    ok: true,
  }
}

export default function Dashboard({ householdId, personName, timezone, viewerName }: Props) {
  const now = useNow()
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['summary', householdId],
    queryFn: () => getSummary(householdId, timezone),
    staleTime: 30_000,
    refetchInterval: 120_000,
  })

  const bevestig = useMutation<unknown, Error, { id: string; taken: boolean; householdId: string }>({
    mutationKey: ['confirmMedication'],
  })

  const wegklikken = useMutation({
    mutationFn: (id: string) => dismissAlert(id),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['summary', householdId] }),
  })

  if (isLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-28 w-full" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    )
  if (isError || !data) return <p className="text-ink-soft">Het overzicht is nu niet te laden.</p>

  const t = toestandVan(data, now)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight">
          {greeting(now, timezone)}, {viewerName}
        </h1>
        <p className="mt-1 text-lg text-ink-soft">
          {personName} — {dateLine(now, timezone)}
        </p>
      </header>

      {/* De hele bedoeling van dit scherm in één blik. Daarom groot, met
          ruimte eromheen, en niet als zoveelste rij in een lijst. */}
      <div
        className="relative overflow-hidden rounded-[28px] p-7 shadow-lift"
        style={{
          background: t.ok
            ? 'linear-gradient(135deg, var(--ok-soft, var(--surface-2)), var(--surface))'
            : 'linear-gradient(135deg, var(--accent-soft), var(--surface))',
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: t.kleur }}
            aria-hidden="true"
          />
          {/* Nooit alleen kleur: het woord staat er altijd bij. */}
          <span className="text-sm font-bold uppercase tracking-wide text-ink-faint">
            {t.ok ? 'rustig' : 'opvolgen'}
          </span>
        </div>

        <p className="mt-3 text-3xl font-extrabold leading-tight tracking-tight">{t.titel}</p>
        <p className="mt-1 text-lg text-ink-soft">{t.onder}</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-card bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Vandaag</h2>
            <Link
              to="/persoon"
              className="flex items-center gap-1 text-sm font-semibold text-accent-ink"
            >
              Scherm van {personName}
              <Icon naam="verder" size={16} />
            </Link>
          </div>

          {data.log.length === 0 && data.events.length === 0 ? (
            <p className="mt-3 text-ink-soft">Er staat vandaag nog niets ingepland.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.log.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-baseline gap-3">
                  <span className="w-12 shrink-0 font-bold tabular-nums text-ink-soft">
                    {hhmm(new Date(l.occurred_at), timezone)}
                  </span>
                  <span className="min-w-0 flex-1">
                    {l.title}
                    {l.note ? <span className="block text-sm text-ink-soft">{l.note}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-sm text-ink-faint">
            {data.events.filter((e) => e.done_at).length} van {data.events.length} afgevinkt
          </p>
        </section>

        <section className="rounded-card bg-surface p-6 shadow-card">
          <h2 className="text-lg font-bold">Aandacht</h2>
          {data.alerts.length === 0 ? (
            <p className="mt-3 text-ink-soft">Niets dat opvolging vraagt.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {data.alerts.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span aria-hidden="true">
                    {a.level === 'warn' ? '🟠' : a.level === 'alert' ? '🔴' : '🔵'}
                  </span>
                  <span className="min-w-0 flex-1">
                    {a.body}
                    <span className="block text-sm text-ink-faint">
                      {hhmm(new Date(a.created_at), timezone)}
                    </span>
                  </span>
                  <button
                    onClick={() => wegklikken.mutate(a.id)}
                    className="shrink-0 rounded-pill border border-line px-3 py-1 text-sm font-semibold"
                  >
                    Gezien
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">Medicatie vandaag</h2>
        {data.meds.length === 0 ? (
          <p className="mt-3 text-ink-soft">Geen medicatie ingepland.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.meds.map((m) => {
              const laat = !m.taken_at && new Date(m.due_at).getTime() < now.getTime() - 3600_000
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-none"
                >
                  <span className="w-12 shrink-0 font-bold tabular-nums text-ink-soft">
                    {hhmm(new Date(m.due_at), timezone)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{m.name}</span>
                    {m.dose ? <span className="text-ink-soft"> — {m.dose}</span> : null}
                  </span>
                  <span
                    className={`shrink-0 rounded-pill border px-3 py-1 text-sm font-semibold ${
                      m.taken_at
                        ? 'border-ok text-ok'
                        : laat
                          ? 'border-alert text-alert'
                          : 'border-line text-ink-soft'
                    }`}
                  >
                    {m.taken_at ? '✅ genomen' : laat ? '⚠️ niet bevestigd' : '🕒 later'}
                  </span>
                  <button
                    onClick={() => bevestig.mutate({ id: m.id, taken: !m.taken_at, householdId })}
                    className="min-h-[2.4rem] shrink-0 rounded-pill border-[1.5px] border-line-strong px-3 text-sm font-semibold"
                  >
                    {m.taken_at ? 'Ongedaan' : 'Bevestigen'}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-4 text-sm text-ink-faint">
          Thuis stelt geen diagnose en vervangt geen professionele zorg. Bij twijfel over medicatie:
          bel de huisarts.
        </p>
      </section>
    </div>
  )
}
