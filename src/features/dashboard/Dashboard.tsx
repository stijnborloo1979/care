import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { dismissAlert, getSummary, type Summary } from '../../services/dashboard'
import { hhmm } from '../../lib/time'
import { useNow } from '../today/useAgenda'
import Icon from '../../components/Icon'
import Skeleton from '../../components/Skeleton'
import { useHousehold } from '../household/useHousehold'
import BezoekVastleggen from '../bezoek/BezoekVastleggen'
import DagVerhaal from '../dagverhaal/DagVerhaal'
import GespreksStarters from '../bezoek/GespreksStarters'
import DagInHetHuis from '../afdelingsdag/DagInHetHuis'
import NieuwsVanHetHuis from '../nieuws/NieuwsVanHetHuis'
import UitstapKaart from '../uitstap/UitstapKaart'
import SpullenKaart from '../spullen/SpullenKaart'
import { tt, uiLocale } from '../../lib/uiTaal'

/** Groet en datum in de taal van de familie (niet die van de tablet). */
function uiGroet(d: Date, tz: string): string {
  const uur = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(d))
  if (uur < 6) return tt('Goedenacht')
  if (uur < 12) return tt('Goedemorgen')
  if (uur < 18) return tt('Goedemiddag')
  return tt('Goedenavond')
}

function uiDatum(d: Date, tz: string): string {
  const s = new Intl.DateTimeFormat(uiLocale(), { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

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
      titel: tt('Eén punt van aandacht'),
      onder:
        medLaat.length > 1
          ? tt('{n} medicatiemomenten niet bevestigd', { n: medLaat.length })
          : tt('{n} medicatiemoment niet bevestigd', { n: medLaat.length }),
      ok: false,
    }
  }

  const gemist = s.events.filter(
    (e) => !e.done_at && new Date(e.starts_at).getTime() < now.getTime() - 3600_000,
  )
  if (gemist.length >= 3) {
    return {
      kleur: 'var(--warn)',
      titel: tt('De dag wijkt af'),
      onder: tt('{n} momenten zijn niet afgevinkt', { n: gemist.length }),
      ok: false,
    }
  }

  return {
    kleur: 'var(--ok)',
    titel: tt('Vandaag verloopt normaal'),
    onder: tt('Geen bijzonderheden'),
    ok: true,
  }
}

export default function Dashboard({ householdId, personName, timezone, viewerName }: Props) {
  const now = useNow()
  const { household } = useHousehold()
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
  if (isError || !data) return <p className="text-ink-soft">{tt('Het overzicht is nu niet te laden.')}</p>

  const t = toestandVan(data, now)
  const niveau = household?.support_level ?? 'ondersteund'
  // Wie er langskwam: voor de persoon die het vergeet, en voor familie die
  // wil weten wie er deze week was. Op elk ondersteuningsniveau, zoals de
  // agenda; onder de toestand, die blijft het eerste wat je ziet.
  const bezoek = !household?.is_self ? (
    <BezoekVastleggen householdId={householdId} personName={personName} timezone={timezone} vorm="familie" />
  ) : null

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight">
          {uiGroet(now, timezone)}, {viewerName}
        </h1>
        <p className="mt-1 text-lg text-ink-soft">
          {personName} — {uiDatum(now, timezone)}
        </p>
      </header>

      {niveau === 'zelf' && !household?.is_self ? (
        <div className="rounded-[28px] bg-surface p-7 shadow-card">
          <p className="text-2xl font-extrabold tracking-tight">
            {tt('{naam} gebruikt LifeAngle zelfstandig', { naam: personName })}
          </p>
          <p className="mt-2 text-lg text-ink-soft">
            {tt('Je kan mee plannen en berichten sturen. Medicatie, het logboek en persoonlijke notities ziet alleen {naam}, tot {naam} zelf meer deelt.', { naam: personName })}
          </p>
          <Link
            to="/familie/delen"
            className="mt-4 inline-flex min-h-touch items-center rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
          >
            {tt('Meer hulp voorstellen')}
          </Link>
        </div>
      ) : null}

      {niveau === 'zelf' && !household?.is_self ? (
        <>
          {bezoek}
          <NieuwsVanHetHuis householdId={householdId} timezone={timezone} />
        </>
      ) : null}

      {niveau !== 'zelf' || household?.is_self ? (
      <>
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
            {t.ok ? tt('rustig') : tt('opvolgen')}
          </span>
        </div>

        <p className="mt-3 text-3xl font-extrabold leading-tight tracking-tight">{t.titel}</p>
        <p className="mt-1 text-lg text-ink-soft">{t.onder}</p>
      </div>

      <DagVerhaal householdId={householdId} personName={personName} timezone={timezone} summary={data} />

      {bezoek}

      <DagInHetHuis householdId={householdId} personName={personName} timezone={timezone} />

      {/* Alleen bij een verblijf in een woonzorgcentrum. */}
      {household?.org_id && !household.is_self ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <UitstapKaart householdId={householdId} personName={personName} timezone={timezone} vorm="familie" />
          <SpullenKaart householdId={householdId} personName={personName} vorm="familie" />
        </div>
      ) : null}

      <NieuwsVanHetHuis householdId={householdId} timezone={timezone} />

      <GespreksStarters householdId={householdId} personName={personName} timezone={timezone} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-card bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">{tt('Vandaag')}</h2>
            <Link
              to="/persoon"
              className="flex items-center gap-1 text-sm font-semibold text-accent-ink"
            >
              {tt('Scherm van {naam}', { naam: personName })}
              <Icon naam="verder" size={16} />
            </Link>
          </div>

          {data.log.length === 0 && data.events.length === 0 ? (
            <p className="mt-3 text-ink-soft">{tt('Er staat vandaag nog niets ingepland.')}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.log.slice(0, 6).map((l) => (
                <li key={l.id} className="flex items-baseline gap-3">
                  <span className="w-14 shrink-0 whitespace-nowrap font-bold tabular-nums text-ink-soft">
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
            {tt('{n} van {totaal} afgevinkt', { n: data.events.filter((e) => e.done_at).length, totaal: data.events.length })}
          </p>
        </section>

        <section className="rounded-card bg-surface p-6 shadow-card">
          <h2 className="text-lg font-bold">{tt('Aandacht')}</h2>
          {data.alerts.length === 0 ? (
            <p className="mt-3 text-ink-soft">{tt('Niets dat opvolging vraagt.')}</p>
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
                    {tt('Gezien')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">{tt('Medicatie vandaag')}</h2>
        {data.meds.length === 0 ? (
          <p className="mt-3 text-ink-soft">{tt('Geen medicatie ingepland.')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {data.meds.map((m) => {
              const laat = !m.taken_at && new Date(m.due_at).getTime() < now.getTime() - 3600_000
              return (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line py-2 last:border-none"
                >
                  <span className="w-14 shrink-0 whitespace-nowrap font-bold tabular-nums text-ink-soft">
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
                    {m.taken_at ? tt('✅ genomen') : laat ? tt('⚠️ niet bevestigd') : tt('🕒 later')}
                  </span>
                  <button
                    onClick={() => bevestig.mutate({ id: m.id, taken: !m.taken_at, householdId })}
                    className="min-h-[2.4rem] shrink-0 rounded-pill border-[1.5px] border-line-strong px-3 text-sm font-semibold"
                  >
                    {m.taken_at ? tt('Ongedaan') : tt('Bevestigen')}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-4 text-sm text-ink-faint">
          {tt('LifeAngle stelt geen diagnose en vervangt geen professionele zorg. Bij twijfel over medicatie: bel de huisarts.')}
        </p>
      </section>
      </>
      ) : null}
    </div>
  )
}
