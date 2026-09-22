import { NavLink, Outlet, useLocation } from 'react-router-dom'
import Icon, { type IconNaam } from '../components/Icon'
import { useHousehold } from '../features/household/useHousehold'
import { useDisplayPrefs } from '../features/settings/useDisplayPrefs'
import { useRealtime } from '../features/realtime/useRealtime'
import { useLocationReporter, useLocationSetting } from '../features/location/useLocation'
import IncomingCall from '../features/calls/IncomingCall'
import InstallPrompt from '../features/install/InstallPrompt'
import { useAgenda } from '../features/today/useAgenda'
import { useProactiveSpeech } from '../features/today/useProactiveSpeech'
import { huidigePrefs } from '../features/settings/useDisplayPrefs'
import { useZenders } from '../features/radio/useZenders'
import { MiniSpeler } from '../features/radio/Radio'
import Licht from '../features/licht/Licht'
import { useLichtSignalen } from '../features/licht/useLichtSignalen'
import { useWakeLock } from '../features/licht/useWakeLock'
import { useKiosk } from '../features/kiosk/useKiosk'
import Nachtscherm from '../features/kiosk/Nachtscherm'

const NAV: { to: string; label: string; icoon: IconNaam; mic?: boolean }[] = [
  { to: '/', label: 'Vandaag', icoon: 'vandaag' },
  { to: '/wie', label: 'Wie?', icoon: 'wie' },
  // De microfoon staat in het midden en valt op: het is de weg terug
  // wanneer iemand niet meer weet waar te kijken.
  { to: '/praten', label: 'Praten', icoon: 'praten', mic: true },
  { to: '/memory', label: 'In huis', icoon: 'memory' },
  { to: '/help', label: 'Help', icoon: 'help' },
]

/**
 * Vier bestemmingen, altijd zichtbaar, altijd op dezelfde plaats. De
 * gebruiker mag nooit verdwalen, en dat begint met navigatie die niet
 * verandert naargelang het scherm.
 */
export default function PersonLayout() {
  const { pathname } = useLocation()
  const { household } = useHousehold()
  // Alleen aanroepen om de instellingen op te halen en toe te passen.
  useDisplayPrefs(household?.household_id ?? '')
  useRealtime(household?.household_id ?? '')
  const { setting } = useLocationSetting(household?.household_id ?? '')
  useLocationReporter(household?.household_id ?? '', !!setting?.enabled)
  const tz = household?.timezone ?? 'Europe/Brussels'
  const { data: vandaag } = useAgenda(household?.household_id ?? '', tz)
  const { spraakVrij } = useProactiveSpeech(vandaag ?? [], tz)
  // Zenders altijd laden: de stem en routines moeten ze kennen, ook als
  // het radioscherm nooit geopend werd.
  useZenders(household?.household_id ?? '')
  const prefs = huidigePrefs()
  useLichtSignalen(household?.household_id ?? '', tz, prefs.licht)
  // Kioskmodus alleen op de gekoppelde tablet: familie die /persoon opent
  // op de eigen telefoon, hoort niet teruggestuurd of gedimd te worden.
  const kiosk = prefs.kiosk && household?.role === 'person'
  useWakeLock(prefs.schermAan || kiosk)
  const { nachtscherm, wek } = useKiosk({
    actief: kiosk,
    tz,
    terugNa: prefs.kioskTerug,
    nachtVan: prefs.nachtVan,
    nachtTot: prefs.nachtTot,
  })

  return (
    <>
      <IncomingCall householdId={household?.household_id ?? ''} />

      {/* Klein gehouden: wie de tablet klaarzet ziet het, en het leidt
          de persoon zelf niet af. */}
      <InstallPrompt compact />

      {/* Browsers laten een stem pas toe na één aanraking. Op de tablet is
          dat één tik na elke herstart; daarna verdwijnt deze regel. */}
      {!spraakVrij && huidigePrefs().voice ? (
        <p className="bg-accent-soft px-4 py-2 text-center text-sm font-semibold text-accent-ink">
          Tik één keer op het scherm, dan kan ik je met mijn stem herinneren.
        </p>
      ) : null}

      {setting?.enabled ? (
        <p className="bg-surface-soft px-4 py-1.5 text-center text-sm font-semibold text-ink-soft">
          📍 Je locatie wordt gedeeld met je familie
        </p>
      ) : null}

      <Outlet />

      <MiniSpeler />

      <Licht />

      {nachtscherm ? <Nachtscherm tz={tz} onWek={wek} /> : null}

      <nav
        aria-label="Hoofdnavigatie"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around gap-1 border-t border-line bg-surface/90 px-2 pt-1 backdrop-blur-xl"
        style={{ paddingBottom: 'calc(0.4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {NAV.map((n) => {
          const actief =
            n.to === '/' ? pathname === '/' || pathname === '/persoon' : pathname.startsWith(n.to)
          return (
            <NavLink
              key={n.to}
              to={n.to}
              aria-current={actief ? 'page' : undefined}
              className={`flex min-h-[3.6rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-sm font-semibold ${
                n.mic
                  ? 'bg-accent-ink text-white'
                  : actief
                    ? 'bg-accent-soft text-accent-ink'
                    : 'text-ink-faint'
              }`}
            >
              <Icon naam={n.icoon} size={n.mic ? 24 : 22} />
              {n.label}
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}
