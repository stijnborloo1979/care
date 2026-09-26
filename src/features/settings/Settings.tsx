import { useDisplayPrefs, type DisplayPrefs } from './useDisplayPrefs'
import JouwNaam from './JouwNaam'
import { useHousehold } from '../household/useHousehold'
import { Link } from 'react-router-dom'
import LocationSettings from '../location/LocationSettings'
import PairTablet from '../family/PairTablet'
import ManageRadio from '../radio/ManageRadio'
import { useLicht } from '../licht/lichtStore'
import MijnGegevens from '../privacy/MijnGegevens'
import { usePush } from '../push/usePush'
import { TALEN } from '../../lib/i18n'

// De echte waarden staan in index.css; dit is alleen het bolletje in het
// scherm. Donker en hoog contrast krijgen daar hun eigen variant.
const ACCENTEN: { waarde: DisplayPrefs['accent']; label: string; staal: string }[] = [
  { waarde: 'groenblauw', label: 'Groenblauw', staal: '#0f5d63' },
  { waarde: 'blauw', label: 'Blauw', staal: '#17568f' },
  { waarde: 'groen', label: 'Groen', staal: '#2f6b3a' },
  { waarde: 'paars', label: 'Paars', staal: '#66409a' },
  { waarde: 'warm', label: 'Warm bruin', staal: '#a5691f' },
]

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

      {/* Bovenaan, want het gaat over de instelling die je zelf aangaat:
          de rest van deze pagina gaat over haar scherm. */}
      <JouwNaam />

      {/* Vlak onder de naam, want dit is de instelling met de grootste
          gevolgen op dit scherm: ze bepaalt of er een 112-knop staat. */}
      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">Bellen met dit toestel</h2>
        <p className="mt-1 max-w-[62ch] text-ink-soft">
          Een tablet zonder simkaart kan niet telefoneren. Staat dit op nee, dan toont het
          Help-scherm van {voornaam} geen knop "112" — want die zou niets doen, en daar drukt iemand
          op in een echte noodsituatie.
        </p>

        <Rij
          titel="Dit toestel kan telefoneren"
          onder="Zet dit alleen aan bij een telefoon of een tablet met simkaart. Twijfel je? Probeer het uit op het toestel van de persoon."
        >
          <Schakelaar
            aan={prefs.kanBellen}
            label="Dit toestel kan telefoneren"
            onClick={() => zet.mutate({ kanBellen: !prefs.kanBellen })}
          />
        </Rij>

        {!prefs.kanBellen ? (
          <label className="mt-4 block">
            <span className="font-semibold">Wat moet ze doen bij nood?</span>
            <span className="mt-1 block text-sm text-ink-soft">
              Dit staat op haar Help-scherm in plaats van de 112-knop. Wees heel concreet: waar de
              telefoon ligt, bij wie ze kan aanbellen.
            </span>
            <textarea
              defaultValue={prefs.noodplan}
              onBlur={(e) => {
                const nu = e.target.value.trim()
                if (nu !== prefs.noodplan) zet.mutate({ noodplan: nu })
              }}
              rows={2}
              placeholder="Bel 112 met de telefoon in de gang, naast de voordeur. Of bel aan bij de buren op nummer 14."
              className="mt-2 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
            />
          </label>
        ) : null}
      </section>

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

        <Rij titel="Accentkleur" onder="De kleur van knoppen, randen en wat de aandacht vraagt.">
          <div className="flex flex-wrap gap-2">
            {ACCENTEN.map((k) => (
              <button
                key={k.waarde}
                onClick={() => zet.mutate({ accent: k.waarde })}
                aria-pressed={prefs.accent === k.waarde}
                aria-label={k.label}
                title={k.label}
                className={`h-11 w-11 rounded-full border-[3px] ${
                  prefs.accent === k.waarde ? 'border-ink' : 'border-transparent'
                }`}
                style={{ background: k.staal }}
              />
            ))}
          </div>
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
        <h2 className="text-lg font-bold">Taal</h2>

        <Rij
          titel="Taal van de app"
          onder="Geldt voor de schermen, de datums en de stem: voorlezen én verstaan."
        >
          <Keuze
            opties={TALEN.map((l) => ({ waarde: l.code, label: l.naam }))}
            actief={prefs.taal}
            onKies={(v) => zet.mutate({ taal: v as DisplayPrefs['taal'] })}
          />
        </Rij>
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">Bellen</h2>

        <Rij
          titel="Zelf opnemen na"
          onder={`Hoe lang de tablet rinkelt voor ze het gesprek zelf aanneemt. Tijdens het rinkelen kan ${voornaam} altijd zelf opnemen of weigeren. Geldt alleen in de fase "ondersteund".`}
        >
          <Keuze
            opties={[
              { waarde: '5', label: '5 sec' },
              { waarde: '10', label: '10 sec' },
              { waarde: '20', label: '20 sec' },
              { waarde: '45', label: '45 sec' },
              { waarde: '0', label: 'Nooit' },
            ]}
            actief={String(prefs.autoOpnemen)}
            onKies={(v) => zet.mutate({ autoOpnemen: Number(v) as DisplayPrefs['autoOpnemen'] })}
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
