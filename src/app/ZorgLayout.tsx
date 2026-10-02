import { useState } from 'react'
import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { Building2, CalendarDays, ChevronDown, ClipboardList, KeyRound, LogOut, MessagesSquare, Settings2, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '../features/auth/AuthProvider'
import { useHousehold } from '../features/household/useHousehold'
import { useOrganisatie } from '../features/zorg/useOrganisatie'
import { ROLNAAM } from '../features/zorg/zorgApi'

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

  if (isLoading) return <p className="p-6 text-ink-soft">Even geduld…</p>
  if (!org) return <Navigate to="/zorg/nieuw" replace />

  const nav: { to: string; end?: boolean; label: string; icoon: LucideIcon }[] = [
    { to: '/zorg', end: true, label: 'Bewoners', icoon: Users },
    { to: '/zorg/overdracht', label: 'Overdracht', icoon: ClipboardList },
    { to: '/zorg/team', label: 'Team', icoon: MessagesSquare },
    { to: '/zorg/activiteiten', label: 'Activiteiten', icoon: CalendarDays },
    ...(beheert ? [{ to: '/zorg/beheer', label: 'Beheer', icoon: Settings2 }] : []),
  ]

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
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface px-3 py-5 lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto">
        <p className="px-2 pb-3 text-lg font-extrabold tracking-tight">LifeAngle Care</p>
        <div className="pb-4">{kopBalk}</div>
        <nav aria-label="Hoofdnavigatie" className="space-y-0.5">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-3 py-2.5 font-semibold ${
                  isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-soft hover:bg-surface-soft'
                }`
              }
            >
              <n.icoon size={19} strokeWidth={1.75} aria-hidden="true" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mx-auto max-w-5xl px-4 pb-28 pt-5 sm:px-5 lg:pb-12">
          <div className="mb-4 lg:hidden">{kopBalk}</div>
          <Outlet />
        </div>

        <nav
          aria-label="Hoofdnavigatie"
          className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-line bg-surface px-2 pt-1 lg:hidden"
          style={{ paddingBottom: 'calc(0.4rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `flex min-h-[3.4rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-xs font-semibold ${
                  isActive ? 'bg-accent-soft text-accent-ink' : 'text-ink-faint'
                }`
              }
            >
              <n.icoon size={20} strokeWidth={1.75} aria-hidden="true" />
              {n.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
