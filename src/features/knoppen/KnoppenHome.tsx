import { Link } from 'react-router-dom'
import Icon, { type IconNaam } from '../../components/Icon'
import { useVoice } from '../voice-assistant/voiceStore'
import { dateLine, greeting } from '../../lib/time'
import { tt } from '../../lib/uiTaal'

interface Props {
  personName: string
  timezone: string
}

/**
 * Het dagscherm met grote knoppen: een andere indeling, dezelfde functies.
 *
 * Eén primaire knop bovenaan, daaronder zes grote tegels, en onderaan
 * "Praat met mij". Elke tegel brengt naar een bestaand scherm; er is
 * niets nieuws achter, en niets verdwijnt. De originele indeling blijft
 * precies zoals ze was, en is met de instelling "Origineel" weer terug te
 * zetten.
 *
 * Alleen de vorm verandert. De kleuren komen uit het gekozen palet
 * (data-palet op de html-tag), niet van dit scherm zelf.
 */
// Een functie en geen constante: tt() moet bij elke weergave de taal van
// het huishouden kennen, en die kan wijzigen zonder dat de module herlaadt.
function tegels(): { to: string; label: string; sub: string; icoon: IconNaam }[] {
  return [
    { to: '/', label: tt('Vandaag'), sub: tt('Wat er gepland staat'), icoon: 'vandaag' },
    { to: '/wie', label: tt('Wie komt er?'), sub: tt('Familie en bezoek'), icoon: 'wie' },
    { to: '/memory', label: tt('Waar ligt het?'), sub: tt('Dingen in huis'), icoon: 'memory' },
    { to: '/fotos', label: tt("Foto's"), sub: tt('Herinneringen'), icoon: 'fotos' },
    { to: '/radio', label: tt('Radio'), sub: tt('Favoriete zender'), icoon: 'afspelen' },
    { to: '/help', label: tt('Help'), sub: tt('Hulp of familie'), icoon: 'help' },
  ]
}

export default function KnoppenHome({ personName, timezone }: Props) {
  const now = new Date()
  const openVoice = useVoice((s) => s.openen)

  return (
    <div className="space-y-6">
      <header>
        <p className="text-lg font-semibold text-ink-soft">{dateLine(now, timezone)}</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight">
          {greeting(now, timezone)}, {personName}
        </h1>
      </header>

      {/* Eén primaire actie, bovenaan, zoals op het originele scherm. */}
      <Link
        to="/nu"
        aria-label={tt('Wat moet ik nu doen?')}
        className="flex min-h-big items-center gap-6 rounded-card bg-accent px-8 py-6 text-white shadow-lift"
      >
        <Icon naam="vandaag" size={56} />
        <span>
          <span className="block text-xl font-semibold opacity-90">{tt('Wat moet ik nu doen?')}</span>
          <span className="block text-3xl font-extrabold">{tt('Bekijk wat nu belangrijk is')}</span>
        </span>
      </Link>

      <nav aria-label={tt('Hoofdmenu')} className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {tegels().map((t) => (
          <Link
            key={t.to}
            to={t.to}
            className="flex min-h-big flex-col justify-center gap-3 rounded-card bg-surface p-6 shadow-card"
          >
            <Icon naam={t.icoon} size={48} />
            <span className="text-3xl font-bold">{t.label}</span>
            <span className="text-lg text-ink-soft">{t.sub}</span>
          </Link>
        ))}
      </nav>

      <button
        type="button"
        onClick={openVoice}
        className="flex min-h-big w-full items-center justify-center gap-4 rounded-pill border-4 border-accent bg-surface text-2xl font-bold text-accent-ink"
      >
        <Icon naam="praten" size={36} />
        {tt('Praat met mij')}
      </button>
    </div>
  )
}
