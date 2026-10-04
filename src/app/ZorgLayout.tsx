import { useEffect, useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { BarChart3, BedDouble, Building2, CalendarDays, CalendarRange, ChevronDown, ClipboardList, House, KeyRound, LogOut, Megaphone, Menu, MessagesSquare, Settings2, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'
import { useHousehold } from '../features/household/useHousehold'
import { useOrganisatie } from '../features/zorg/useOrganisatie'
import { ROLNAAM } from '../features/zorg/zorgApi'
import { useOngezien } from '../features/zorg/OpenVragen'

/**
 * Het scherm voor wie in een woonzorgcentrum werkt. Los van het
 * familiescherm: een medewerker volgt tientallen bewoners, een familielid
 * één. Andere vragen, andere schermen.
 */
export default function ZorgLayout() {
  const { org, alle, isLoading, kies, beheert } = useOrganisatie()
  const { session, signOut } = useAuth()
  const { all: huishoudens } = useHousehold()
  const [open, setOpen] = useState(false)
  const [meer, setMeer] = useState(false)
  const { pathname } = useLocation()
  const vragen = useOngezien(org?.org_id).totaal
  useEffect(() => {
    if (!meer) return
    const toets = (e: KeyboardEvent) => e.key === 'Escape' && setMeer(false)
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  }, [meer])

  if (isLoading) return <p className="p-6 text-ink-soft">Even geduld…</p>
  if (!org) return <Navigate to="/zorg/nieuw" replace />

  type Item = { to: string; end?: boolean; label: string; icoon: LucideIcon; teller?: number; groep: string; onderaan?: boolean }
  // Vier vaste knoppen onderaan op een telefoon, de rest onder "Meer".
  const nav: Item[] = [
    { to: '/zorg', end: true, label: 'Vandaag', icoon: House, groep: 'Dagelijks', onderaan: true },
    { to: '/zorg/bewoners', label: 'Bewoners', icoon: Users, teller: vragen, groep: 'Dagelijks', onderaan: true },
    { to: '/zorg/overdracht', label: 'Overdracht', icoon: ClipboardList, groep: 'Dagelijks', onderaan: true },
    { to: '/zorg/team', label: 'Team', icoon: MessagesSquare, groep: 'Dagelijks', onderaan: true },
    { to: '/zorg/activiteiten', label: 'Activiteiten', icoon: CalendarDays, groep: 'Planning' },
    { to: '/zorg/week', label: 'Weekplanning', icoon: CalendarRange, groep: 'Planning' },
    { to: '/zorg/kamers', label: 'Kamers', icoon: BedDouble, groep: 'Planning' },
    ...(beheert || org.team_lead ? [{ to: '/zorg/nieuws', label: 'Nieuws', icoon: Megaphone, groep: 'Families' }] : []),
    ...(beheert
      ? [
          { to: '/zorg/rapporten', label: 'Rapporten', icoon: BarChart3, groep: 'Beheer' },
          { to: '/zorg/beheer', label: 'Beheer', icoon: Settings2, groep: 'Beheer' },
        ]
      : []),
  ]
  const groepen = [...new Set(nav.map((n) => n.groep))]
  const onderaan = nav.filter((n) => n.onderaan)
  const rest = nav.filter((n) => !n.onderaan)
  const restActief = rest.some((n) => pathname.startsWith(n.to))
  // Een dossier (/zorg/bewoner/…) hoort bij Bewoners.
  const isActief = (n: Item, actief: boolean) => actief || (n.to === '/zorg/bewoners' && pathname.startsWith('/zorg/bewoner/'))

  const ik = session?.user.email ?? ''

  const kopBalk = (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-soft"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-ink text-white">
          <Building2 size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{org.naam}</span>
          <span className="block truncate text-xs text-ink-soft">
            {ROLNAAM[org.rol]}
            {org.team_lead ? ' · team lead' : ''}
          </span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          aria-hidden="true"
          className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className="absolute inset-x-0 z-50 mt-1 rounded-2xl border border-line bg-surface p-2 shadow-lift">
          {alle.length > 1 ? (
            <>
              <p className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-ink-faint">Organisatie</p>
              {alle.map((o) => (
                <button
                  key={o.org_id}
                  onClick={() => {
                    kies(o.org_id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm ${
                    o.org_id === org.org_id ? 'bg-accent-soft font-semibold text-accent-ink' : 'hover:bg-surface-soft'
                  }`}
                >
                  {o.naam}
                  <span className="text-xs text-ink-faint">{ROLNAAM[o.rol]}</span>
                </button>
              ))}
              <div className="my-2 h-px bg-line" />
            </>
          ) : null}
          {huishoudens.length > 0 ? (
            <NavLink to="/" className="block rounded-xl px-2 py-2 text-sm font-semibold hover:bg-surface-soft">
              Naar mijn familie
            </NavLink>
          ) : null}
          <p className="truncate px-2 py-1 text-xs text-ink-faint">{ik}</p>
          <NavLink
            to="/account"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-semibold hover:bg-surface-soft"
          >
            <KeyRound size={16} strokeWidth={1.75} aria-hidden="true" />
            Mijn account en wachtwoord
          </NavLink>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-semibold hover:bg-surface-soft"
          >
            <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
            Uitloggen
          </button>
        </div>
      ) : null}
    </div>
  )

  return (
    <div className="flex min-h-screen">
      <aside className="hidden print:!hidden w-64 shrink-0 border-r border-line bg-surface px-3 py-5 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        <p className="px-2 pb-3 text-lg font-extrabold tracking-tight">LifeAngle Care</p>
        <div className="pb-4">{kopBalk}</div>
        <nav aria-label="Hoofdnavigatie" className="space-y-4">
          {groepen.map((g) => (
            <div key={g}>
              <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">{g}</p>
              <div className="space-y-0.5">
                {nav
                  .filter((n) => n.groep === g)
                  .map((n) => (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      end={n.end}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-2xl px-3 py-2 font-semibold ${
                          isActief(n, isActive) ? 'bg-accent-soft text-accent-ink' : 'text-ink-soft hover:bg-surface-soft'
                        }`
                      }
                    >
                      <n.icoon size={19} strokeWidth={1.75} aria-hidden="true" />
                      <span className="flex-1">{n.label}</span>
                      {n.teller ? (
                        <span className="rounded-pill bg-alert px-2 py-0.5 text-xs font-bold text-white">
                          {n.teller}
                          <span className="sr-only"> open {n.teller === 1 ? 'vraag' : 'vragen'}</span>
                        </span>
                      ) : null}
                    </NavLink>
                  ))}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-5 lg:pb-12">
          <div className="mb-4 lg:hidden print:hidden">{kopBalk}</div>
          <Outlet />
        </div>

        {meer ? (
          <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={() => setMeer(false)}>
            <div
              className="absolute inset-x-0 bottom-0 rounded-t-[28px] bg-surface px-4 pb-28 pt-4 shadow-lift"
              onClick={(e) => e.stopPropagation()}
            >
              <ul className="grid grid-cols-3 gap-2">
                {rest.map((n) => (
                  <li key={n.to}>
                    <NavLink
                      to={n.to}
                      onClick={() => setMeer(false)}
                      className={({ isActive }) =>
                        `flex min-h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-center text-sm font-semibold ${
                          isActive ? 'bg-accent-soft text-accent-ink' : 'bg-surface-soft text-ink-soft'
                        }`
                      }
                    >
                      <n.icoon size={22} strokeWidth={1.75} aria-hidden="true" />
                      {n.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}

        <nav
          aria-label="Hoofdnavigatie"
          className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-line bg-surface px-2 pt-1 lg:hidden print:hidden"
          style={{ paddingBottom: 'calc(0.4rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {onderaan.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setMeer(false)}
              className={({ isActive }) =>
                `flex min-h-[3.4rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs font-semibold ${
                  isActief(n, isActive) ? 'bg-accent-soft text-accent-ink' : 'text-ink-faint'
                }`
              }
            >
              <span className="relative">
                <n.icoon size={20} strokeWidth={1.75} aria-hidden="true" />
                {n.teller ? (
                  <span className="absolute -right-2.5 -top-1.5 min-w-[1.1rem] rounded-pill bg-alert px-1 text-center text-[0.65rem] font-bold leading-[1.1rem] text-white">
                    {n.teller}
                    <span className="sr-only"> open {n.teller === 1 ? 'vraag' : 'vragen'}</span>
                  </span>
                ) : null}
              </span>
              {n.label}
            </NavLink>
          ))}
          <button
            onClick={() => setMeer(!meer)}
            aria-expanded={meer}
            className={`flex min-h-[3.4rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs font-semibold ${
              meer || restActief ? 'bg-accent-soft text-accent-ink' : 'text-ink-faint'
            }`}
          >
            {meer ? <X size={20} strokeWidth={1.75} aria-hidden="true" /> : <Menu size={20} strokeWidth={1.75} aria-hidden="true" />}
            Meer
          </button>
        </nav>
      </div>
    </div>
  )
}
