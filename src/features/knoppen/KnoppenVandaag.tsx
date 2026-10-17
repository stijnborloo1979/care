import { Link } from 'react-router-dom'
import Icon, { type IconNaam } from '../../components/Icon'
import { dateLine, greeting, hhmm } from '../../lib/time'
import { tt } from '../../lib/uiTaal'
import { t } from '../../lib/i18n'
import type { AgendaEvent } from '../../services/agenda'
import { isHuis } from '../../services/afdelingsdag'
import { useMarkDone, useNow } from '../today/useAgenda'
import { useVandaag } from '../today/useVandaag'
import { STATUS_LABEL, statusOf, whatNow } from '../today/whatNow'
import MedicatieKaart from '../medication/MedicatieKaart'

interface Props {
  householdId: string
  personName: string
  timezone: string
}

/**
 * Vandaag in de grote-knoppen-weergave.
 *
 * Eén ding tegelijk: wat nu moet staat groot bovenaan, met één grote knop.
 * Daaronder wat erna komt, de medicatie met foto, en alle afspraken van de
 * dag, elk aan of uit te vinken.
 *
 * Dezelfde gegevens en dezelfde "wat nu"-logica als het gewone overzicht
 * (useVandaag en whatNow); alleen de vorm verschilt. De normale weergave
 * blijft ongewijzigd.
 */
export default function KnoppenVandaag({ householdId, personName, timezone }: Props) {
  const now = useNow()
  const { data, isLoading, isError } = useVandaag(householdId, timezone, now)
  const markDone = useMarkDone(householdId)

  const events = data ?? []
  const { current, next } = whatNow(events, now)

  // Alle afspraken van vandaag, ook die bovenaan staan: elk moet in de lijst
  // af te vinken zijn. Gedane afspraken blijven staan, zodat je ze terugzet.
  const alle = [...events].sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  return (
    <div className="space-y-7">
      <header>
        <p className="text-2xl font-semibold text-ink-soft">{dateLine(now, timezone)}</p>
        <h1 className="mt-1 text-5xl font-extrabold tracking-tight">
          {greeting(now, timezone)}, {personName}
        </h1>
      </header>

      {/* Eén ding tegelijk: wat nu moet. */}
      <section aria-labelledby="nu-titel" className="rounded-[2rem] border-[3px] border-accent bg-surface p-8 shadow-lift">
        <h2 id="nu-titel" className="text-2xl font-extrabold text-accent-ink">
          {t('vandaag.nu')}
        </h2>
        {isLoading ? (
          <p className="mt-3 text-2xl text-ink-soft">{t('watnu.laden')}</p>
        ) : isError ? (
          <p className="mt-3 text-2xl text-ink-soft">{t('vandaag.planningWeg')}</p>
        ) : current ? (
          <NuKaart event={current} timezone={timezone} onDone={(id) => markDone.mutate({ id, done: true })} />
        ) : (
          <div className="mt-3">
            <p className="text-5xl font-extrabold leading-tight">{t('watnu.rusten')}</p>
            <p className="mt-3 text-2xl text-ink-soft">{t('watnu.nietsDatMoet')}</p>
          </div>
        )}
      </section>

      {/* Daarna: wat er straks komt. */}
      {next ? (
        <section aria-labelledby="daarna-titel" className="space-y-3">
          <h2 id="daarna-titel" className="text-2xl font-bold text-ink-soft">
            {t('vandaag.daarna')}
          </h2>
          <div className="flex items-center gap-5 rounded-[1.75rem] bg-surface p-6 shadow-card">
            <span className="text-5xl" aria-hidden="true">
              {next.emoji ?? '📌'}
            </span>
            <span>
              <span className="block text-3xl font-extrabold">{next.title}</span>
              <span className="mt-1 block text-2xl text-ink-soft">
                {t('vandaag.om', { tijd: hhmm(new Date(next.starts_at), timezone) })}
              </span>
            </span>
          </div>
        </section>
      ) : null}

      {/* Medicatie: met de foto van de verpakking, zoals op het gewone scherm. */}
      <MedicatieKaart householdId={householdId} timezone={timezone} />

      {/* Alle afspraken van de dag, elk aan of uit te vinken, net als op het
          gewone scherm. */}
      {alle.length > 0 ? (
        <section aria-labelledby="later-titel" className="space-y-3">
          <h2 id="later-titel" className="text-2xl font-bold text-ink-soft">
            {tt('Vandaag')}
          </h2>
          <ul className="overflow-hidden rounded-[1.75rem] bg-surface shadow-card">
            {alle.map((e) => {
              const gedaan = statusOf(e, now) === 'done'
              return (
                <li
                  key={e.id}
                  className="flex min-h-[6rem] flex-wrap items-center gap-4 border-b border-line px-6 py-5 last:border-b-0"
                >
                  <span className="w-28 text-3xl font-extrabold">{hhmm(new Date(e.starts_at), timezone)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-3xl ${gedaan ? 'text-ink-soft line-through' : ''}`}>{e.title}</span>
                    <span className="block text-xl text-ink-soft">{STATUS_LABEL[statusOf(e, now)]}</span>
                  </span>
                  {isHuis(e) ? null : (
                    <button
                      type="button"
                      onClick={() => markDone.mutate({ id: e.id, done: !gedaan })}
                      className={`min-h-[4.5rem] min-w-[11rem] rounded-pill px-6 text-2xl font-bold ${
                        gedaan ? 'border-2 border-line bg-surface text-ink' : 'bg-accent-ink text-white'
                      }`}
                    >
                      {gedaan ? t('vandaag.ongedaan') : t('vandaag.afvinken')}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {/* Vaste grote acties onderaan. */}
      <nav aria-label={tt('Hoofdmenu')} className="grid grid-cols-3 gap-4 pt-2">
        <GroteActie to="/wie" icoon="wie" label={tt('Wie komt er?')} />
        <GroteActie to="/memory" icoon="memory" label={tt('Waar ligt het?')} />
        <GroteActie to="/help" icoon="help" label={tt('Help')} donker />
      </nav>
    </div>
  )
}

/** Het grote blok "nu": tekst, tijd en één knop die alles afvinkt. */
function NuKaart({
  event,
  timezone,
  onDone,
}: {
  event: AgendaEvent
  timezone: string
  onDone: (id: string) => void
}) {
  return (
    <div className="mt-3">
      <p className="text-6xl font-extrabold leading-tight tracking-tight">{event.title}</p>
      {event.note ? <p className="mt-2 text-2xl text-ink-soft">{event.note}</p> : null}
      <p className="mt-2 text-3xl text-ink-soft">
        {t('vandaag.om', { tijd: hhmm(new Date(event.starts_at), timezone) })}
      </p>

      {/* Iets van het woonzorgcentrum vinkt de bewoner niet af. */}
      {isHuis(event) ? null : (
        <button
          type="button"
          onClick={() => onDone(event.id)}
          className="mt-6 flex min-h-[7rem] w-full items-center justify-center gap-4 rounded-pill bg-accent-ink text-3xl font-bold text-white shadow-lift"
        >
          <Icon naam="gedaan" size={36} />
          {t('vandaag.ditIsGedaan')}
        </button>
      )}
    </div>
  )
}

function GroteActie({
  to,
  icoon,
  label,
  donker,
}: {
  to: string
  icoon: IconNaam
  label: string
  donker?: boolean
}) {
  return (
    <Link
      to={to}
      className={`flex min-h-[8.5rem] flex-col items-center justify-center gap-3 rounded-[1.75rem] p-4 text-center text-2xl font-bold shadow-card ${
        donker ? 'bg-accent-ink text-white' : 'bg-surface text-ink'
      }`}
    >
      <Icon naam={icoon} size={40} />
      {label}
    </Link>
  )
}
