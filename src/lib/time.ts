/** Datum- en tijdhulp die altijd in de tijdzone van het huishouden rekent. */

export function localDateKey(d: Date, tz: string): string {
  // en-CA geeft YYYY-MM-DD, wat sorteerbaar en vergelijkbaar is.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function hhmm(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('nl-BE', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

export function dateLine(d: Date, tz: string): string {
  const s = new Intl.DateTimeFormat('nl-BE', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function greeting(d: Date, tz: string): string {
  const uur = Number(
    new Intl.DateTimeFormat('nl-BE', { timeZone: tz, hour: '2-digit', hour12: false }).format(d),
  )
  if (uur < 6) return 'Goedenacht'
  if (uur < 12) return 'Goedemorgen'
  if (uur < 18) return 'Goedemiddag'
  return 'Goedenavond'
}

/** Minuten tussen twee momenten, positief als b later is. */
export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000)
}
