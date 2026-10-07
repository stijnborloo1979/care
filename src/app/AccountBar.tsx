import { useState } from 'react'
import TaalKiezer from '../components/TaalKiezer'
import { ChevronDown, KeyRound, LogOut } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { useHousehold } from '../features/household/useHousehold'
import ZorgToegang from '../features/zorg/ZorgToegang'
import { tt } from '../lib/uiTaal'
import { useMijnNaam } from '../services/mijnNaam'

const ROL: Record<string, string> = {
  admin: tt('familiebeheerder'),
  member: tt('familie'),
  caregiver: tt('zorgverlener'),
  person: tt('persoon'),
}

/**
 * Na het inloggen altijd zichtbaar: wie je bent, voor wie je zorgt, en in
 * welke rol. Wie bij meerdere huishoudens hoort, wisselt hier.
 */
export default function AccountBar() {
  const { session, signOut } = useAuth()
  const { household, all, kies } = useHousehold()
  const [open, setOpen] = useState(false)
  const mijnNaam = useMijnNaam()

  if (!session || !household) return null

  const naam = mijnNaam || tt('jij')

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-soft"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-ink text-sm font-bold uppercase text-white">
          {naam.charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{naam}</span>
          <span className="block truncate text-xs text-ink-soft">
            {tt('{rol} van {naam}', { rol: ROL[household.role] ?? household.role, naam: household.person_name.split(' ')[0] })}
          </span>
        </span>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="absolute inset-x-0 z-50 mt-1 rounded-2xl border border-line bg-surface p-2 shadow-lift">
          {all.length > 1 ? (
            <>
              <p className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-ink-faint">
                {tt('Huishouden')}
              </p>
              {all.map((h) => (
                <button
                  key={h.household_id}
                  onClick={() => {
                    kies(h.household_id)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center justify-between rounded-xl px-2 py-2 text-left text-sm ${
                    h.household_id === household.household_id
                      ? 'bg-accent-soft font-semibold text-accent-ink'
                      : 'hover:bg-surface-soft'
                  }`}
                >
                  {h.person_name}
                  <span className="text-xs text-ink-faint">{ROL[h.role]}</span>
                </button>
              ))}
              <div className="my-2 h-px bg-line" />
            </>
          ) : null}

          {household.role !== 'person' ? <ZorgToegang vorm="menu" onKlaar={() => setOpen(false)} /> : null}

          <p className="truncate px-2 py-1 text-xs text-ink-faint">{session.user.email}</p>
          <Link
            to="/account"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-semibold hover:bg-surface-soft"
          >
            <KeyRound size={16} strokeWidth={1.75} />
            {tt('Mijn account en wachtwoord')}
          </Link>
          <TaalKiezer compact />
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-semibold hover:bg-surface-soft"
          >
            <LogOut size={16} strokeWidth={1.75} />
            {tt('Uitloggen')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
