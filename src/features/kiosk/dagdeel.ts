/**
 * Pure tijdlogica voor de kioskmodus: wanneer is het nacht, en hoe zeg je
 * het tijdstip zo dat iemand zich meteen kan oriënteren. Zonder React, zodat
 * het met een vaste klok te testen is.
 */
import { hhmm } from '../../lib/time'
import { locale, t } from '../../lib/i18n'

export type Dagdeel = 'ochtend' | 'middag' | 'avond' | 'nacht'

export function uurIn(d: Date, tz: string): number {
  return Number(hhmm(d, tz).slice(0, 2))
}

export function dagdeelVan(uur: number): Dagdeel {
  if (uur < 6) return 'nacht'
  if (uur < 12) return 'ochtend'
  if (uur < 18) return 'middag'
  return 'avond'
}

/**
 * Valt dit uur binnen het nachtvenster? Het venster loopt meestal over
 * middernacht (22 tot 7), maar mag ook binnen één dag liggen.
 * Van en tot gelijk betekent: geen nacht.
 */
export function isNacht(uur: number, van: number, tot: number): boolean {
  if (van === tot) return false
  return van < tot ? uur >= van && uur < tot : uur >= van || uur < tot
}

function weekdag(d: Date, tz: string): string {
  return new Intl.DateTimeFormat(locale(), { timeZone: tz, weekday: 'long' }).format(d)
}

function datum(d: Date, tz: string): string {
  return new Intl.DateTimeFormat(locale(), { timeZone: tz, day: 'numeric', month: 'long' }).format(d)
}

/**
 * "Het is dinsdagavond." Na middernacht zeggen we gewoon "Het is nacht":
 * "woensdagnacht" om drie uur verwart meer dan het helpt.
 */
export function omschrijving(d: Date, tz: string): { titel: string; onder: string } {
  const deel = dagdeelVan(uurIn(d, tz))
  const dag = weekdag(d, tz)
  if (deel === 'nacht') {
    return { titel: t('nacht.isNacht'), onder: `${hoofdletter(dag)} ${datum(d, tz)}` }
  }
  return { titel: `Het is ${dag}${deel}`, onder: datum(d, tz) }
}

function hoofdletter(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
