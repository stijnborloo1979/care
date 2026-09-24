import { t } from '../../lib/i18n'
import { useNavigate } from 'react-router-dom'
import type { AgendaEvent } from '../../services/agenda'
import { dateLine, greeting, hhmm } from '../../lib/time'
import { STATUS_LABEL, statusOf, whatNow } from './whatNow'
import { useAgenda, useMarkDone, useNow } from './useAgenda'
import PersonInbox from '../messages/PersonInbox'
import Icon, { type IconNaam } from '../../components/Icon'
import Skeleton from '../../components/Skeleton'
import OnthoudDit from '../memory/OnthoudDit'
import VertelEens from '../stories/VertelEens'
import VandaagVroeger from '../memories/VandaagVroeger'
import { RadioKaart } from '../radio/Radio'
import { useState } from 'react'
import SupportRequestBanner from '../sharing/SupportRequestBanner'
import { useHousehold } from '../household/useHousehold'
import { Link } from 'react-router-dom'

interface Props {
  householdId: string
  personName: string
  timezone: string
}

export default function Today({ householdId, personName, timezone }: Props) {
  const now = useNow()
  const { data, isLoading, isError } = useAgenda(householdId, timezone)
  const markDone = useMarkDone(householdId)
  const navigate = useNavigate()
  const [fotoVraag, setFotoVraag] = useState<string | null>(null)

  const events = data ?? []
  const { current, next } = whatNow(events, now)

  return (
    <main className="vandaag mx-auto flex max-w-[36rem] flex-col px-5 pb-32 pt-6">
      <header className="order-1">
        <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight">
          {greeting(now, timezone)}, {personName}
        </h1>
        <p className="mt-1 text-lg text-ink-soft">{dateLine(now, timezone)}</p>
      </header>

      {/* Twee groepen, zodat het liggende scherm er twee kolommen van
          maakt. Staand tellen de wikkels niet mee (display: contents) en
          zetten de order-klassen alles terug in de vertrouwde volgorde. */}
      <div className="kolom-rechts">
        <div className="order-2 mt-6 space-y-4">
          <SupportRequestBanner />
          <PersonInbox householdId={householdId} />
        </div>

        <div className="order-5 mt-6">
          <OnthoudDit householdId={householdId} timezone={timezone} />
        </div>

        {/* Na het praktische: iets om naar te kijken en iets om te vertellen. */}
        <div className="order-6 mt-8 space-y-4">
          <RadioKaart householdId={householdId} />
          <VandaagVroeger
            householdId={householdId}
            timezone={timezone}
            onVertel={(v) => setFotoVraag(v)}
          />
          {fotoVraag ? (
            <VertelEens
              householdId={householdId}
              timezone={timezone}
              extraVraag={fotoVraag}
              onKlaar={() => setFotoVraag(null)}
            />
          ) : null}
          <VertelEens householdId={householdId} timezone={timezone} />
        </div>
      </div>

      <div className="kolom-links">
        <section className="order-3 mt-6" aria-labelledby="nu">
          <h2 id="nu" className="text-base font-bold text-ink-faint">
            {t('vandaag.nu')}
          </h2>
          <div className="mt-2">
            {isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : isError ? (
              <p className="text-ink-soft">{t('vandaag.planningWeg')}</p>
            ) : (
              <NowCard
                event={current}
                timezone={timezone}
                onDone={(id) => markDone.mutate({ id, done: true })}
              />
            )}
          </div>
        </section>

        {next ? (
          <section className="order-4 mt-6" aria-labelledby="daarna">
            <h2 id="daarna" className="text-base font-bold text-ink-faint">
              {t('vandaag.daarna')}
            </h2>
            <div className="mt-2 flex items-center gap-4 rounded-card bg-surface p-5 shadow-card">
              <span className="text-3xl" aria-hidden="true">
                {next.emoji ?? '📌'}
              </span>
              <span>
                <span className="block text-lg font-bold">{next.title}</span>
                <span className="text-ink-soft">
                  {t('vandaag.om', { tijd: hhmm(new Date(next.starts_at), timezone) })}
                </span>
              </span>
            </div>
          </section>
        ) : null}

        {events.length > 0 ? (
          <section className="order-7 mt-6" aria-labelledby="vandaag">
            <h2 id="vandaag" className="text-base font-bold text-ink-faint">
              {t('vandaag.vandaag')}
            </h2>
            <ol className="mt-2 rounded-card bg-surface p-5 shadow-card">
              {events.map((e) => (
                <TimelineRow
                  key={e.id}
                  event={e}
                  now={now}
                  timezone={timezone}
                  onToggle={(id, done) => markDone.mutate({ id, done })}
                />
              ))}
            </ol>
          </section>
        ) : null}

        <section className="order-8 mt-8 grid grid-cols-3 gap-2">
          <BigButton
            icoon="praten"
            label={t('vandaag.watnu')}
            onClick={() => navigate('/nu')}
            highlight
          />
          <BigButton icoon="wie" label={t('vandaag.familie')} onClick={() => navigate('/wie')} />
          <BigButton icoon="help" label={t('vandaag.help')} onClick={() => navigate('/help')} alert />
        </section>
      </div>


      <EigenaarLinks />
    </main>
  )
}

function NowCard({
  event,
  timezone,
  onDone,
}: {
  event: AgendaEvent | null
  timezone: string
  onDone: (id: string) => void
}) {
  if (!event) {
    return (
      <div className="rounded-card bg-accent-soft p-7 shadow-lift ring-1 ring-accent/25">
        <div className="text-5xl" aria-hidden="true">
          🍵
        </div>
        <p className="mt-2 text-3xl font-extrabold leading-tight tracking-tight">
          {t('watnu.rusten')}
        </p>
        <p className="mt-2 text-lg text-ink-soft">Er is nu niets dat moet. Straks is er weer iets.</p>
      </div>
    )
  }

  return (
    <div className="rounded-card bg-accent-soft p-7 shadow-lift ring-1 ring-accent/25">
      <div className="text-5xl" aria-hidden="true">
        {event.emoji ?? '📌'}
      </div>
      <p className="mt-2 text-3xl font-extrabold leading-tight tracking-tight">{event.title}</p>
      {event.note ? <p className="mt-2 text-lg text-ink-soft">{event.note}</p> : null}
      <p className="mt-1 text-ink-faint">om {hhmm(new Date(event.starts_at), timezone)}</p>

      <button
        onClick={() => onDone(event.id)}
        className="mt-6 flex min-h-[3.4rem] w-full items-center justify-center gap-2 rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white shadow-lift"
      >
        <Icon naam="gedaan" size={20} />
        Dit is gedaan
      </button>
    </div>
  )
}

function TimelineRow({
  event,
  now,
  timezone,
  onToggle,
}: {
  event: AgendaEvent
  now: Date
  timezone: string
  onToggle: (id: string, done: boolean) => void
}) {
  const status = statusOf(event, now)
  const gedaan = status === 'done'

  return (
    <li className="flex items-start gap-3 border-b border-line/70 py-3 last:border-none">
      <span className="w-14 shrink-0 pt-1 font-bold tabular-nums text-ink-soft">
        {hhmm(new Date(event.starts_at), timezone)}
      </span>

      <span
        aria-hidden="true"
        className={`mt-2 h-4 w-4 shrink-0 rounded-full border-2 ${
          gedaan
            ? 'border-ok bg-ok'
            : status === 'now'
              ? 'border-accent bg-accent'
              : 'border-line-strong bg-surface'
        }`}
      />

      <span className="min-w-0 flex-1">
        <span className={`block text-lg font-semibold ${gedaan ? 'text-ink-faint line-through' : ''}`}>
          {event.emoji ? `${event.emoji} ` : ''}
          {event.title}
        </span>
        {/* Status nooit alleen via kleur: het woord staat er altijd bij. */}
        <span className="text-sm text-ink-faint">{STATUS_LABEL[status]}</span>
      </span>

      <button
        onClick={() => onToggle(event.id, !gedaan)}
        className="min-h-[2.4rem] shrink-0 rounded-pill border-[1.5px] border-line-strong px-3 text-sm font-semibold"
      >
        {gedaan ? 'Ongedaan' : 'Afvinken'}
      </button>
    </li>
  )
}

function BigButton({
  icoon,
  label,
  onClick,
  highlight,
  alert,
}: {
  icoon: IconNaam
  label: string
  onClick: () => void
  highlight?: boolean
  alert?: boolean
}) {
  const stijl = highlight
    ? 'bg-accent-ink text-white border-accent-ink shadow-lift'
    : alert
      ? 'bg-surface text-alert border-alert/40'
      : 'bg-surface border-line'

  return (
    <button
      onClick={onClick}
      className={`flex min-h-big flex-col items-center justify-center gap-1 rounded-card border-[1.5px] px-2 text-center font-bold shadow-card ${stijl}`}
    >
      <Icon naam={icoon} size={28} />
      {label}
    </button>
  )
}

/**
 * Wie de app zelf gebruikt, beheert ook zelf: afspraken, Home Memory,
 * familie uitnodigen, en wie wat ziet. Bewust klein onderaan, zodat het
 * dagscherm rustig blijft.
 */
function EigenaarLinks() {
  const { household } = useHousehold()
  if (!household?.is_self) return null
  return (
    <div className="eigenaar mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-base font-semibold text-accent-ink">
      <Link to="/familie" className="underline underline-offset-4">
        Beheren
      </Link>
      <Link to="/delen" className="underline underline-offset-4">
        Wie ziet wat
      </Link>
    </div>
  )
}
