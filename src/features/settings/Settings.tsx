import { useDisplayPrefs, type DisplayPrefs } from './useDisplayPrefs'
import { useHousehold } from '../household/useHousehold'
import { Link } from 'react-router-dom'
import LocationSettings from '../location/LocationSettings'
import PairTablet from '../family/PairTablet'
import ManageRadio from '../radio/ManageRadio'
import { useLicht } from '../licht/lichtStore'
import MijnGegevens from '../privacy/MijnGegevens'
import { usePush } from '../push/usePush'

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

        <Rij
          titel="Licht bij een melding"
          onder="De randen van het scherm lichten zacht op bij een bericht, een oproep of een herinnering."
        >
          <div className="flex items-center gap-3">
            {/* Zien hoe het eruitziet, voor je het op de tablet aanzet. */}
            <button
              onClick={() => useLicht.getState().start('bericht')}
              className="min-h-[2.4rem] rounded-pill border border-line px-3 text-sm font-semibold"
            >
              Probeer
            </button>
            <Schakelaar
              aan={prefs.licht}
              label="Licht bij een melding"
              onClick={() => zet.mutate({ licht: !prefs.licht })}
            />
          </div>
        </Rij>

        <Rij
          titel="Scherm altijd aan"
          onder="Voor een tablet die in de lader staat. Op een telefoon kost dit batterij."
        >
          <Schakelaar
            aan={prefs.schermAan}
            label="Scherm altijd aan"
            onClick={() => zet.mutate({ schermAan: !prefs.schermAan })}
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
        <h2 className="text-lg font-bold">De vaste tablet</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Geldt alleen op de tablet die met een code gekoppeld is, niet op jouw toestel.
        </p>

        <Rij
          titel="Kioskmodus"
          onder={`Het scherm blijft aan, keert vanzelf terug naar Vandaag en toont 's nachts een rustige klok.`}
        >
          <Schakelaar
            aan={prefs.kiosk}
            label="Kioskmodus"
            onClick={() => zet.mutate({ kiosk: !prefs.kiosk })}
          />
        </Rij>

        {prefs.kiosk ? (
          <>
            <Rij
              titel="Terug naar Vandaag"
              onder="Na zoveel minuten zonder aanraking. Een gesprek of opname wordt nooit onderbroken."
            >
              <Keuze
                opties={[
                  { waarde: '2', label: '2 min' },
                  { waarde: '5', label: '5 min' },
                  { waarde: '10', label: '10 min' },
                ]}
                actief={String(prefs.kioskTerug)}
                onKies={(v) => zet.mutate({ kioskTerug: Number(v) as DisplayPrefs['kioskTerug'] })}
              />
            </Rij>

            <Rij
              titel="Nachtscherm"
              onder="Een gedimde klok met dag en dagdeel. Eén tik toont even het gewone scherm."
            >
              <div className="flex items-center gap-2">
                <Uur
                  label="Nachtscherm vanaf"
                  waarde={prefs.nachtVan}
                  onKies={(u) => zet.mutate({ nachtVan: u })}
                />
                <span className="text-ink-soft">tot</span>
                <Uur
                  label="Nachtscherm tot"
                  waarde={prefs.nachtTot}
                  onKies={(u) => zet.mutate({ nachtTot: u })}
                />
              </div>
            </Rij>

            <p className="pt-4 text-sm text-ink-soft">
              Zodat {voornaam} de app niet per ongeluk sluit, zet je hem ook op het toestel zelf
              vast.{' '}
              <Link to="/installeren" className="font-semibold underline underline-offset-4">
                Zo doe je dat
              </Link>
            </p>
          </>
        ) : null}
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

      <Meldingen householdId={hh} voornaam={voornaam} ondersteund={household?.support_level === 'ondersteund'} />

      <ManageRadio householdId={hh} />

      <PairTablet householdId={hh} personName={voornaam} />

      <LocationSettings />

      <MijnGegevens />
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

function Uur({
  label,
  waarde,
  onKies,
}: {
  label: string
  waarde: number
  onKies: (uur: number) => void
}) {
  return (
    <select
      aria-label={label}
      value={waarde}
      onChange={(e) => onKies(Number(e.target.value))}
      className="min-h-[2.4rem] rounded-pill border border-line bg-surface-soft px-3 font-semibold tabular-nums"
    >
      {Array.from({ length: 24 }, (_, u) => (
        <option key={u} value={u}>
          {String(u).padStart(2, '0')}:00
        </option>
      ))}
    </select>
  )
}

/**
 * Meldingen staan per toestel aan, niet per persoon: de browser geeft de
 * toestemming, niet het account.
 */
function Meldingen({
  householdId,
  voornaam,
  ondersteund,
}: {
  householdId: string
  voornaam: string
  ondersteund: boolean
}) {
  const { status, fout, aanzetten, uitzetten } = usePush(householdId)

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">Meldingen op dit toestel</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Een bericht op je gsm wanneer er iets afwijkt, bijvoorbeeld medicatie die om tien uur nog
        niet bevestigd is.
      </p>

      <Rij
        titel="Meldingen"
        onder={
          status === 'onbeschikbaar'
            ? 'Deze browser kan geen meldingen tonen. Op iPhone en iPad lukt het alleen als Thuis op het beginscherm staat.'
            : status === 'geweigerd'
              ? 'De browser houdt meldingen tegen. Zet ze weer aan bij de instellingen van de site.'
              : 'Geldt alleen voor dit toestel. Zet het ook aan op je andere toestellen.'
        }
      >
        {status === 'onbeschikbaar' || status === 'geweigerd' ? (
          <span className="text-sm font-semibold text-ink-faint">Niet mogelijk</span>
        ) : (
          <Schakelaar
            aan={status === 'aan'}
            label="Meldingen op dit toestel"
            onClick={() => (status === 'aan' ? uitzetten() : aanzetten())}
          />
        )}
      </Rij>

      {fout ? (
        <p role="alert" className="pt-3 text-sm text-alert">
          {fout}
        </p>
      ) : null}

      {status === 'aan' && !ondersteund ? (
        <p className="pt-3 text-sm text-ink-soft">
          Er worden nu nog geen meldingen verstuurd: die horen bij de fase &ldquo;ondersteund&rdquo;.
          {voornaam} beslist daarover bij Wie ziet wat.
        </p>
      ) : null}
    </section>
  )
}
