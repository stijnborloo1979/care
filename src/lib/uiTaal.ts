/**
 * De taal van de schermen voor familie en zorgteam (LifeAngle Care).
 *
 * Los van de taal van de tablet (lib/i18n, per huishouden): een Franstalige
 * zorgkundige kan zorgen voor een Nederlandstalige bewoner, en omgekeerd.
 *
 * De Nederlandse tekst is de sleutel: tt('Bewoners') geeft in het Frans
 * "Résidents". Ontbreekt een vertaling, dan blijft het Nederlands staan:
 * liever een Nederlands woord dan een lege knop. Variabelen tussen
 * accolades: tt('Kamer {naam} wissen?', { naam }).
 *
 * De vertalingen staan per onderdeel in lib/vertalingen/*.ts. Wie de taal
 * kiest, laadt de app opnieuw; zo hoeft geen enkel scherm zelf te luisteren.
 */
export type UiTaal = 'nl' | 'fr' | 'en'

export interface Vertaling {
  fr: Record<string, string>
  en: Record<string, string>
}

export const UI_TALEN: { code: UiTaal; naam: string }[] = [
  { code: 'nl', naam: 'Nederlands' },
  { code: 'fr', naam: 'Français' },
  { code: 'en', naam: 'English' },
]

const SLEUTEL = 'lifeangle.uitaal'

function begin(): UiTaal {
  try {
    const bewaard = localStorage.getItem(SLEUTEL)
    if (bewaard === 'nl' || bewaard === 'fr' || bewaard === 'en') return bewaard
  } catch {
    // privévenster of geblokkeerde opslag: gewoon verder
  }
  // Nog niets gekozen: een Franstalig toestel krijgt Frans. Alle andere
  // blijven Nederlands, zoals de app altijd was.
  try {
    if (typeof navigator !== 'undefined' && /^fr\b/i.test(navigator.language)) return 'fr'
  } catch {
    // geen navigator (tests)
  }
  return 'nl'
}

let huidige: UiTaal = begin()

const modules = import.meta.glob<{ default: Vertaling }>('./vertalingen/*.ts', { eager: true })
const WOORDEN: Record<'fr' | 'en', Record<string, string>> = { fr: {}, en: {} }
for (const m of Object.values(modules)) {
  Object.assign(WOORDEN.fr, m.default.fr)
  Object.assign(WOORDEN.en, m.default.en)
}

export function uiTaal(): UiTaal {
  return huidige
}

/** Voor datums en getallen: nl-BE, fr-BE of en-GB. */
export function uiLocale(): string {
  return huidige === 'fr' ? 'fr-BE' : huidige === 'en' ? 'en-GB' : 'nl-BE'
}

/** Alleen voor tests: zonder herladen van taal wisselen. */
export function zetUiTaalVoorTest(t: UiTaal) {
  huidige = t
}

export function kiesUiTaal(t: UiTaal) {
  try {
    localStorage.setItem(SLEUTEL, t)
  } catch {
    // niet bewaard: dan geldt het alleen tot het herladen
  }
  huidige = t
  if (typeof window !== 'undefined') window.location.reload()
}

export function tt(nl: string, waarden?: Record<string, string | number>): string {
  const zin = huidige === 'nl' ? nl : (WOORDEN[huidige][nl] ?? nl)
  if (!waarden) return zin
  return zin.replace(/\{(\w+)\}/g, (heel, naam) => (naam in waarden ? String(waarden[naam]) : heel))
}

/** Hoeveel sleutels er vertaald zijn (voor de controle in de tests). */
export function woordenboek(t: 'fr' | 'en'): Record<string, string> {
  return WOORDEN[t]
}
