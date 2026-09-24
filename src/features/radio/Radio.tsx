import { Link, useLocation } from 'react-router-dom'
import { Pause, Play, Radio as RadioIcon, Volume1, Volume2 } from 'lucide-react'
import { useHousehold } from '../household/useHousehold'
import { useRadio } from './radioStore'
import { useZenders } from './useZenders'
import { t } from '../../lib/i18n'

/**
 * Het radioscherm van de persoon: één grote knop voor wat er nu speelt,
 * daaronder de andere zenders als tegels. Geen zoekveld, geen lijsten —
 * kiezen welke zenders erin staan, doet familie.
 */
export default function Radio() {
  const { household } = useHousehold()
  const { data: zenders, isLoading } = useZenders(household?.household_id ?? '')
  const { zender, speelt, laden, fout, volume, toggle, zetVolume } = useRadio()

  const huidig = zender ?? zenders?.[0] ?? null

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <Link to="/" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ {t('nav.vandaag')}
      </Link>
      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">{t('radio.titel')}</h1>

      {isLoading ? <p className="mt-6 text-ink-soft">{t('watnu.laden')}</p> : null}

      {!isLoading && (zenders ?? []).length === 0 ? (
        <p className="mt-6 text-lg text-ink-soft">
          {t('radio.geenZenders')}
        </p>
      ) : null}

      {huidig ? (
        <>
          <button
            onClick={() => toggle(huidig)}
            aria-pressed={speelt}
            className="mt-6 flex w-full items-center gap-5 rounded-card bg-accent-ink p-6 text-left text-white shadow-lift"
          >
            <span className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white/15">
              {speelt ? <Pause size={40} strokeWidth={2} /> : <Play size={40} strokeWidth={2} />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold uppercase tracking-wide text-white/75">
                {laden ? t('radio.geduld') : speelt ? t('radio.speelt') : t('radio.drukLuisteren')}
              </span>
              <span className="mt-1 block truncate text-2xl font-extrabold">{huidig.name}</span>
            </span>
          </button>

          <div className="mt-5 flex items-center gap-3 rounded-card bg-surface p-4 shadow-card">
            <Volume1 size={22} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink-soft" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => zetVolume(Number(e.target.value))}
              aria-label={t('radio.volume')}
              className="h-10 w-full accent-[var(--accent-ink)]"
            />
            <Volume2 size={22} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink-soft" />
          </div>
        </>
      ) : null}

      {fout ? (
        <p role="status" className="mt-4 rounded-2xl bg-accent-soft p-3 text-accent-ink">
          {fout}
        </p>
      ) : null}

      {(zenders ?? []).length > 1 ? (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {(zenders ?? []).map((z) => {
            const actief = speelt && zender?.id === z.id
            return (
              <button
                key={z.id}
                onClick={() => toggle(z)}
                aria-pressed={actief}
                className={`flex min-h-[6rem] flex-col items-start justify-between rounded-card p-4 text-left shadow-card ${
                  actief ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface'
                }`}
              >
                {z.favicon ? (
                  <img src={z.favicon} alt="" className="h-8 w-8 rounded-lg object-cover" />
                ) : (
                  <RadioIcon size={28} strokeWidth={1.75} aria-hidden="true" className="text-ink-soft" />
                )}
                <span className="text-lg font-bold leading-tight">{z.name}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </main>
  )
}

/**
 * Onderaan elk scherm zolang de radio speelt: wat er speelt en een
 * stopknop. Zo zit niemand vast met muziek die hij niet meer terugvindt.
 */
export function MiniSpeler() {
  const { zender, speelt, stop } = useRadio()
  const { pathname } = useLocation()
  // Op het radioscherm zelf is hij overbodig.
  if (!speelt || !zender || pathname === '/radio') return null
  return (
    <div
      className="fixed inset-x-3 z-40 flex items-center gap-3 rounded-card bg-accent-ink px-4 py-3 text-white shadow-lift"
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <RadioIcon size={22} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
      <Link to="/radio" className="min-w-0 flex-1 truncate font-semibold">
        {zender.name}
      </Link>
      <button
        onClick={stop}
        className="min-h-[2.6rem] shrink-0 rounded-pill bg-white/15 px-4 font-semibold"
      >
        Stop
      </button>
    </div>
  )
}

/** Een kaart op het Vandaag-scherm: één tik en de favoriete zender speelt. */
export function RadioKaart({ householdId }: { householdId: string }) {
  const { data: zenders } = useZenders(householdId)
  const { zender, speelt, laden, toggle } = useRadio()
  const favoriet = zenders?.[0]
  if (!favoriet) return null
  const huidig = zender ?? favoriet

  return (
    <div className="flex items-center gap-4 rounded-card bg-surface p-5 shadow-card">
      <button
        onClick={() => toggle(huidig)}
        aria-label={speelt ? `${huidig.name} stoppen` : `${huidig.name} afspelen`}
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent-ink text-white"
      >
        {speelt ? <Pause size={28} strokeWidth={2} /> : <Play size={28} strokeWidth={2} />}
      </button>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-ink-faint">{t('radio.titel')}</span>
        <span className="block truncate text-xl font-bold">
          {laden ? 'Even geduld…' : huidig.name}
        </span>
      </span>
      <Link to="/radio" className="shrink-0 font-semibold text-accent-ink underline underline-offset-4">
        Zenders
      </Link>
    </div>
  )
}
