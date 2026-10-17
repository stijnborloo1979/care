import { tt } from '../../lib/uiTaal'

/**
 * De kleurpaletten die familie of het WZC kan kiezen.
 *
 * Vaste keuzes, bewust. Een vrije kleurkiezer zou een palet kunnen maken
 * waarop de tekst niet meer te lezen is, en een bewoner die slecht ziet
 * kan dat niet zelf rechtzetten. Elk palet hier is vooraf gecontroleerd
 * (zie paletten.test.ts): de accentkleur met witte tekst en de
 * accentkleur-tekst op het zachte vlak halen minstens 4,5:1.
 *
 * Alleen kleuren. De indeling verandert er nooit door.
 */

export type PaletId = 'standaard' | 'linde' | 'zacht-blauw' | 'hoog-contrast'

export interface Palet {
  id: PaletId
  naam: string
  accent: string
  accentInk: string
  accentSoft: string
}

export const PALETTEN: Palet[] = [
  {
    id: 'standaard',
    naam: 'LifeAngle standaard',
    // Dit palet staat al in index.css als de standaard; de waarden hier zijn
    // alleen voor de controle en het bolletje in de keuze.
    accent: '#0f5d63',
    accentInk: '#0a4a4f',
    accentSoft: '#ddefef',
  },
  {
    id: 'linde',
    naam: 'Linde (groen-blauw)',
    accent: '#1d6b63',
    accentInk: '#17564f',
    accentSoft: '#e0f1ee',
  },
  {
    id: 'zacht-blauw',
    naam: 'Zacht blauw',
    accent: '#1f4e79',
    accentInk: '#1a4166',
    accentSoft: '#e4ecf4',
  },
  {
    id: 'hoog-contrast',
    naam: 'Hoog contrast',
    accent: '#5c1f08',
    accentInk: '#4a1906',
    accentSoft: '#f7e6dc',
  },
]

export const PALET_IDS: PaletId[] = PALETTEN.map((p) => p.id)

export function isPalet(v: unknown): v is PaletId {
  return typeof v === 'string' && (PALET_IDS as string[]).includes(v)
}

export function paletVan(id: string | null | undefined): Palet {
  return PALETTEN.find((p) => p.id === id) ?? PALETTEN[0]
}

/** Naam van een palet, in de taal van het toestel. */
export function paletNaam(p: Palet): string {
  return tt(p.naam)
}

/* -------------------------------------------------------------------
   Contrast volgens WCAG 2.x. Hier, zodat de controle in de test
   dezelfde rekenregel gebruikt als een browser.
   ------------------------------------------------------------------- */

function kanaal(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

export function luminantie(hex: string): number {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.2126 * kanaal(r) + 0.7152 * kanaal(g) + 0.0722 * kanaal(b)
}

export function contrast(a: string, b: string): number {
  const la = luminantie(a)
  const lb = luminantie(b)
  const [hoog, laag] = la > lb ? [la, lb] : [lb, la]
  return (hoog + 0.05) / (laag + 0.05)
}

/* -------------------------------------------------------------------
   Kleur per knop op het scherm met grote knoppen.

   Familie of het WZC kiest per knop een kleur uit deze lijst. Vaste
   lijst, net als de paletten: elke kleur haalt minstens 4,5:1 met witte
   tekst (zie paletten.test.ts), en de server (migratie 89) weigert alles
   wat hier niet in staat.
   ------------------------------------------------------------------- */

export type KnopId = 'nu' | 'vandaag' | 'wie' | 'memory' | 'fotos' | 'radio' | 'help' | 'medicatie' | 'zoeken' | 'praten'

export const KNOP_IDS: KnopId[] = ['nu', 'vandaag', 'wie', 'memory', 'fotos', 'radio', 'help', 'medicatie', 'zoeken', 'praten']

export interface KleurKeuze {
  hex: string
  naam: string
}

/**
 * Twaalf kleuren die bij elkaar passen, van groen-blauw via blauw en paars
 * naar warm bruin en inkt. Zo kan een reeks knoppen een rustige schakering
 * krijgen in plaats van willekeurige kleuren.
 */
export const KNOP_KLEUREN: KleurKeuze[] = [
  { hex: '#0f5d63', naam: 'Petrol' },
  { hex: '#1d6b63', naam: 'Linde' },
  { hex: '#2f6b3a', naam: 'Bos' },
  { hex: '#1f4e79', naam: 'Blauw' },
  { hex: '#17568f', naam: 'Zee' },
  { hex: '#2b3f8f', naam: 'Indigo' },
  { hex: '#66409a', naam: 'Paars' },
  { hex: '#7a2f5e', naam: 'Pruim' },
  { hex: '#9a4a2a', naam: 'Roest' },
  { hex: '#7a5a12', naam: 'Oker' },
  { hex: '#5c1f08', naam: 'Bruin' },
  { hex: '#1f1d1a', naam: 'Inkt' },
]

export type KnopKleuren = Partial<Record<KnopId, string>>

export function isKnopId(v: unknown): v is KnopId {
  return typeof v === 'string' && (KNOP_IDS as string[]).includes(v)
}

export function isKnopKleur(v: unknown): v is string {
  return typeof v === 'string' && KNOP_KLEUREN.some((k) => k.hex === v)
}

/** Alleen bekende knoppen met een bekende kleur; de rest valt weg. */
export function schoneKnopKleuren(ruw: unknown): KnopKleuren {
  const uit: KnopKleuren = {}
  if (!ruw || typeof ruw !== 'object') return uit
  for (const [sleutel, waarde] of Object.entries(ruw as Record<string, unknown>)) {
    if (isKnopId(sleutel) && isKnopKleur(waarde)) uit[sleutel] = waarde
  }
  return uit
}

/* -------------------------------------------------------------------
   Foto per knop. De foto krijgt een donkere laag eroverheen, zodat de
   witte tekst altijd leesbaar blijft, wat de foto ook is.
   ------------------------------------------------------------------- */

/**
 * Dekking van de laag over een foto. Bij 60% zwart wordt zelfs een volledig
 * witte foto #666666: dat geeft 5,7:1 met witte tekst (zie knopKleuren.test.ts).
 */
export const FOTO_LAAG_DEKKING = 0.6

/** Het pad van een knopfoto in de bucket. De server controleert het echte huishouden. */
export type KnopFotos = Partial<Record<KnopId, string>>

/** Alleen bekende knoppen met een nette padnaam; de rest valt weg. */
export function schoneKnopFotos(ruw: unknown): KnopFotos {
  const uit: KnopFotos = {}
  if (!ruw || typeof ruw !== 'object') return uit
  for (const [sleutel, waarde] of Object.entries(ruw as Record<string, unknown>)) {
    if (
      isKnopId(sleutel) &&
      typeof waarde === 'string' &&
      waarde.length > 0 &&
      waarde.length <= 300 &&
      !waarde.includes('..') &&
      !waarde.startsWith('/')
    ) {
      uit[sleutel] = waarde
    }
  }
  return uit
}
