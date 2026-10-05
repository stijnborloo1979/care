import { testBeltoon } from '../calls/beltoon'
import { Link } from 'react-router-dom'
import { platformVan, staatOpBeginscherm, useInstall } from './useInstall'
import { tt } from '../../lib/uiTaal'

const STAPPEN: Record<string, { titel: string; stappen: string[]; nota?: string }> = {
  ios: {
    titel: tt('iPad of iPhone'),
    stappen: [
      tt('Open deze pagina in Safari. In een andere browser lukt het niet.'),
      tt('Druk onderaan (of bovenaan) op het deelicoon: een vierkantje met een pijl omhoog.'),
      tt('Scrol in de lijst tot "Zet op beginscherm".'),
      tt('Druk rechtsboven op "Voeg toe".'),
    ],
    nota: tt('Apple laat geen installatieknop in de app zelf toe. Dit is de enige weg, en je hoeft het maar één keer te doen.'),
  },
  android: {
    titel: tt('Android-tablet of -telefoon'),
    stappen: [
      tt('Open deze pagina in Chrome.'),
      tt('Druk op de knop met de drie puntjes, rechtsboven.'),
      tt('Kies "App installeren" of "Toevoegen aan startscherm".'),
      tt('Bevestig met "Installeren".'),
    ],
  },
  desktop: {
    titel: tt('Windows of Mac'),
    stappen: [
      tt('Open deze pagina in Chrome of Edge.'),
      tt('Klik op het installatie-icoon rechts in de adresbalk.'),
      tt('Klik op "Installeren".'),
    ],
  },
}

export default function InstallGuide() {
  const { kanInstalleren, installeer, geinstalleerd, platform } = useInstall()
  const gids = STAPPEN[platform] ?? STAPPEN.desktop

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-8">
      <Link to="/" className="font-semibold text-accent-ink underline underline-offset-4">
        {tt('‹ Terug')}
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">
        {tt('LifeAngle op het beginscherm')}
      </h1>
      <p className="mt-2 text-lg text-ink-soft">
        {tt('Dan opent de app met een eigen icoon, zonder adresbalk, en blijft ze ingelogd. Ze werkt ook door wanneer de wifi even hapert.')}
      </p>

      {geinstalleerd || staatOpBeginscherm() ? (
        <p className="mt-6 rounded-card border-[1.5px] border-ok bg-surface p-5 text-lg">
          ✅ {tt('Deze app staat al op het beginscherm van dit toestel.')}
        </p>
      ) : (
        <>
          {kanInstalleren ? (
            <button
              onClick={installeer}
              className="mt-6 flex min-h-[3.6rem] w-full items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white"
            >
              {tt('Nu installeren')}
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
        <h2 className="text-lg font-bold">{tt('De tablet klaarzetten')}</h2>
        <p className="mt-2 text-ink-soft">
          {tt('Voor het toestel dat bij de persoon blijft staan. Eén keer instellen, daarna hoeft er niemand meer aan.')}
        </p>

        <ul className="mt-4 space-y-3">
          {[
            ['🔌', tt('Laat de tablet in de lader staan, op een vaste plaats.')],
            ['🔒', tt('Zet het schermslot uit, of gebruik een code die de familie kent.')],
            ['⏰', tt('Zet het scherm op "nooit vergrendelen" zolang hij aan de lader hangt.')],
            ['🖥️', tt('Zet in LifeAngle bij Instellingen de kioskmodus aan. Dat kan ook van op afstand.')],
            ['🎤', tt('Geef bij de eerste keer toestemming voor microfoon en camera.')],
            ['🔊', tt('Zet het volume hoog genoeg om een inkomende oproep te horen.')],
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
        <h2 className="text-lg font-bold">{tt('Geluid uitproberen')}</h2>
        <p className="mt-2 text-ink-soft">
          {tt('Browsers laten geluid pas toe nadat iemand het scherm één keer heeft aangeraakt na het opstarten. Druk hier na het klaarzetten één keer, dan weet je dat de beltoon werkt op dit toestel.')}
        </p>
        <button
          onClick={testBeltoon}
          className="mt-4 flex min-h-[3.6rem] w-full items-center justify-center rounded-pill border-[1.5px] border-line-strong bg-surface px-5 text-lg font-semibold"
        >
          {tt('Beltoon proberen')}
        </button>
        <p className="mt-2 text-sm text-ink-faint">
          {tt('Hoor je niets, kijk dan of het toestel niet op stil staat en of het volume van de media hoog genoeg is.')}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-bold">{tt('De app vastzetten')}</h2>
        <p className="mt-2 text-ink-soft">
          {tt('Een app kan zichzelf niet vergrendelen; dat doet het toestel. Kies wat bij de tablet past.')}
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
        {tt('Videobellen en de microfoon werken alleen op een beveiligde verbinding. Via het gewone webadres is dat in orde; via een lokaal IP-adres niet.')}
      </p>

      <p className="mt-2 text-sm text-ink-faint">
        {tt('Dit toestel: {platform}.', { platform: platformVan() })} {navigator.userAgent.slice(0, 60)}…
      </p>
    </main>
  )
}

const VASTZETTEN: { titel: string; wat: string; stappen: string[] }[] = [
  {
    titel: tt('iPad: Begeleide toegang'),
    wat: tt('Ingebouwd en gratis. Uit de app gaan kan alleen nog met een code.'),
    stappen: [
      tt('Instellingen → Toegankelijkheid → Begeleide toegang: zet het aan en kies een code.'),
      tt('Instellingen → Beeldscherm en helderheid → Automatisch vergrendelen: Nooit.'),
      tt('Open LifeAngle vanaf het beginscherm en klik drie keer snel op de zij- of thuisknop.'),
      tt('Tik op Start. Stoppen doe je weer met drie klikken en de code.'),
    ],
  },
  {
    titel: tt('Android: app vastzetten'),
    wat: tt('Ingebouwd en gratis. Goed genoeg voor de meeste mensen, maar wie weet hoe het werkt, krijgt het ongedaan.'),
    stappen: [
      tt('Instellingen → Beveiliging → App vastzetten (soms onder Meer beveiligingsinstellingen): aanzetten, met ontgrendelen bij losmaken.'),
      tt('Open LifeAngle vanaf het beginscherm.'),
      tt('Open het overzicht van recente apps, tik op het pictogram van LifeAngle en kies Vastzetten.'),
    ],
  },
  {
    titel: tt('Android: Fully Kiosk Browser'),
    wat: tt('Een kleine eenmalige licentie per toestel, en de degelijkste keuze voor een tablet die jaren aan de muur hangt. LifeAngle start vanzelf na een stroomonderbreking, en de kioskmodus kan dan ook de echte helderheid regelen.'),
    stappen: [
      tt('Installeer Fully Kiosk Browser uit de Play Store.'),
      tt('Zet het webadres van LifeAngle als Start URL.'),
      tt('Zet bij Advanced Web Settings de JavaScript Interface aan.'),
      tt('Zet bij Device Management Keep Screen On en Launch on Boot aan.'),
      tt('Zet Kiosk Mode aan en kies een code om eruit te gaan.'),
      tt('Koppel de tablet daarna met de code uit Instellingen, net als anders.'),
    ],
  },
]
