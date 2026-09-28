/**
 * Interpretatie zonder AI.
 *
 * Twee taken:
 *  1. Terugvaloptie als de AI-dienst niet bereikbaar is. De app moet ook
 *     zonder AI bruikbaar blijven; wat hier niet zeker herkend wordt, gaat
 *     als 'unknown' door en dan zegt LifeAngle eerlijk dat het niet lukt.
 *  2. Korte antwoorden op een vraag van LifeAngle ("vrijdag", "tien uur",
 *     "ja", "nee") zonder een model aan te roepen: sneller, gratis, en er
 *     gaat niets de deur uit.
 *
 * De uitkomst gaat daarna door dezelfde valideer() als die van de AI.
 */

import type { Taal } from '../../lib/i18n'
import { normaal, vindDatum, vindTijd } from './datumTijd'
import type { IntentNaam, ParamNaam, Params } from './intents'

interface Patronen {
  ja: RegExp
  nee: RegExp
  aanpassen: RegExp
  dagboek: RegExp
  boodschappen: RegExp
  herinnering: RegExp
  agenda: RegExp
  vandaag: RegExp
  komende: RegExp
  bericht: RegExp
  medicatie: RegExp
  vraag: RegExp
  /** Woorden die geen titel zijn: "ik moet", "naar de", "in mijn agenda". */
  vulsel: RegExp[]
}

const NL: Patronen = {
  ja: /^(ja+|jawel|jazeker|ok|oke|oké|okee|goed|prima|klopt|dat klopt|juist|doe maar|zeker|graag|in orde|akkoord|perfect)\b/,
  nee: /^(nee+|neen|niet|nee dank je|laat maar|laat maar zitten|stop|annuleer|annuleren|toch niet|vergeet het|niets)\b/,
  aanpassen: /\b(pas aan|pas het aan|aanpassen|wijzig|wijzigen|verander|veranderen|anders|corrigeer)\b/,
  dagboek: /\b(iets vertellen|wil (je )?iets vertellen|dagboek|mag ik (je )?iets vertellen|ik wil vertellen)\b/,
  boodschappen: /\b(kopen|boodschappen|boodschappenlijst|winkellijst|op de lijst|halen in de winkel)\b/,
  herinnering: /\b(herinner|herinnering|herinneren|denk eraan|laat me weten|wijs me erop)\b/,
  agenda: /\b(agenda|afspraak|plan|plannen|inplannen|moet ik|heb ik|ik heb|naar de|naar het|komt|komen|op bezoek)\b/,
  vandaag: /\b(wat (moet|staat|doe|is er)( ik)? vandaag|wat staat er vandaag|mijn dag|planning (van|voor) vandaag|wat moet ik nu doen|wat nu)\b/,
  komende: /\b(wat staat er (morgen|deze week|nog)|volgende afspraak|komende (dagen|week|afspraken)|wat heb ik (morgen|deze week))\b/,
  bericht: /\b(stuur (een )?(bericht|berichtje)|zeg (tegen|aan)|laat (\p{L}+) weten|bericht (naar|voor|aan))\b/u,
  medicatie: /\b(ik heb|heb) (mijn|de) (medicatie|medicijnen|pillen|pil|tabletten) (genomen|ingenomen|op)\b/,
  vraag: /^(wie|wat|waar|wanneer|hoe|hoeveel|welke|is|zijn|heb|kan|mag|moet)\b|\?$/,
  vulsel: [
    /\b(wil|kun|kan) je\b/g,
    /\b(ik moet|ik heb|moet ik|heb ik|ik ga|ga ik)\b/g,
    /\b(in|op|aan) (mijn|de) (agenda|kalender|planning)( zetten| toevoegen| plaatsen)?\b/g,
    /\b(zet|zetten|plan|plannen|inplannen|toevoegen|noteer|noteren)\b/g,
    /\b(een afspraak (bij|met) (de|het)?)\b/g,
    /\b(afspraak (bij|met) (de|het)?)\b/g,
    /\b(naar (de|het)|bij (de|het)|met (de|het))\b/g,
    /\b(om|rond|tegen|omstreeks|op)\b/g,
    /\b(vandaag|morgenvroeg|morgen|overmorgen|vanavond|vanmiddag|vannamiddag|deze namiddag|deze avond|vanochtend|volgende week|volgende)\b/g,
    /\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/g,
    /\b(\d{1,2}[:.h]\d{2}|\d{1,2}\s?u(ur)?(\s?\d{2})?)\b/g,
    /\b(half|kwart over|kwart voor)\s+\p{L}+\b/gu,
    /\b(een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien|elf|twaalf)\s+uur\b/g,
    /\buur\b/g,
    /\b(alsjeblieft|alstublieft|aub|graag|even|nog|eens)\b/g,
  ],
}

const PATRONEN: Partial<Record<Taal, Patronen>> = { nl: NL }

function patronen(taal: Taal): Patronen | null {
  return PATRONEN[taal] ?? null
}

export function isJa(tekst: string, taal: Taal = 'nl'): boolean {
  const p = patronen(taal)
  return !!p && p.ja.test(normaal(tekst))
}

export function isNee(tekst: string, taal: Taal = 'nl'): boolean {
  const p = patronen(taal)
  return !!p && p.nee.test(normaal(tekst)) && !p.aanpassen.test(normaal(tekst))
}

export function isAanpassen(tekst: string, taal: Taal = 'nl'): boolean {
  const p = patronen(taal)
  return !!p && p.aanpassen.test(normaal(tekst))
}

function hoofdletter(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** "ik moet morgen om 10 uur naar de tandarts" → "Tandarts". */
export function titelUit(tekst: string, taal: Taal = 'nl'): string | null {
  const p = patronen(taal)
  if (!p) return null
  let s = ' ' + normaal(tekst) + ' '
  for (const re of p.vulsel) s = s.replace(re, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s ? hoofdletter(s) : null
}

/** "melk, brood, kaas en appels" → ['melk', 'brood', 'kaas', 'appels']. */
export function splitsProducten(tekst: string): string[] {
  // Komma's blijven hier staan: ze scheiden de producten.
  let s = tekst.toLowerCase().replace(/[.!?;]+(\s|$)/g, ' ').replace(/\s+/g, ' ').trim()
  s = s
    .replace(/^(ik (moet|wil)( nog)?|we (moeten|hebben)( nog)?|zet|voeg|schrijf)\s+/, '')
    .replace(/\b(nog|ook|even|graag|alsjeblieft)\b/g, ' ')
    .replace(/\b(kopen|halen|toe|toevoegen|nodig|zetten|opschrijven)\b/g, ' ')
    .replace(/\b(op|aan) (de|mijn) (boodschappenlijst|boodschappen|lijst|winkellijst)\b/g, ' ')
    .replace(/\b(boodschappenlijst|boodschappen)\b/g, ' ')
    .replace(/\b(ik heb|we hebben)\b/g, ' ')
  return s
    .split(/,|\ben\b|&|\+/)
    .map((x) => x.replace(/^\s*(een|wat|de|het)\s+/, '').replace(/\s+/g, ' ').trim())
    .filter((x) => x.length > 1 && x.length <= 80)
}

/** De naam na "bel" of voor "bellen": "Bel Els", "kun je Jan bellen". */
function contactUit(t: string): string | null {
  const m =
    t.match(/^bel\s+(\p{L}+)/u) ??
    t.match(/\b(?:je|jij|u)\s+(\p{L}+)\s+(?:even\s+)?bellen\b/u) ??
    t.match(/\b(\p{L}+)\s+bellen\b/u)
  if (!m) return null
  const naam = m[1]
  if (['mij', 'me', 'iemand', 'even', 'je', 'eens'].includes(naam)) return null
  return hoofdletter(naam)
}

export interface LokaleUitkomst {
  intent: IntentNaam
  confidence: number
  parameters: Params
  missing_parameters: ParamNaam[]
  needs_confirmation: boolean
}

/**
 * Herkent de gewone opdrachten. Twijfel = 'unknown', met lage zekerheid.
 */
export function lokaleInterpretatie(
  invoer: string,
  nu: Date,
  tz: string,
  taal: Taal = 'nl',
): LokaleUitkomst {
  const p = patronen(taal)
  const t = normaal(invoer)
  const onbekend: LokaleUitkomst = {
    intent: 'unknown',
    confidence: 0.2,
    parameters: {},
    missing_parameters: [],
    needs_confirmation: false,
  }
  if (!p || !t) return onbekend

  const uit = (intent: IntentNaam, parameters: Params, confidence = 0.8): LokaleUitkomst => ({
    intent,
    confidence,
    parameters,
    missing_parameters: [],
    needs_confirmation: false,
  })

  if (p.dagboek.test(t)) return uit('record_voice_diary', {})
  if (p.medicatie.test(t)) return uit('mark_medication_taken', {})

  if (p.herinnering.test(t)) {
    const { datum } = vindDatum(t, nu, tz, taal)
    const tijd = vindTijd(t, taal)
    // "herinner mij (morgen om zes uur) aan mijn medicatie"
    const aan = t.match(/\baan\s+(.+)$/)
    let wat = aan ? aan[1] : t.replace(p.herinnering, ' ')
    wat = titelUit(wat, taal) ?? ''
    wat = wat.replace(/^(mij|me)\s+/i, '').trim()
    return uit('create_reminder', {
      text: wat ? hoofdletter(wat) : undefined,
      date: datum ?? undefined,
      time: tijd ?? undefined,
    })
  }

  if (p.boodschappen.test(t)) {
    const items = splitsProducten(invoer)
    return uit('add_shopping_item', { items }, items.length ? 0.85 : 0.6)
  }

  if (p.bericht.test(t)) {
    const naar = t.match(/\b(?:naar|aan|tegen|voor)\s+(\p{L}+)/u) ?? t.match(/\blaat (\p{L}+) weten\b/u)
    const inhoud = t.match(/\b(?:dat|:)\s+(.+)$/)
    return uit(
      'send_family_message',
      {
        contact: naar ? hoofdletter(naar[1]) : undefined,
        message: inhoud ? hoofdletter(inhoud[1]) : undefined,
      },
      0.75,
    )
  }

  if (/\bbel(len)?\b/.test(t)) {
    const naam = contactUit(t)
    if (naam) return uit('call_contact', { contact: naam }, 0.8)
  }

  if (p.vandaag.test(t)) return uit('get_today_schedule', {})
  if (p.komende.test(t)) return uit('get_upcoming_events', {})

  const datum = vindDatum(t, nu, tz, taal)
  const tijd = vindTijd(t, taal)
  const isVraag = p.vraag.test(t) && !/^(moet|heb) ik\b/.test(t)
  if (!isVraag && (datum.genoemd || tijd) && p.agenda.test(t)) {
    return uit('create_calendar_event', {
      title: titelUit(t, taal) ?? undefined,
      date: datum.datum ?? undefined,
      time: tijd ?? undefined,
    })
  }

  if (isVraag) return uit('general_question', { text: invoer.trim() }, 0.6)
  return onbekend
}

/**
 * Een kort antwoord op "Welke dag bedoel je?" of "Hoe laat?" invullen.
 * Geeft null als het antwoord niet over dat veld gaat.
 */
export function vulVeld(
  veld: ParamNaam,
  antwoord: string,
  nu: Date,
  tz: string,
  taal: Taal = 'nl',
): Partial<Params> | null {
  const t = normaal(antwoord)
  if (!t) return null
  switch (veld) {
    case 'date': {
      const d = vindDatum(t, nu, tz, taal).datum
      const tijd = vindTijd(t, taal)
      if (!d) return null
      return tijd ? { date: d, time: tijd } : { date: d }
    }
    case 'time': {
      // Een los getal is hier een uur: "tien" of "10".
      const tijd = vindTijd(t, taal) ?? vindTijd(`om ${t}`, taal)
      return tijd ? { time: tijd } : null
    }
    case 'items': {
      const items = splitsProducten(antwoord)
      return items.length ? { items } : null
    }
    case 'title':
      return { title: titelUit(antwoord, taal) ?? hoofdletter(antwoord.trim()) }
    case 'text':
    case 'message':
      return { [veld]: hoofdletter(antwoord.trim()) }
    case 'contact':
      return { contact: hoofdletter(t.split(' ').pop() ?? t) }
  }
}

/**
 * Een correctie na "pas aan": "om drie uur", "nee, vrijdag", "maak er
 * elf uur van". Alleen datum en uur; de rest gaat naar de AI.
 */
export function corrigeer(tekst: string, nu: Date, tz: string, taal: Taal = 'nl'): Partial<Params> | null {
  const t = normaal(tekst)
  const { datum } = vindDatum(t, nu, tz, taal)
  const tijd = vindTijd(t, taal)
  const uit: Partial<Params> = {}
  if (datum) uit.date = datum
  if (tijd) uit.time = tijd
  return Object.keys(uit).length ? uit : null
}
