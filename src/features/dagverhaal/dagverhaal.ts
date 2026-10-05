import type { Summary } from '../../services/dashboard'
import type { Bezoek } from '../../services/bezoek'
import { aanwezigBij, type HuisMoment } from '../../services/afdelingsdagPuur'
import type { Uitstap } from '../../services/uitstapPuur'
import { hhmm, localDateKey } from '../../lib/time'
import { tt } from '../../lib/uiTaal'

/**
 * Het dagverhaal: wat er vandaag gebeurde, in een paar gewone zinnen.
 * Voor familie die niet elke dag kan bellen, en voor broers en zussen die
 * het willen doorsturen. Alleen feiten uit de app, geen oordeel en zeker
 * geen medische duiding.
 */

const AUTOMATISCH =
  /afgevinkt|bevestigd|opengezet|gekoppeld|koppel|verblijf|lid toegevoegd|nieuw lid|uitgenodigd|toegewezen|zorgverlener|locatie|noodtoegang/i
// Het dagverhaal wordt doorgestuurd: medicatie komt er nooit bij naam in.
const MEDISCH = /pil|medic|medicijn|tablet|druppel|capsule|\bmg\b|siroop|zalf|inspuiting|insuline/i

function zonderMedicatie(tekst: string, namen: string[]): boolean {
  const t = tekst.toLowerCase()
  return !MEDISCH.test(t) && !namen.some((n) => n && t.includes(n))
}

/** Hoofdletter weg aan het begin, de rest blijft: "Met Jan" → "met Jan". */
function kleinBegin(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1)
}

function lijstje(woorden: string[]): string {
  if (woorden.length <= 1) return woorden.join('')
  return tt('{begin} en {laatste}', { begin: woorden.slice(0, -1).join(', '), laatste: woorden[woorden.length - 1] })
}

function dagdeel(iso: string, tz: string): string {
  const u = Number(new Intl.DateTimeFormat('nl-BE', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date(iso))) % 24
  return u < 12 ? tt('in de voormiddag') : u < 18 ? tt('in de namiddag') : tt("'s avonds")
}

export interface Dagverhaal {
  /** Om te lezen én door te sturen: alleen wat de app zelf vaststelt. */
  zinnen: string[]
  /** Wat familie of zorgverleners zelf schreven: vrije tekst, dus niet doorgestuurd. */
  logboek: string[]
}

export function dagverhaal(input: {
  naam: string
  summary: Summary
  bezoeken: Bezoek[]
  /** De dag van de afdeling (78), voor wie in een woonzorgcentrum woont. */
  huis?: HuisMoment[]
  /** Uitstap met de familie (80). Alleen wie en of ze terug is; de notitie niet. */
  uitstappen?: Uitstap[]
  tz: string
  nu?: Date
}): Dagverhaal {
  const { naam, summary, tz } = input
  const nu = input.nu ?? new Date()
  const vandaag = localDateKey(nu, tz)
  const zinnen: string[] = []
  const medNamen = [...new Set(summary.meds.map((m) => m.name.toLowerCase().split(' ')[0]))].filter((n) => n.length > 2)

  // Wat er gepland stond en wat al afgevinkt is. Geen kale cijfers: welke dingen.
  // Medicatiemomenten uit de agenda komen er niet bij naam in; die staan
  // hieronder als "bevestigd of niet".
  const gepland = summary.events.filter(
    (e) => localDateKey(new Date(e.starts_at), tz) === vandaag && e.kind !== 'med' && zonderMedicatie(e.title, medNamen),
  )
  const gedaan = gepland.filter((e) => e.done_at)
  if (gedaan.length > 0) {
    const titels = gedaan.slice(0, 3).map((e) => kleinBegin(e.title))
    const rest = gedaan.length - titels.length
    zinnen.push(
      rest === 0
        ? tt('{naam} vinkte vandaag {lijst} af.', { naam, lijst: lijstje(titels) })
        : rest === 1
          ? tt('{naam} vinkte vandaag {lijst} af, en nog {n} ander.', { naam, lijst: lijstje(titels), n: rest })
          : tt('{naam} vinkte vandaag {lijst} af, en nog {n} andere.', { naam, lijst: lijstje(titels), n: rest }),
    )
  } else if (gepland.length > 0 && gepland.some((e) => new Date(e.starts_at) < nu)) {
    zinnen.push(tt('Er is vandaag nog niets afgevinkt.'))
  }

  // Bezoek: wie, wanneer en wat ze deden.
  const bezoekVandaag = input.bezoeken.filter((b) => localDateKey(new Date(b.visited_at), tz) === vandaag)
  for (const b of bezoekVandaag.slice(0, 3)) {
    zinnen.push(tt('{naam} was op bezoek {dagdeel}.', { naam: b.visitor_name, dagdeel: dagdeel(b.visited_at, tz) }))
  }

  // Activiteiten van het woonzorgcentrum waar het team "aanwezig" aanduidde.
  // Alleen dat: niet waar ze niet bij was, en geen notities van het team.
  const bij = aanwezigBij(input.huis ?? []).filter(
    (m) => localDateKey(new Date(m.begint), tz) === vandaag && new Date(m.begint) <= nu && zonderMedicatie(m.titel, medNamen),
  )
  if (bij.length > 0) {
    const titels = bij.slice(0, 3).map((m) => kleinBegin(m.titel))
    zinnen.push(tt('{naam} was vandaag bij {lijst}.', { naam, lijst: lijstje(titels) }))
  }

  // Uitstap: met wie, en of ze al terug is. De notitie is vrije tekst en komt er niet in.
  for (const u of (input.uitstappen ?? []).filter(
    (u) => (u.status === 'weg' || u.status === 'terug') && localDateKey(new Date(u.vertrokken_at ?? u.vertrek), tz) === vandaag,
  ).slice(0, 2)) {
    zinnen.push(
      u.status === 'terug'
        ? tt('{naam} was op uitstap met {wie}.', { naam, wie: u.met_wie })
        : tt('{naam} is op uitstap met {wie}.', { naam, wie: u.met_wie }),
    )
  }

  // Medicatie: alleen of het bevestigd is. Wat ze neemt, staat er niet.
  const verlopen = summary.meds.filter((m) => new Date(m.due_at) <= nu)
  if (verlopen.length > 0) {
    const open = verlopen.filter((m) => !m.taken_at)
    if (open.length === 0) zinnen.push(tt('Alle medicatie tot nu toe is bevestigd.'))
    else
      zinnen.push(
        tt('De medicatie van {uren} is nog niet bevestigd.', {
          uren: lijstje([...new Set(open.map((m) => hhmm(new Date(m.due_at), tz)))]),
        }),
      )
  }

  // Wat familie of zorgverleners zelf in het logboek schreven. Vrije tekst
  // kan alles bevatten (ook een medicijn); daarom apart en nooit doorgestuurd.
  const logboek = summary.log
    .filter(
      (l) =>
        (l.source === 'family' || l.source === 'caregiver') &&
        !AUTOMATISCH.test(l.title) &&
        zonderMedicatie(`${l.title} ${l.note ?? ''}`, medNamen),
    )
    .slice(0, 3)
    .map((l) => `${l.title.replace(/\.$/, '')}${l.note ? ` — ${l.note.replace(/\.$/, '')}` : ''}.`)
  for (const b of bezoekVandaag.slice(0, 3))
    if (b.note?.trim() && zonderMedicatie(b.note, medNamen)) logboek.push(`${b.visitor_name}: ${b.note.replace(/\.$/, '')}.`)

  // Wat er nog komt.
  const straks = gepland.find((e) => !e.done_at && new Date(e.starts_at) > nu)
  if (straks)
    zinnen.push(
      tt('Nog op de planning: {wat} om {uur}.', { wat: kleinBegin(straks.title), uur: hhmm(new Date(straks.starts_at), tz) }),
    )

  if (zinnen.length === 0) zinnen.push(tt('Over vandaag staat er nog niets in de app.'))
  return { zinnen, logboek }
}
