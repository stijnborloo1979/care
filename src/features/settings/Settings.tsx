import { useDisplayPrefs, type DisplayPrefs } from './useDisplayPrefs'
import { useHousehold } from '../household/useHousehold'
import { Link } from 'react-router-dom'
import LocationSettings from '../location/LocationSettings'
import PairTablet from '../family/PairTablet'

const SCHAAL: { waarde: DisplayPrefs['scale']; label: string }[] = [
  { waarde: '1', label: 'A' },
  { waarde: '1.15', label: 'A+' },
  { waarde: '1.3', label: 'A++' },
  { waarde: '1.5', label: 'A+++' },
]

export default function Settings() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const { prefs, zet } = useDisplayPrefs(hh)
  const voornaam = household?.person_name.split(' ')[0] ?? 'de persoon'

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Instellingen</h1>
        <p className="mt-1 text-ink-soft">
          Deze instellingen gelden voor het scherm van {voornaam}, op elk toestel.
        </p>
      </header>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">Leesbaarheid</h2>

        <Rij
          titel="Eenvoudige modus"
          onder="Grotere tekst en knoppen, minder op één scherm."
        >
          <Schakelaar
            aan={prefs.simple}
            label="Eenvoudige modus"
            onClick={() => zet.mutate({ simple: !prefs.simple })}
          />
        </Rij>

        <Rij titel="Tekstgrootte" onder="Schaalt de hele app mee.">
          <div className="flex gap-1 rounded-pill border border-line bg-surface-soft p-1">
            {SCHAAL.map((s) => (
              <button
                key={s.waarde}
                onClick={() => zet.mutate({ scale: s.waarde })}
                aria-pressed={prefs.scale === s.waarde}
                className={`min-h-[2.4rem] rounded-pill px-4 font-semibold ${
                  prefs.scale === s.waarde ? 'bg-surface text-ink shadow-card' : 'text-ink-soft'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Rij>

        <Rij titel="Contrast" onder="Hoog contrast voor wie slecht ziet.">
          <Keuze
            opties={[
              { waarde: 'normal', label: 'Normaal' },
              { waarde: 'high', label: 'Hoog' },
            ]}
            actief={prefs.contrast}
            onKies={(v) => zet.mutate({ contrast: v as DisplayPrefs['contrast'] })}
          />
        </Rij>

        <Rij titel="Thema" onder="Volgt standaard het toestel.">
          <Keuze
            opties={[
              { waarde: 'auto', label: 'Auto' },
              { waarde: 'light', label: 'Licht' },
              { waarde: 'dark', label: 'Donker' },
            ]}
            actief={prefs.theme}
            onKies={(v) => zet.mutate({ theme: v as DisplayPrefs['theme'] })}
          />
        </Rij>

        <Rij titel="Voorlezen" onder="Berichten en verhalen worden hardop voorgelezen.">
          <Schakelaar
            aan={prefs.voice}
            label="Voorlezen"
            onClick={() => zet.mutate({ voice: !prefs.voice })}
          />
        </Rij>
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">Zo ziet het eruit</h2>
        <div className="mt-4 rounded-card border-[1.5px] border-accent bg-accent-soft p-5">
          <p className="text-4xl" aria-hidden="true">
            ☕
          </p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">Ontbijten</p>
          <p className="mt-1 text-lg text-ink-soft">Neem rustig de tijd.</p>
        </div>
        <p className="mt-3 text-sm text-ink-faint">
          De instellingen zijn meteen actief, ook op dit scherm.
        </p>
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">Op het beginscherm zetten</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Op de tablet van {voornaam} hoort Thuis als app te staan, niet als tabblad in een browser.
        </p>
        <Link
          to="/installeren"
          className="mt-3 inline-flex min-h-touch items-center rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
        >
          Uitleg per toestel
        </Link>
      </section>

      <PairTablet householdId={hh} personName={voornaam} />

      <LocationSettings />

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">Privacy</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink-soft">
          <li>Elke rol ziet alleen wat ze nodig heeft; documenten blijven bij de familie.</li>
          <li>Foto&rsquo;s en documenten staan in privébuckets, met links die vervallen.</li>
          <li>Elke wijziging aan documenten, medicatie en rollen wordt gelogd.</li>
          <li>Locatie staat uit tot iemand er expliciet toestemming voor geeft.</li>
        </ul>
      </section>
    </div>
  )
}

function Rij({
  titel,
  onder,
  children,
}: {
  titel: string
  onder: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-4 last:border-none">
      <div className="min-w-[12rem] flex-1">
        <p className="font-semibold">{titel}</p>
        <p className="text-sm text-ink-soft">{onder}</p>
      </div>
      {children}
    </div>
  )
}

function Schakelaar({
  aan,
  label,
  onClick,
}: {
  aan: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      role="switch"
      aria-checked={aan}
      aria-label={label}
      onClick={onClick}
      className={`relative h-9 w-16 shrink-0 rounded-pill border-[1.5px] transition-colors ${
        aan ? 'border-accent bg-accent' : 'border-line-strong bg-surface-deep'
      }`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full bg-surface shadow-card transition-transform ${
          aan ? 'translate-x-8' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

function Keuze({
  opties,
  actief,
  onKies,
}: {
  opties: { waarde: string; label: string }[]
  actief: string
  onKies: (v: string) => void
}) {
  return (
    <div className="flex gap-1 rounded-pill border border-line bg-surface-soft p-1">
      {opties.map((o) => (
        <button
          key={o.waarde}
          onClick={() => onKies(o.waarde)}
          aria-pressed={actief === o.waarde}
          className={`min-h-[2.4rem] rounded-pill px-4 font-semibold ${
            actief === o.waarde ? 'bg-surface text-ink shadow-card' : 'text-ink-soft'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
