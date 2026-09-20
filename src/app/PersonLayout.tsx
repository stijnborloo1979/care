import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useHousehold } from '../features/household/useHousehold'
import { useDisplayPrefs } from '../features/settings/useDisplayPrefs'
import { useRealtime } from '../features/realtime/useRealtime'
import { useLocationReporter, useLocationSetting } from '../features/location/useLocation'
import IncomingCall from '../features/calls/IncomingCall'
import InstallPrompt from '../features/install/InstallPrompt'

const NAV = [
  { to: '/', label: 'Vandaag', emoji: '🏠' },
  { to: '/wie', label: 'Wie?', emoji: '👥' },
  // De microfoon staat in het midden en valt op: het is de weg terug
  // wanneer iemand niet meer weet waar te kijken.
  { to: '/praten', label: 'Praten', emoji: '🎤', mic: true },
  { to: '/memory', label: 'In huis', emoji: '🧠' },
  { to: '/help', label: 'Help', emoji: '🆘' },
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

  return (
    <>
      <IncomingCall householdId={household?.household_id ?? ''} />

      {/* Klein gehouden: wie de tablet klaarzet ziet het, en het leidt
          de persoon zelf niet af. */}
      <InstallPrompt compact />

      {setting?.enabled ? (
        <p className="bg-surface-soft px-4 py-1.5 text-center text-sm font-semibold text-ink-soft">
          📍 Je locatie wordt gedeeld met je familie
        </p>
      ) : null}

      <Outlet />

      <nav
        aria-label="Hoofdnavigatie"
        className="fixed inset-x-0 bottom-0 z-40 flex justify-around gap-1 border-t border-line bg-surface px-2 pt-1"
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
              <span className="text-2xl leading-none" aria-hidden="true">
                {n.emoji}
              </span>
              {n.label}
            </NavLink>
          )
        })}
      </nav>
    </>
  )
}
