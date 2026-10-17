import type { CSSProperties } from 'react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Icon, { type IconNaam } from '../../components/Icon'
import { useVoice } from '../voice-assistant/voiceStore'
import { dateLine, greeting, hhmm } from '../../lib/time'
import { tt } from '../../lib/uiTaal'
import { signedUrlCached } from '../../lib/storage'
import { t } from '../../lib/i18n'
import { useNow } from '../today/useAgenda'
import { useVandaag } from '../today/useVandaag'
import { whatNow } from '../today/whatNow'
import {
  FOTO_LAAG_DEKKING,
  schoneKnopFotos,
  schoneKnopKleuren,
  type KnopFotos,
  type KnopId,
  type KnopKleuren,
} from '../palet/paletten'

/** De bucket waar de knopfoto's staan: dezelfde als de kamerfoto's. */
const BUCKET = 'home-memory'

interface Props {
  householdId: string
  personName: string
  timezone: string
  /** Kleur per knop, door familie of het WZC gekozen. Ontbreekt een knop, dan de gewone vormgeving. */
  kleuren?: KnopKleuren
  /** Foto per knop, als pad in de bucket. Ontbreekt een knop, dan telt de kleur. */
  fotos?: KnopFotos
}

/** Vorm en kleur van een gekleurde tegel: de achtergrond is de gekozen kleur, de tekst wit. */
function kleurStijl(kleur: string | undefined): CSSProperties | undefined {
  return kleur ? { backgroundColor: kleur, color: '#ffffff' } : undefined
}

/**
 * De foto achter een knop, met een donkere laag eroverheen. Die laag zorgt
 * dat de witte tekst leesbaar blijft, wat de foto ook is (zie paletten.ts).
 * Lukt het laden niet, dan blijft de gekozen kleur staan.
 */
export function KnopAchtergrond({ pad }: { pad: string }) {
  const [kapot, setKapot] = useState(false)
  const { data } = useQuery({
    queryKey: ['knop-foto', pad],
    queryFn: () => signedUrlCached(BUCKET, pad),
    staleTime: 3 * 3600 * 1000,
    retry: 1,
  })

  if (!data || kapot) return null
  return (
    <>
      <img
        src={data}
        alt=""
        loading="lazy"
        onError={() => setKapot(true)}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundColor: `rgba(0, 0, 0, ${FOTO_LAAG_DEKKING})` }}
      />
    </>
  )
}

// Een functie en geen constante: tt() moet bij elke weergave de taal van
// het huishouden kennen, en die kan wijzigen zonder dat de module herlaadt.
// Medicijnen en zoeken hebben nog geen kleur of foto per knop: die komt pas
// met een migratie die de server-lijst uitbreidt.
function tegels(): { id: KnopId | 'medicatie' | 'zoeken'; to: string; label: string; sub: string; icoon: IconNaam }[] {
  return [
    // Geen "/": dat is het scherm met grote knoppen zelf. Het overzicht staat op /overzicht.
    { id: 'vandaag', to: '/overzicht', label: tt('Vandaag'), sub: tt('Wat er gepland staat'), icoon: 'vandaag' },
    { id: 'wie', to: '/wie', label: tt('Wie komt er?'), sub: tt('Familie en bezoek'), icoon: 'wie' },
    { id: 'memory', to: '/memory', label: tt('Waar ligt het?'), sub: tt('Dingen in huis'), icoon: 'memory' },
    { id: 'fotos', to: '/fotos', label: tt("Foto's"), sub: tt('Herinneringen'), icoon: 'fotos' },
    { id: 'medicatie', to: '/medicijnen', label: tt('Medicijnen'), sub: tt('Wat ik vandaag neem'), icoon: 'medicatie' },
    { id: 'zoeken', to: '/zoeken', label: tt('Zoeken'), sub: tt('Vind wat je zoekt'), icoon: 'zoek' },
    { id: 'radio', to: '/radio', label: tt('Radio'), sub: tt('Favoriete zender'), icoon: 'afspelen' },
    { id: 'help', to: '/help', label: tt('Help'), sub: tt('Hulp of familie'), icoon: 'help' },
  ]
}

export default function KnoppenHome({ householdId, personName, timezone, kleuren, fotos }: Props) {
  const now = new Date()
  const klok = useNow()
  // Het volgende op de agenda, rechts in de startknop. Zelfde bron als Vandaag.
  const { data: agenda } = useVandaag(householdId, timezone, klok)
  const volgende = agenda ? whatNow(agenda, klok).next : undefined
  const openVoice = useVoice((s) => s.openen)
  // Een kleur of foto die niet (meer) in de vaste lijst staat, valt weg: dan
  // krijgt de tegel de gewone vormgeving.
  const k = schoneKnopKleuren(kleuren)
  const f = schoneKnopFotos(fotos)
  const kleurVan = (id: string) => (k as Record<string, string | undefined>)[id]
  const fotoVan = (id: string) => (f as Record<string, string | undefined>)[id]
  const nuKleur = kleurVan('nu')
  const fotoNu = fotoVan('nu')

  return (
    <main className="mx-auto max-w-[64rem] space-y-6 px-5 pb-28 pt-6">
      <header>
        <p className="text-lg font-semibold text-ink-soft">{dateLine(now, timezone)}</p>
        <h1 className="mt-1 text-4xl font-extrabold tracking-tight">
          {greeting(now, timezone)}, {personName}
        </h1>
      </header>

      {/* Eén primaire actie, bovenaan, zoals op het originele scherm. Rechts
          staat het volgende op de agenda, zodat je niet hoeft te zoeken. */}
      <Link
        to="/nu"
        style={kleurStijl(nuKleur)}
        className={`relative flex min-h-big flex-col overflow-hidden rounded-card text-white shadow-lift sm:flex-row ${nuKleur ? '' : 'bg-accent'}`}
      >
        {fotoNu ? <KnopAchtergrond pad={fotoNu} /> : null}
        <span className="relative flex flex-1 items-center gap-6 px-8 py-6">
          <Icon naam="vandaag" size={56} />
          <span>
            <span className="block text-xl font-semibold opacity-90">{tt('Wat moet ik nu doen?')}</span>
            <span className="block text-3xl font-extrabold">{tt('Bekijk wat nu belangrijk is')}</span>
          </span>
        </span>

        {volgende !== undefined ? (
          <span className="relative flex min-w-0 shrink-0 flex-col justify-center gap-2 border-t border-white/35 bg-black/20 px-8 py-6 sm:w-[22rem] sm:border-l sm:border-t-0">
            {volgende ? (
              <>
                <span className="text-lg font-semibold opacity-90">
                  {t('vandaag.daarna')} · {t('vandaag.om', { tijd: hhmm(new Date(volgende.starts_at), timezone) })}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-3xl" aria-hidden="true">
                    {volgende.emoji ?? '📌'}
                  </span>
                  <span className="min-w-0 break-words text-3xl font-extrabold leading-tight">{volgende.title}</span>
                </span>
                {volgende.note ? <span className="text-lg opacity-90">{volgende.note}</span> : null}
              </>
            ) : (
              <>
                <span className="text-lg font-semibold opacity-90">{t('vandaag.daarna')}</span>
                <span className="text-3xl font-extrabold leading-tight">{tt('Vandaag niets meer')}</span>
                <span className="text-lg opacity-90">{tt('Rust maar even')}</span>
              </>
            )}
          </span>
        ) : null}
      </Link>

      <nav aria-label={tt('Hoofdmenu')} className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {tegels().map((t) => {
          const kleur = kleurVan(t.id)
          const foto = fotoVan(t.id)
          return (
            <Link
              key={t.to}
              to={t.to}
              style={kleurStijl(kleur)}
              className={`relative flex min-h-big flex-col justify-center overflow-hidden rounded-card p-6 shadow-card ${kleur ? '' : 'bg-surface'}`}
            >
              {foto ? <KnopAchtergrond pad={foto} /> : null}
              <span className="relative flex flex-col gap-3">
                <Icon naam={t.icoon} size={48} />
                <span className="text-3xl font-bold">{t.label}</span>
                <span className={`text-lg ${kleur || foto ? 'opacity-90' : 'text-ink-soft'}`}>{t.sub}</span>
              </span>
            </Link>
          )
        })}
      </nav>

      <button
        type="button"
        onClick={openVoice}
        className="flex min-h-big w-full items-center justify-center gap-4 rounded-pill border-4 border-accent bg-surface text-2xl font-bold text-accent-ink"
      >
        <Icon naam="praten" size={36} />
        {tt('Praat met mij')}
      </button>
    </main>
  )
}
