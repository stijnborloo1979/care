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
import { getMedsToday } from '../../services/medsToday'
import { lopendVerblijf } from '../zorg/bewonerBerichten'
import {
  FOTO_LAAG_DEKKING,
  schoneKnopFotos,
  schoneKnopKleuren,
  type KnopFotos,
  type KnopId,
  type KnopKleuren,
} from '../palet/paletten'
import { schoneTegels, tegelZichtbaar, type KiesbareTegel } from './tegels'

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
  /** Welke keuzetegels er staan; null = alle. Vaste tegels staan altijd. */
  tegels?: KiesbareTegel[] | null
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

interface Tegel {
  id: KnopId
  label: string
  sub: string
  icoon: IconNaam
  /** Waar de tegel naartoe gaat. Ontbreekt het, dan opent de tegel de stem. */
  to?: string
}

// Een functie en geen constante: tt() moet bij elke weergave de taal van
// het huishouden kennen, en die kan wijzigen zonder dat de module herlaadt.
// De volgorde hier is de volgorde op het scherm.
function alleTegels(): Tegel[] {
  return [
    // Geen "/": dat is het scherm met grote knoppen zelf. Het overzicht staat op /overzicht.
    { id: 'vandaag', to: '/overzicht', label: tt('Vandaag'), sub: tt('Wat er gepland staat'), icoon: 'vandaag' },
    { id: 'onthouden', to: '/onthouden', label: tt('Iets onthouden'), sub: tt('Wat ik niet wil vergeten'), icoon: 'weetjes' },
    { id: 'herinneringen', to: '/levensboek', label: tt('Herinneringen'), sub: tt('Mijn levensboek'), icoon: 'documenten' },
    { id: 'zorgteam', to: '/zorgteam', label: tt('Zorgteam'), sub: tt('Iets vragen'), icoon: 'taken' },
    { id: 'wie', to: '/wie', label: tt('Wie komt er?'), sub: tt('Familie en bezoek'), icoon: 'wie' },
    { id: 'memory', to: '/memory', label: tt('Waar ligt het?'), sub: tt('Dingen in huis'), icoon: 'memory' },
    { id: 'fotos', to: '/fotos', label: tt("Foto's"), sub: tt("Foto's bekijken"), icoon: 'fotos' },
    { id: 'medicatie', to: '/medicijnen', label: tt('Medicijnen'), sub: tt('Wat ik vandaag neem'), icoon: 'medicatie' },
    { id: 'zoeken', to: '/zoeken', label: tt('Zoeken'), sub: tt('Vind wat je zoekt'), icoon: 'zoek' },
    { id: 'radio', to: '/radio', label: tt('Radio'), sub: tt('Favoriete zender'), icoon: 'afspelen' },
    { id: 'praten', label: tt('Praat met mij'), sub: tt('Vraag het gewoon'), icoon: 'praten' },
    { id: 'help', to: '/help', label: tt('Help'), sub: tt('Hulp of familie'), icoon: 'help' },
  ]
}

export default function KnoppenHome({ householdId, personName, timezone, kleuren, fotos, tegels }: Props) {
  const now = new Date()
  const klok = useNow()
  // Het volgende op de agenda, rechts in de startknop. Zelfde bron als Vandaag.
  const { data: agenda } = useVandaag(householdId, timezone, klok)
  const volgende = agenda ? whatNow(agenda, klok).next : undefined
  // Medicijnen: hoeveel innames vandaag nog open staan. Zelfde bron en sleutel
  // als de medicatiekaart, dus één keer ophalen.
  const { data: meds } = useQuery({
    queryKey: ['meds-today', householdId],
    queryFn: () => getMedsToday(householdId, timezone),
    enabled: !!householdId,
    staleTime: 60_000,
  })
  const openInnames = (meds ?? []).filter((m) => !m.taken_at).length
  // Eerstvolgende bezoek: uit dezelfde agenda als Vandaag.
  const volgendBezoek = (agenda ?? []).find((e) => e.kind === 'visit' && new Date(e.starts_at) > klok)
  // De tegel Zorgteam komt er alleen bij als er een WZC-verblijf loopt.
  const { data: verblijf } = useQuery({
    queryKey: ['lopend-verblijf', householdId],
    queryFn: () => lopendVerblijf(householdId),
    enabled: !!householdId,
    staleTime: 10 * 60_000,
    retry: false,
  })
  const openVoice = useVoice((s) => s.openen)
  // Een kleur of foto die niet (meer) in de vaste lijst staat, valt weg: dan
  // krijgt de tegel de gewone vormgeving.
  const k = schoneKnopKleuren(kleuren)
  const f = schoneKnopFotos(fotos)
  const keuze = schoneTegels(tegels)
  const kleurVan = (id: KnopId) => k[id]
  const fotoVan = (id: KnopId) => f[id]
  const nuKleur = kleurVan('nu')
  const fotoNu = fotoVan('nu')

  // De ondertitel van een tegel, als er live gegevens zijn. Anders de vaste tekst.
  const levendeSub = (id: KnopId): string | undefined => {
    if (id === 'vandaag' && volgende) return `${hhmm(new Date(volgende.starts_at), timezone)} · ${volgende.title}`
    if (id === 'medicatie' && meds) {
      return openInnames > 0 ? tt('Nog {aantal} te nemen', { aantal: openInnames }) : tt('Alles genomen')
    }
    if (id === 'wie' && volgendBezoek) return tt('Om {tijd}', { tijd: hhmm(new Date(volgendBezoek.starts_at), timezone) })
    return undefined
  }

  const zichtbareTegels = alleTegels().filter((tg) => tegelZichtbaar(tg.id, keuze, !!verblijf))

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
        {zichtbareTegels.map((tg) => {
          const kleur = kleurVan(tg.id)
          const foto = fotoVan(tg.id)
          const inhoud = (
            <span className="relative flex flex-col gap-3">
              <Icon naam={tg.icoon} size={48} />
              <span className="text-3xl font-bold">{tg.label}</span>
              <span className={`text-lg ${kleur || foto ? 'opacity-90' : 'text-ink-soft'}`}>
                {levendeSub(tg.id) ?? tg.sub}
              </span>
            </span>
          )
          // Met een foto is de tekst altijd wit, ook zonder gekozen kleur;
          // anders is ze donker op een donkere foto.
          const stijl = kleurStijl(kleur) ?? (foto ? { color: '#ffffff' } : undefined)
          const klas = `relative flex min-h-big flex-col justify-center overflow-hidden rounded-card p-6 shadow-card ${kleur ? '' : 'bg-surface'}`
          if (!tg.to) {
            return (
              <button
                key={tg.id}
                type="button"
                onClick={openVoice}
                style={stijl}
                className={`${klas} ${kleur ? '' : 'bg-accent text-accent-ink'}`}
              >
                {foto ? <KnopAchtergrond pad={foto} /> : null}
                {inhoud}
              </button>
            )
          }
          return (
            <Link key={tg.id} to={tg.to} style={stijl} className={klas}>
              {foto ? <KnopAchtergrond pad={foto} /> : null}
              {inhoud}
            </Link>
          )
        })}
      </nav>
    </main>
  )
}
