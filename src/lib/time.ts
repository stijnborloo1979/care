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

/**
 * Hoeveel een tijdzone op een bepaald moment voorloopt op UTC, in ms.
 * Nodig om "donderdag 14:00 in Brussel" om te zetten naar een moment,
 * zonder een datumbibliotheek mee te slepen.
 */
export function tzOffsetMs(moment: Date, tz: string): number {
  const delen = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(moment)
  const neem = (t: string) => Number(delen.find((d) => d.type === t)?.value)
  const uur = neem('hour') === 24 ? 0 : neem('hour')
  const alsUtc = Date.UTC(neem('year'), neem('month') - 1, neem('day'), uur, neem('minute'), neem('second'))
  return alsUtc - moment.getTime()
}

/** Een lokale datum en tijd in de tijdzone van het huishouden, als moment. */
export function zonedToUtc(datum: string, tijd: string, tz: string): Date {
  const [j, m, d] = datum.split('-').map(Number)
  const [u, min] = tijd.split(':').map(Number)
  const gok = Date.UTC(j, m - 1, d, u, min)
  const eerste = tzOffsetMs(new Date(gok), tz)
  let resultaat = gok - eerste
  // Op de dag van de zomertijdwissel kan de eerste schatting er een uur
  // naast zitten; één keer bijsturen volstaat.
  const tweede = tzOffsetMs(new Date(resultaat), tz)
  if (tweede !== eerste) resultaat = gok - tweede
  return new Date(resultaat)
}

/** Rekenen met datumsleutels (JJJJ-MM-DD), los van tijdzones en zomertijd. */
export function plusDagen(sleutel: string, dagen: number): string {
  const [j, m, d] = sleutel.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, d + dagen)).toISOString().slice(0, 10)
}

/** De maandag van de week waarin deze dag valt. */
export function maandagVan(sleutel: string): string {
  const [j, m, d] = sleutel.split('-').map(Number)
  const dag = new Date(Date.UTC(j, m - 1, d)).getUTCDay()
  return plusDagen(sleutel, dag === 0 ? -6 : 1 - dag)
}
