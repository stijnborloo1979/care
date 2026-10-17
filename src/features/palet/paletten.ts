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
