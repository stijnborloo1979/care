/**
 * De poort tussen interpretatie en actie.
 *
 * Alles wat van een taalmodel komt — of van de lokale regels — gaat hier
 * door voor er iets gebeurt. Wat niet klopt, wordt weggegooid of wordt een
 * vraag aan de gebruiker; nooit een actie. De ActionEngine aanvaardt
 * alleen een Gevalideerd object, en dat maakt alleen deze functie.
 */

import { localDateKey } from '../../lib/time'
import {
  DREMPEL_BEVESTIGEN,
  DREMPEL_ONBEKEND,
  INTENTS,
  isIntent,
  isParam,
  type IntentResultaat,
  type ParamNaam,
  type Params,
} from './intents'

export type Probleem = 'datum_verleden' | 'tijd_verleden' | 'datum_ongeldig' | 'tijd_ongeldig'

export interface Gevalideerd extends IntentResultaat {
  /** Wat er mis was met de datum of het uur; bepaalt de vraag die volgt. */
  problemen: Probleem[]
  /** Merkteken: alleen valideer() zet dit. */
  readonly __gevalideerd: true
}

const MAX_TEKST = 300

function tekst(x: unknown, max = MAX_TEKST): string | undefined {
  if (typeof x !== 'string') return undefined
  const s = x.replace(/\s+/g, ' ').trim()
  if (!s) return undefined
  return s.slice(0, max)
}

function echteDatum(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [j, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(j, m - 1, d))
  return dt.getUTCFullYear() === j && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function echteTijd(s: string): boolean {
  const m = s.match(/^(\d{2}):(\d{2})$/)
  return !!m && Number(m[1]) <= 23 && Number(m[2]) <= 59
}

/** Zet willekeurige invoer om in schone parameters. Onbekende velden verdwijnen. */
export function schoneParams(ruw: unknown): { params: Params; problemen: Probleem[] } {
  const p: Params = {}
  const problemen: Probleem[] = []
  const r = (ruw && typeof ruw === 'object' ? ruw : {}) as Record<string, unknown>

  const title = tekst(r.title, 120)
  if (title) p.title = title
  const text = tekst(r.text)
  if (text) p.text = text
  const contact = tekst(r.contact, 60)
  if (contact) p.contact = contact
  const message = tekst(r.message, 500)
  if (message) p.message = message

  const date = tekst(r.date, 10)
  if (date) {
    if (echteDatum(date)) p.date = date
    else problemen.push('datum_ongeldig')
  }
  const time = tekst(r.time, 5)
  if (time) {
    // "9:30" mag, en wordt "09:30".
    const t = time.length === 4 ? `0${time}` : time
    if (echteTijd(t)) p.time = t
    else problemen.push('tijd_ongeldig')
  }

  if (Array.isArray(r.items)) {
    const items = r.items
      .map((i) => tekst(i, 80))
      .filter((i): i is string => !!i)
      .slice(0, 20)
    // Dubbels eruit, hoofdletters maken geen verschil.
    const uniek = items.filter(
      (i, idx) => items.findIndex((j) => j.toLowerCase() === i.toLowerCase()) === idx,
    )
    if (uniek.length) p.items = uniek
  }

  return { params: p, problemen }
}

/**
 * @param ruw  wat de interpretatielaag teruggaf, niet te vertrouwen
 * @param nu   de klok, meegegeven voor tests
 * @param tz   de tijdzone van het huishouden
 */
export function valideer(ruw: unknown, nu: Date, tz: string): Gevalideerd | null {
  if (!ruw || typeof ruw !== 'object') return null
  const r = ruw as Record<string, unknown>
  if (!isIntent(r.intent)) return null

  let confidence = typeof r.confidence === 'number' && isFinite(r.confidence) ? r.confidence : 0
  confidence = Math.max(0, Math.min(1, confidence))

  let intent = r.intent
  if (confidence < DREMPEL_ONBEKEND) intent = 'unknown'

  const { params, problemen } = schoneParams(r.parameters)
  const config = INTENTS[intent]

  // Niets in het verleden plannen. De datum of het uur valt dan weg, en
  // wordt opnieuw gevraagd.
  if (intent === 'create_calendar_event' || intent === 'create_reminder') {
    const vandaag = localDateKey(nu, tz)
    if (params.date && params.date < vandaag) {
      delete params.date
      problemen.push('datum_verleden')
    }
    if (params.date && params.date === vandaag && params.time) {
      const nuHHMM = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(nu)
      if (params.time < nuHHMM) {
        delete params.time
        problemen.push('tijd_verleden')
      }
    }
    // Twee jaar vooruit is bijna zeker een verkeerd verstaan jaartal.
    if (params.date && Number(params.date.slice(0, 4)) > Number(vandaag.slice(0, 4)) + 2) {
      delete params.date
      problemen.push('datum_ongeldig')
    }
  }

  // Wat ontbreekt, bepalen wij, niet het model. Het model mag er wel iets
  // aan toevoegen (bv. "tandarts" zonder uur), maar nooit iets wegnemen.
  const zelf: ParamNaam[] = config.verplicht.filter((v) => {
    const w = params[v]
    return w === undefined || (Array.isArray(w) && w.length === 0)
  })
  const vanModel: ParamNaam[] = Array.isArray(r.missing_parameters)
    ? r.missing_parameters.filter(isParam).filter((v) => config.verplicht.includes(v) && params[v] === undefined)
    : []
  const missing = [...new Set([...zelf, ...vanModel])].sort(
    (a, b) => config.verplicht.indexOf(a) - config.verplicht.indexOf(b),
  )

  // Het model kan bevestigen verplichten, maar niet afschaffen.
  const needs_confirmation =
    config.soort === 'actie' &&
    (config.bevestiging === 'altijd' || r.needs_confirmation === true || confidence < DREMPEL_BEVESTIGEN)

  return {
    intent,
    confidence,
    parameters: params,
    missing_parameters: missing,
    needs_confirmation,
    problemen,
    __gevalideerd: true,
  }
}

/**
 * Parameters opnieuw door de poort sturen, bijvoorbeeld na een aanvulling
 * of een correctie. De intent blijft dezelfde; de zekerheid ook.
 */
export function hervalideer(
  vorig: Pick<Gevalideerd, 'intent' | 'confidence' | 'needs_confirmation'>,
  params: Params,
  nu: Date,
  tz: string,
): Gevalideerd {
  const v = valideer(
    {
      intent: vorig.intent,
      confidence: Math.max(vorig.confidence, DREMPEL_ONBEKEND),
      parameters: params,
      missing_parameters: [],
      needs_confirmation: vorig.needs_confirmation,
    },
    nu,
    tz,
  )
  // valideer geeft alleen null bij een onbekende intent, en die komt hier
  // uit een eerder gevalideerd object.
  return v!
}
