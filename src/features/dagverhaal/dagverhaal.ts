import type { Summary } from '../../services/dashboard'
import type { Bezoek } from '../../services/bezoek'
import { hhmm, localDateKey } from '../../lib/time'

/**
 * Het dagverhaal: wat er vandaag gebeurde, in een paar gewone zinnen.
 * Voor familie die niet elke dag kan bellen, en voor broers en zussen die
 * het willen doorsturen. Alleen feiten uit de app, geen oordeel en zeker
 * geen medische duiding.
 */

const AUTOMATISCH = /afgevinkt|bevestigd|opengezet|gekoppeld|koppeling|verblijf/i

function lijstje(woorden: string[]): string {
  if (woorden.length <= 1) return woorden.join('')
  return `${woorden.slice(0, -1).join(', ')} en ${woorden[woorden.length - 1]}`
}

function dagdeel(iso: string, tz: string): string {
  const u = Number(new Intl.DateTimeFormat('nl-BE', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date(iso))) % 24
  return u < 12 ? 'in de voormiddag' : u < 18 ? 'in de namiddag' : "'s avonds"
}

export function dagverhaal(input: {
  naam: string
  summary: Summary
  bezoeken: Bezoek[]
  tz: string
  nu?: Date
}): string[] {
  const { naam, summary, tz } = input
  const nu = input.nu ?? new Date()
  const vandaag = localDateKey(nu, tz)
  const zinnen: string[] = []

  // Wat er gepland stond en wat al afgevinkt is. Geen kale cijfers: welke dingen.
  const gepland = summary.events.filter((e) => localDateKey(new Date(e.starts_at), tz) === vandaag)
  const gedaan = gepland.filter((e) => e.done_at)
  if (gedaan.length > 0) {
    const titels = gedaan.slice(0, 3).map((e) => e.title.toLowerCase())
    const rest = gedaan.length - titels.length
    zinnen.push(
      `${naam} vinkte vandaag ${lijstje(titels)} af${rest > 0 ? `, en nog ${rest} ander${rest === 1 ? '' : 'e'}` : ''}.`,
    )
  } else if (gepland.length > 0 && gepland.some((e) => new Date(e.starts_at) < nu)) {
    zinnen.push(`Er is vandaag nog niets afgevinkt.`)
  }

  // Bezoek: wie, wanneer en wat ze deden.
  const bezoekVandaag = input.bezoeken.filter((b) => localDateKey(new Date(b.visited_at), tz) === vandaag)
  for (const b of bezoekVandaag.slice(0, 3)) {
    zinnen.push(`${b.visitor_name} was op bezoek ${dagdeel(b.visited_at, tz)}${b.note ? `: ${b.note.replace(/\.$/, '').toLowerCase()}` : ''}.`)
  }

  // Medicatie: alleen of het bevestigd is. Wat ze neemt, staat er niet.
  const verlopen = summary.meds.filter((m) => new Date(m.due_at) <= nu)
  if (verlopen.length > 0) {
    const open = verlopen.filter((m) => !m.taken_at)
    if (open.length === 0) zinnen.push('Alle medicatie tot nu toe is bevestigd.')
    else
      zinnen.push(
        `De medicatie van ${lijstje([...new Set(open.map((m) => hhmm(new Date(m.due_at), tz)))])} is nog niet bevestigd.`,
      )
  }

  // Wat familie of zorgverleners zelf in het logboek schreven.
  const notities = summary.log
    .filter((l) => (l.source === 'family' || l.source === 'caregiver') && !AUTOMATISCH.test(l.title))
    .slice(0, 2)
  for (const l of notities) {
    zinnen.push(`In het logboek: ${l.title.replace(/\.$/, '')}${l.note ? ` — ${l.note.replace(/\.$/, '')}` : ''}.`)
  }

  // Wat er nog komt.
  const straks = gepland.find((e) => !e.done_at && new Date(e.starts_at) > nu)
  if (straks) zinnen.push(`Nog op de planning: ${straks.title.toLowerCase()} om ${hhmm(new Date(straks.starts_at), tz)}.`)

  if (zinnen.length === 0) zinnen.push(`Over vandaag staat er nog niets in de app.`)
  return zinnen
}
