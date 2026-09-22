import { Link } from 'react-router-dom'
import { platformVan, staatOpBeginscherm, useInstall } from './useInstall'

const STAPPEN: Record<string, { titel: string; stappen: string[]; nota?: string }> = {
  ios: {
    titel: 'iPad of iPhone',
    stappen: [
      'Open deze pagina in Safari. In een andere browser lukt het niet.',
      'Druk onderaan (of bovenaan) op het deelicoon: een vierkantje met een pijl omhoog.',
      'Scrol in de lijst tot "Zet op beginscherm".',
      'Druk rechtsboven op "Voeg toe".',
    ],
    nota: 'Apple laat geen installatieknop in de app zelf toe. Dit is de enige weg, en je hoeft het maar één keer te doen.',
  },
  android: {
    titel: 'Android-tablet of -telefoon',
    stappen: [
      'Open deze pagina in Chrome.',
      'Druk op de knop met de drie puntjes, rechtsboven.',
      'Kies "App installeren" of "Toevoegen aan startscherm".',
      'Bevestig met "Installeren".',
    ],
  },
  desktop: {
    titel: 'Windows of Mac',
    stappen: [
      'Open deze pagina in Chrome of Edge.',
      'Klik op het installatie-icoon rechts in de adresbalk.',
      'Klik op "Installeren".',
    ],
  },
}

export default function InstallGuide() {
  const { kanInstalleren, installeer, geinstalleerd, platform } = useInstall()
  const gids = STAPPEN[platform] ?? STAPPEN.desktop

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-8">
      <Link to="/" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ Terug
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">
        Thuis op het beginscherm
      </h1>
      <p className="mt-2 text-lg text-ink-soft">
        Dan opent de app met een eigen icoon, zonder adresbalk, en blijft ze ingelogd. Ze werkt ook
        door wanneer de wifi even hapert.
      </p>

      {geinstalleerd || staatOpBeginscherm() ? (
        <p className="mt-6 rounded-card border-[1.5px] border-ok bg-surface p-5 text-lg">
          ✅ Deze app staat al op het beginscherm van dit toestel.
        </p>
      ) : (
        <>
          {kanInstalleren ? (
            <button
              onClick={installeer}
              className="mt-6 flex min-h-[3.6rem] w-full items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white"
            >
              Nu installeren
            </button>
          ) : null}

          <section className="mt-8">
            <h2 className="text-lg font-bold">{gids.titel}</h2>
            <ol className="mt-4 space-y-3">
              {gids.stappen.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-4 rounded-card border border-line bg-surface p-4"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-[1.5px] border-accent bg-accent-soft font-extrabold text-accent-ink">
                    {i + 1}
                  </span>
                  <span className="text-lg leading-snug">{s}</span>
                </li>
              ))}
            </ol>
            {gids.nota ? <p className="mt-3 text-sm text-ink-faint">{gids.nota}</p> : null}
          </section>
        </>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-bold">De tablet klaarzetten</h2>
        <p className="mt-2 text-ink-soft">
          Voor het toestel dat bij de persoon blijft staan. Eén keer instellen, daarna hoeft er
          niemand meer aan.
        </p>

        <ul className="mt-4 space-y-3">
          {[
            ['🔌', 'Laat de tablet in de lader staan, op een vaste plaats.'],
            ['🔒', 'Zet het schermslot uit, of gebruik een code die de familie kent.'],
            ['⏰', 'Zet het scherm op "nooit vergrendelen" zolang hij aan de lader hangt.'],
            ['🖥️', 'Zet in Thuis bij Instellingen de kioskmodus aan. Dat kan ook van op afstand.'],
            ['🎤', 'Geef bij de eerste keer toestemming voor microfoon en camera.'],
            ['🔊', 'Zet het volume hoog genoeg om een inkomende oproep te horen.'],
          ].map(([em, tekst]) => (
            <li key={tekst} className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
              <span className="text-2xl" aria-hidden="true">
                {em}
              </span>
              <span>{tekst}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">De app vastzetten</h2>
        <p className="mt-2 text-ink-soft">
          Een app kan zichzelf niet vergrendelen; dat doet het toestel. Kies wat bij de tablet past.
        </p>

        <div className="mt-4 space-y-3">
          {VASTZETTEN.map((v) => (
            <details key={v.titel} className="rounded-card border border-line bg-surface p-4">
              <summary className="cursor-pointer text-lg font-semibold">{v.titel}</summary>
              <p className="mt-2 text-sm text-ink-soft">{v.wat}</p>
              <ol className="mt-3 list-decimal space-y-2 pl-6">
                {v.stappen.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      </section>

      <p className="mt-8 text-sm text-ink-faint">
        Videobellen en de microfoon werken alleen op een beveiligde verbinding. Via het gewone
        webadres is dat in orde; via een lokaal IP-adres niet.
      </p>

      <p className="mt-2 text-sm text-ink-faint">
        Dit toestel: {platformVan()}. {navigator.userAgent.slice(0, 60)}…
      </p>
    </main>
  )
}

const VASTZETTEN: { titel: string; wat: string; stappen: string[] }[] = [
  {
    titel: 'iPad: Begeleide toegang',
    wat: 'Ingebouwd en gratis. Uit de app gaan kan alleen nog met een code.',
    stappen: [
      'Instellingen → Toegankelijkheid → Begeleide toegang: zet het aan en kies een code.',
      'Instellingen → Beeldscherm en helderheid → Automatisch vergrendelen: Nooit.',
      'Open Thuis vanaf het beginscherm en klik drie keer snel op de zij- of thuisknop.',
      'Tik op Start. Stoppen doe je weer met drie klikken en de code.',
    ],
  },
  {
    titel: 'Android: app vastzetten',
    wat: 'Ingebouwd en gratis. Goed genoeg voor de meeste mensen, maar wie weet hoe het werkt, krijgt het ongedaan.',
    stappen: [
      'Instellingen → Beveiliging → App vastzetten (soms onder Meer beveiligingsinstellingen): aanzetten, met ontgrendelen bij losmaken.',
      'Open Thuis vanaf het beginscherm.',
      'Open het overzicht van recente apps, tik op het pictogram van Thuis en kies Vastzetten.',
    ],
  },
  {
    titel: 'Android: Fully Kiosk Browser',
    wat: 'Een kleine eenmalige licentie per toestel, en de degelijkste keuze voor een tablet die jaren aan de muur hangt. Thuis start vanzelf na een stroomonderbreking, en de kioskmodus kan dan ook de echte helderheid regelen.',
    stappen: [
      'Installeer Fully Kiosk Browser uit de Play Store.',
      'Zet het webadres van Thuis als Start URL.',
      'Zet bij Advanced Web Settings de JavaScript Interface aan.',
      'Zet bij Device Management Keep Screen On en Launch on Boot aan.',
      'Zet Kiosk Mode aan en kies een code om eruit te gaan.',
      'Koppel de tablet daarna met de code uit Instellingen, net als anders.',
    ],
  },
]
