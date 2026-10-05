import { useMag } from '../../core/access/useAccess'
import { useState } from 'react'
import Dashboard from '../dashboard/Dashboard'
import FotoKiezer from '../../components/FotoKiezer'
import { sendPhotoMessage } from '../messages/messages'
import ManageHomeMemory from '../home-memory/ManageHomeMemory'
import ManageMemories from '../memories/ManageMemories'
import ManagePeople from '../people/ManagePeople'
import ProfielVelden from '../profile/ProfielVelden'
import VoiceRecorder from '../messages/VoiceRecorder'
import OpHaarScherm from '../messages/OpHaarScherm'
import StartCall from '../calls/StartCall'
import ManageNotes from '../notes/ManageNotes'
import Verhalen from '../stories/Verhalen'
import InviteMember from './InviteMember'
import { useAuth } from '../auth/AuthProvider'
import { useHousehold } from '../household/useHousehold'
import { tt } from '../../lib/uiTaal'

/** Elke familiepagina heeft hetzelfde nodig: het huishouden en de rol. */
function useContext() {
  const { household } = useHousehold()
  const { session } = useAuth()
  return {
    hh: household?.household_id ?? '',
    // Het huis staat los van het huishouden: twee mensen die samenwonen
    // hebben één keuken maar elk hun eigen medicatie. Alleen Home Memory
    // hoort bij huis.
    huis: household?.home_id ?? household?.household_id ?? '',
    huisVan: household?.home_name ?? null,
    voornaam: household?.person_name.split(' ')[0] ?? '',
    volledig: household?.person_name ?? '',
    tz: household?.timezone ?? 'Europe/Brussels',
    role: household?.role ?? 'member',
    viewer: (session?.user.email ?? tt('daar')).split('@')[0],
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
  const magUitnodigen = useMag(c.hh, 'invitation.manage', c.role === 'admin')
  if (!c.hh) return null
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Familie en contacten')}</h1>
        <p className="mt-1 text-ink-soft">{tt('Wie er is, en wie mee kan zorgen.')}</p>
      </header>
      <ManagePeople householdId={c.hh} />
      <ProfielVelden />
      {magUitnodigen ? <InviteMember householdId={c.hh} personName={c.voornaam} /> : null}
    </div>
  )
}

export function HomeMemoryPage() {
  const c = useContext()
  if (!c.hh) return null
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Home Memory')}</h1>
        <p className="mt-1 text-ink-soft">
          {tt('Waar dingen liggen en hoe ze werken. Dit is het invulwerk dat het verschil maakt.')}
        </p>
        {/* Wie in een gedeeld huis wijzigt, wijzigt het ook voor de ander.
            Dat hoort te staan waar je aan het typen bent, niet alleen in de
            instellingen waar je het één keer aangezet hebt. */}
        {c.huisVan ? (
          <p className="mt-2 font-semibold text-accent-ink">
            {tt('Dit huis is gedeeld met {naam}. Wat je hier wijzigt, zien zij ook.', { naam: c.huisVan })}
          </p>
        ) : null}
      </header>
      <ManageHomeMemory householdId={c.huis} />
    </div>
  )
}

export function MemoriesPage() {
  const c = useContext()
  if (!c.hh) return null
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Herinneringen')}</h1>
        <p className="mt-1 text-ink-soft">{tt('Foto’s met een jaartal en het verhaal erbij.')}</p>
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
        <h1 className="text-2xl font-bold tracking-tight">{tt('Berichten')}</h1>
        <p className="mt-1 text-ink-soft">
          {tt('Bellen gaat rechtstreeks. Een ingesproken bericht verschijnt bovenaan het scherm van {naam}, ook als ze nu niet kan opnemen.', { naam: c.voornaam })}
        </p>
      </header>
      <div className="grid max-w-3xl gap-5 md:grid-cols-2">
        <StartCall householdId={c.hh} metWie={c.voornaam} />
        <VoiceRecorder householdId={c.hh} recipient={c.voornaam} />
        <FotoBericht householdId={c.hh} recipient={c.voornaam} />
      </div>

      <div className="max-w-3xl">
        <OpHaarScherm householdId={c.hh} naam={c.voornaam} />
      </div>
    </div>
  )
}

/**
 * Een foto naar het scherm van de persoon: de kleinkinderen op het strand,
 * de kaart uit Spanje. Hij verschijnt bij de berichten, met het zinnetje
 * eronder, en verdwijnt volgens dezelfde regels als de rest.
 */
function FotoBericht({ householdId, recipient }: { householdId: string; recipient: string }) {
  const [zin, setZin] = useState('')
  const [gelukt, setGelukt] = useState(false)

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">{tt('Foto sturen')}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {tt('Eén foto, met een korte zin erbij. Die komt bovenaan het scherm van {naam}.', { naam: recipient })}
      </p>

      <label className="mt-3 block">
        <span className="text-sm font-semibold text-ink-soft">{tt('Wat staat erop?')}</span>
        <input
          value={zin}
          onChange={(e) => {
            setZin(e.target.value)
            setGelukt(false)
          }}
          placeholder={tt('Lotte op het strand in Oostende')}
          className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
        />
      </label>

      <FotoKiezer
        className="mt-3 block"
        label={tt('Foto kiezen en sturen')}
        bezigLabel={tt('Bezig met sturen…')}
        onKies={async (bestand) => {
          await sendPhotoMessage({ householdId, channel: 'person', file: bestand, body: zin })
          setZin('')
          setGelukt(true)
        }}
      />

      {gelukt ? <p className="mt-2 text-sm font-semibold text-ok">{tt('Verstuurd.')}</p> : null}
    </section>
  )
}

export function NotesPage() {
  const c = useContext()
  if (!c.hh) return null
  return <ManageNotes householdId={c.hh} />
}
