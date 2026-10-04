import JouwAbonnement from '../prijzen/JouwAbonnement'
import SysteemControle from '../systeem/SysteemControle'
import { useDisplayPrefs, type DisplayPrefs } from './useDisplayPrefs'
import JouwNaam from './JouwNaam'
import { useHousehold } from '../household/useHousehold'
import { Link } from 'react-router-dom'
import LocationSettings from '../location/LocationSettings'
import PairTablet from '../family/PairTablet'
import ManageRadio from '../radio/ManageRadio'
import { useLicht } from '../licht/lichtStore'
import MijnGegevens from '../privacy/MijnGegevens'
import Opslag from './Opslag'
import SamenWonen from './SamenWonen'
import { usePush } from '../push/usePush'
import PushNakijken from '../push/PushNakijken'
import { TALEN } from '../../lib/i18n'
import { tt } from '../../lib/uiTaal'

// De echte waarden staan in index.css; dit is alleen het bolletje in het
// scherm. Donker en hoog contrast krijgen daar hun eigen variant.
const ACCENTEN: { waarde: DisplayPrefs['accent']; label: string; staal: string }[] = [
  { waarde: 'groenblauw', label: tt('Groenblauw'), staal: '#0f5d63' },
  { waarde: 'blauw', label: tt('Blauw'), staal: '#17568f' },
  { waarde: 'groen', label: tt('Groen'), staal: '#2f6b3a' },
  { waarde: 'paars', label: tt('Paars'), staal: '#66409a' },
  { waarde: 'warm', label: tt('Warm bruin'), staal: '#a5691f' },
]

/**
 * Waar de app mag bellen.
 *
 * De middelste staat bovenaan de logica maar in het midden van de lijst:
 * het is de aanbevolen keuze, en tegelijk de enige die per toestel
 * verschilt. Elke optie zegt wat de persoon straks ziet — niet wat de
 * instelling heet — want dat is waar familie op beslist.
 */
const BELKEUZES: { waarde: DisplayPrefs['kanBellen']; label: string; onder: string }[] = [
  {
    waarde: 'telefoon',
    label: tt('Alleen op een telefoon (aanbevolen)'),
    onder: tt('Op een telefoon staan de belknoppen en de knop 112. Op een tablet zonder simkaart niet, want daar zouden ze niets doen.'),
  },
  {
    waarde: 'ja',
    label: tt('Overal, ook op de tablet'),
    onder: tt('Kies dit als de tablet een simkaart heeft. Probeer eerst één keer te bellen vanaf die tablet — lukt dat niet, zet het dan terug.'),
  },
  {
    waarde: 'nee',
    label: tt('Nergens'),
    onder: tt('Geen belknoppen en geen 112. Familie blijft wel bereikbaar: ze vraagt met één knop om terugbellen.'),
  },
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
  const voornaam = household?.person_name.split(' ')[0] ?? tt('de persoon')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{tt('Instellingen')}</h1>
        <p className="mt-1 text-ink-soft">
          {tt('Deze instellingen gelden voor het scherm van {voornaam}, op elk toestel.', { voornaam })}
        </p>
      </header>

      {/* Bovenaan, want het gaat over de instelling die je zelf aangaat:
          de rest van deze pagina gaat over het scherm van de persoon. */}
      <JouwNaam />

      {/* Vlak onder de naam, want dit is de instelling met de grootste
          gevolgen op dit scherm: ze bepaalt of er een 112-knop staat. */}
      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">{tt('Bellen en 112')}</h2>
        <p className="mt-1 max-w-[62ch] text-ink-soft">
          {tt('Een tablet zonder simkaart kan niet telefoneren. Staat hier "overal", dan krijgt {voornaam} ook op die tablet een knop "112" — en daar drukt iemand op in een echte noodsituatie.', { voornaam })}
        </p>

        <fieldset className="mt-4 min-w-0">
          <legend className="font-semibold">{tt('Waar mag ze bellen vanuit de app?')}</legend>
          <div className="mt-3 space-y-2">
            {BELKEUZES.map((k) => (
              <label
                key={k.waarde}
                className={`flex cursor-pointer gap-3 rounded-card border-[1.5px] p-4 ${
                  prefs.kanBellen === k.waarde
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-surface-soft'
                }`}
              >
                <input
                  type="radio"
                  name="kanBellen"
                  value={k.waarde}
                  checked={prefs.kanBellen === k.waarde}
                  onChange={() => zet.mutate({ kanBellen: k.waarde })}
                  className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
                />
                <span className="min-w-0 break-words">
                  <span className="block font-semibold">{k.label}</span>
                  <span className="mt-0.5 block text-sm text-ink-soft">{k.onder}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {prefs.kanBellen !== 'ja' ? (
          <label className="mt-4 block">
            <span className="font-semibold">{tt('Wat moet ze doen bij nood?')}</span>
            <span className="mt-1 block text-sm text-ink-soft">
              {prefs.kanBellen === 'telefoon'
                ? tt('Dit staat op het Help-scherm van {voornaam} op elk toestel dat niet kan bellen — de tablet dus. Wees heel concreet: waar de telefoon ligt, bij wie er aangebeld kan worden.', { voornaam })
                : tt('Dit staat op het Help-scherm van {voornaam} in plaats van de 112-knop. Wees heel concreet: waar de telefoon ligt, bij wie er aangebeld kan worden.', { voornaam })}
            </span>
            <textarea
              defaultValue={prefs.noodplan}
              onBlur={(e) => {
                const nu = e.target.value.trim()
                if (nu !== prefs.noodplan) zet.mutate({ noodplan: nu })
              }}
              rows={2}
              placeholder={tt('Bel 112 met de telefoon in de gang, naast de voordeur. Of bel aan bij de buren op nummer 14.')}
              className="mt-2 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
            />
          </label>
        ) : null}
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">{tt('Leesbaarheid')}</h2>

        <Rij
          titel={tt('Eenvoudige modus')}
          onder={tt('Grotere tekst en knoppen, minder op één scherm.')}
        >
          <Schakelaar
            aan={prefs.simple}
            label={tt('Eenvoudige modus')}
            onClick={() => zet.mutate({ simple: !prefs.simple })}
          />
        </Rij>

        <Rij titel={tt('Tekstgrootte')} onder={tt('Schaalt de hele app mee.')}>
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

        <Rij titel={tt('Contrast')} onder={tt('Hoog contrast voor wie slecht ziet.')}>
          <Keuze
            opties={[
              { waarde: 'normal', label: tt('Normaal') },
              { waarde: 'high', label: tt('Hoog') },
            ]}
            actief={prefs.contrast}
            onKies={(v) => zet.mutate({ contrast: v as DisplayPrefs['contrast'] })}
          />
        </Rij>

        <Rij titel={tt('Thema')} onder={tt('Volgt standaard het toestel.')}>
          <Keuze
            opties={[
              { waarde: 'auto', label: tt('Auto') },
              { waarde: 'light', label: tt('Licht') },
              { waarde: 'dark', label: tt('Donker') },
            ]}
            actief={prefs.theme}
            onKies={(v) => zet.mutate({ theme: v as DisplayPrefs['theme'] })}
          />
        </Rij>

        <Rij titel={tt('Accentkleur')} onder={tt('De kleur van knoppen, randen en wat de aandacht vraagt.')}>
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
          titel={tt('Licht bij een melding')}
          onder={tt('De randen van het scherm lichten zacht op bij een bericht, een oproep of een herinnering.')}
        >
          <div className="flex items-center gap-3">
            {/* Zien hoe het eruitziet, voor je het op de tablet aanzet. */}
            <button
              onClick={() => useLicht.getState().start('bericht')}
              className="min-h-[2.4rem] rounded-pill border border-line px-3 text-sm font-semibold"
            >
              {tt('Probeer')}
            </button>
            <Schakelaar
              aan={prefs.licht}
              label={tt('Licht bij een melding')}
              onClick={() => zet.mutate({ licht: !prefs.licht })}
            />
          </div>
        </Rij>

        <Rij
          titel={tt('Scherm altijd aan')}
          onder={tt('Voor een tablet die in de lader staat. Op een telefoon kost dit batterij.')}
        >
          <Schakelaar
            aan={prefs.schermAan}
            label={tt('Scherm altijd aan')}
            onClick={() => zet.mutate({ schermAan: !prefs.schermAan })}
          />
        </Rij>

        <Rij titel={tt('Voorlezen')} onder={tt('Berichten en verhalen worden hardop voorgelezen.')}>
          <Schakelaar
            aan={prefs.voice}
            label={tt('Voorlezen')}
            onClick={() => zet.mutate({ voice: !prefs.voice })}
          />
        </Rij>
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">LifeAngle Voice</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {tt('Met de grote microfoonknop zegt {voornaam} gewoon wat nodig is: een afspraak, een herinnering, boodschappen, of iets vertellen voor het dagboek. Belangrijke dingen worden eerst bevestigd.', { voornaam })}
        </p>

        <Rij
          titel={tt('Naam van de assistent')}
          onder={tt('Een naam die makkelijk uit te spreken is, bijvoorbeeld Anna of Sam. Leeg laten mag.')}
        >
          <input
            type="text"
            defaultValue={prefs.assistentNaam}
            maxLength={30}
            aria-label={tt('Naam van de assistent')}
            className="min-h-touch w-48 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-lg"
            onBlur={(e) => {
              const nu = e.target.value.trim()
              if (nu !== prefs.assistentNaam) zet.mutate({ assistentNaam: nu })
            }}
          />
        </Rij>

        <Rij
          titel={prefs.assistentNaam ? tt('Luisteren naar “Hallo {naam}”', { naam: prefs.assistentNaam }) : tt('Luisteren naar “Hallo …”')}
          onder={tt('Dan hoeft niemand op de knop te tikken. Werkt alleen zolang de app open staat, en alleen in Chrome en Edge. Het geluid gaat dan voortdurend naar de spraakdienst van de browser — zet dit alleen aan als dat voor jullie in orde is.')}
        >
          <Schakelaar
            aan={prefs.wekwoord}
            label={tt('Luisteren naar de naam')}
            onClick={() => zet.mutate({ wekwoord: !prefs.wekwoord })}
          />
        </Rij>
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">{tt('Taal')}</h2>

        <Rij
          titel={tt('Taal van de app')}
          onder={tt('Geldt voor de schermen, de datums en de stem: voorlezen én verstaan.')}
        >
          <Keuze
            opties={TALEN.map((l) => ({ waarde: l.code, label: l.naam }))}
            actief={prefs.taal}
            onKies={(v) => zet.mutate({ taal: v as DisplayPrefs['taal'] })}
          />
        </Rij>
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">{tt('Bellen')}</h2>

        <Rij
          titel={tt('Zelf opnemen na')}
          onder={tt('Hoe lang de tablet rinkelt voor ze het gesprek zelf aanneemt. Tijdens het rinkelen kan {voornaam} altijd zelf opnemen of weigeren. Geldt alleen in de fase "ondersteund".', { voornaam })}
        >
          <Keuze
            opties={[
              { waarde: '5', label: tt('{n} sec', { n: 5 }) },
              { waarde: '10', label: tt('{n} sec', { n: 10 }) },
              { waarde: '20', label: tt('{n} sec', { n: 20 }) },
              { waarde: '45', label: tt('{n} sec', { n: 45 }) },
              { waarde: '0', label: tt('Nooit') },
            ]}
            actief={String(prefs.autoOpnemen)}
            onKies={(v) => zet.mutate({ autoOpnemen: Number(v) as DisplayPrefs['autoOpnemen'] })}
          />
        </Rij>
      </section>

      {/* Boven de toestelinstellingen, want dit gaat over de woning en niet
          over één tablet. */}
      <SamenWonen hh={hh} />

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">{tt('De vaste tablet')}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {tt('Geldt alleen op de tablet die met een code gekoppeld is, niet op jouw toestel.')}
        </p>

        <Rij
          titel={tt('Kioskmodus')}
          onder={tt("Het scherm blijft aan, keert vanzelf terug naar Vandaag en toont 's nachts een rustige klok.")}
        >
          <Schakelaar
            aan={prefs.kiosk}
            label={tt('Kioskmodus')}
            onClick={() => zet.mutate({ kiosk: !prefs.kiosk })}
          />
        </Rij>

        {prefs.kiosk ? (
          <>
            <Rij
              titel={tt('Terug naar Vandaag')}
              onder={tt('Na zoveel minuten zonder aanraking. Een gesprek of opname wordt nooit onderbroken.')}
            >
              <Keuze
                opties={[
                  { waarde: '2', label: tt('{n} min', { n: 2 }) },
                  { waarde: '5', label: tt('{n} min', { n: 5 }) },
                  { waarde: '10', label: tt('{n} min', { n: 10 }) },
                ]}
                actief={String(prefs.kioskTerug)}
                onKies={(v) => zet.mutate({ kioskTerug: Number(v) as DisplayPrefs['kioskTerug'] })}
              />
            </Rij>

            <Rij
              titel={tt('Nachtscherm')}
              onder={tt('Een gedimde klok met dag en dagdeel. Eén tik toont even het gewone scherm.')}
            >
              <div className="flex items-center gap-2">
                <Uur
                  label={tt('Nachtscherm vanaf')}
                  waarde={prefs.nachtVan}
                  onKies={(u) => zet.mutate({ nachtVan: u })}
                />
                <span className="text-ink-soft">{tt('tot')}</span>
                <Uur
                  label={tt('Nachtscherm tot')}
                  waarde={prefs.nachtTot}
                  onKies={(u) => zet.mutate({ nachtTot: u })}
                />
              </div>
            </Rij>

            <p className="pt-4 text-sm text-ink-soft">
              {tt('Zodat {voornaam} de app niet per ongeluk sluit, zet je hem ook op het toestel zelf vast.', { voornaam })}{' '}
              <Link to="/installeren" className="font-semibold underline underline-offset-4">
                {tt('Zo doe je dat')}
              </Link>
            </p>
          </>
        ) : null}
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">{tt('Zo ziet het eruit')}</h2>
        <div className="mt-4 rounded-card border-[1.5px] border-accent bg-accent-soft p-5">
          <p className="text-4xl" aria-hidden="true">
            ☕
          </p>
          <p className="mt-2 text-2xl font-extrabold tracking-tight">{tt('Ontbijten')}</p>
          <p className="mt-1 text-lg text-ink-soft">{tt('Neem rustig de tijd.')}</p>
        </div>
        <p className="mt-3 text-sm text-ink-faint">
          {tt('De instellingen zijn meteen actief, ook op dit scherm.')}
        </p>
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="text-lg font-bold">{tt('Op het beginscherm zetten')}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {tt('Op de tablet van {voornaam} hoort LifeAngle als app te staan, niet als tabblad in een browser.', { voornaam })}
        </p>
        <Link
          to="/installeren"
          className="mt-3 inline-flex min-h-touch items-center rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
        >
          {tt('Uitleg per toestel')}
        </Link>
      </section>

      <Meldingen householdId={hh} voornaam={voornaam} ondersteund={household?.support_level === 'ondersteund'} />

      <ManageRadio householdId={hh} />

      <PairTablet householdId={hh} personName={voornaam} />

      <LocationSettings />

      <Opslag />

      {household?.role === 'admin' ? <JouwAbonnement soort="household_id" id={hh} /> : null}

      {household?.role === 'admin' ? <SysteemControle /> : null}

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
      <div className="min-w-[min(12rem,100%)] flex-1">
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
        className={`absolute left-0 top-1 h-6 w-6 rounded-full bg-surface shadow-card transition-transform ${
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
      <h2 className="text-lg font-bold">{tt('Meldingen')}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {tt('Een bericht op je gsm wanneer er iets afwijkt, bijvoorbeeld medicatie die om tien uur nog niet bevestigd is. Kan deze browser dat niet, dan gaan de dringende berichten per e-mail — dat staat hieronder.')}
      </p>

      <Rij
        titel={tt('Meldingen')}
        onder={
          status === 'onbeschikbaar'
            ? tt('Deze browser kan geen meldingen tonen. Op iPhone en iPad lukt het alleen als LifeAngle op het beginscherm staat: deel-icoon, dan "Zet op beginscherm", en open LifeAngle daarna via dat icoon. Lukt dat niet, dan blijft de e-mail hieronder.')
            : status === 'geweigerd'
              ? tt('De browser houdt meldingen tegen. Zet ze weer aan bij de instellingen van de site. Tot dan blijft de e-mail hieronder.')
              : tt('Geldt alleen voor dit toestel. Zet het ook aan op je andere toestellen.')
        }
      >
        {status === 'onbeschikbaar' || status === 'geweigerd' ? (
          <span className="text-sm font-semibold text-ink-faint">{tt('Niet mogelijk')}</span>
        ) : (
          <Schakelaar
            aan={status === 'aan'}
            label={tt('Meldingen op dit toestel')}
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
          {tt('Er worden nu nog geen meldingen verstuurd: die horen bij de fase “ondersteund”. {voornaam} beslist daarover bij Wie ziet wat.', { voornaam })}
        </p>
      ) : null}

      {/* Push valt op drie plaatsen stil, en alle drie zonder een spoor.
          Dit zegt welke. */}
      <PushNakijken householdId={householdId} />
    </section>
  )
}
