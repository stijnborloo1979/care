import Dashboard from '../dashboard/Dashboard'
import ManageHomeMemory from '../home-memory/ManageHomeMemory'
import ManageMemories from '../memories/ManageMemories'
import ManagePeople from '../people/ManagePeople'
import VoiceRecorder from '../messages/VoiceRecorder'
import StartCall from '../calls/StartCall'
import ManageNotes from '../notes/ManageNotes'
import Verhalen from '../stories/Verhalen'
import InviteMember from './InviteMember'
import { useAuth } from '../auth/AuthProvider'
import { useHousehold } from '../household/useHousehold'

/** Elke familiepagina heeft hetzelfde nodig: het huishouden en de rol. */
function useContext() {
  const { household } = useHousehold()
  const { session } = useAuth()
  return {
    hh: household?.household_id ?? '',
    voornaam: household?.person_name.split(' ')[0] ?? '',
    volledig: household?.person_name ?? '',
    tz: household?.timezone ?? 'Europe/Brussels',
    role: household?.role ?? 'member',
    viewer: (session?.user.email ?? 'daar').split('@')[0],
  }
}

export function DashboardPage() {
  const c = useContext()
  if (!c.hh) return null
  return (
    <Dashboard
      householdId={c.hh}
      personName={c.voornaam}
      timezone={c.tz}
      viewerName={c.viewer}
    />
  )
}

export function PeoplePage() {
  const c = useContext()
  if (!c.hh) return null
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Familie en contacten</h1>
        <p className="mt-1 text-ink-soft">Wie er is, en wie mee kan zorgen.</p>
      </header>
      <ManagePeople householdId={c.hh} />
      {c.role === 'admin' ? <InviteMember householdId={c.hh} personName={c.voornaam} /> : null}
    </div>
  )
}

export function HomeMemoryPage() {
  const c = useContext()
  if (!c.hh) return null
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Home Memory</h1>
        <p className="mt-1 text-ink-soft">
          Waar dingen liggen en hoe ze werken. Dit is het invulwerk dat het verschil maakt.
        </p>
      </header>
      <ManageHomeMemory householdId={c.hh} />
    </div>
  )
}

export function MemoriesPage() {
  const c = useContext()
  if (!c.hh) return null
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Herinneringen</h1>
        <p className="mt-1 text-ink-soft">Foto&rsquo;s met een jaartal en het verhaal erbij.</p>
      </header>
      <Verhalen householdId={c.hh} naam={c.voornaam} />
      <ManageMemories householdId={c.hh} />
    </div>
  )
}

export function MessagesPage() {
  const c = useContext()
  if (!c.hh) return null
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Berichten</h1>
        <p className="mt-1 text-ink-soft">
          Bellen gaat rechtstreeks. Een ingesproken bericht verschijnt bovenaan het scherm van{' '}
          {c.voornaam}, ook als ze nu niet kan opnemen.
        </p>
      </header>
      <div className="grid max-w-3xl gap-5 md:grid-cols-2">
        <StartCall householdId={c.hh} metWie={c.voornaam} />
        <VoiceRecorder householdId={c.hh} recipient={c.voornaam} />
      </div>
    </div>
  )
}

export function NotesPage() {
  const c = useContext()
  if (!c.hh) return null
  return <ManageNotes householdId={c.hh} />
}
