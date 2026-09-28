/**
 * LifeAngle Voice — wat de assistent kan.
 *
 * Eén register voor alle intents. Een nieuwe intent toevoegen is: hier een
 * regel bijschrijven, een uitvoerder in actionEngine.ts, en de naam in de
 * lijst van de edge function `voice-intent`. De rest (validatie, vragen
 * naar wat ontbreekt, bevestigen) volgt vanzelf uit dit register.
 */

export const INTENT_NAMEN = [
  'create_calendar_event',
  'create_reminder',
  'add_shopping_item',
  'add_diary_entry',
  'record_voice_diary',
  'get_today_schedule',
  'get_upcoming_events',
  'send_family_message',
  'call_contact',
  'mark_medication_taken',
  'general_question',
  'unknown',
] as const

export type IntentNaam = (typeof INTENT_NAMEN)[number]

export const PARAM_NAMEN = [
  'title',
  'date',
  'time',
  'text',
  'items',
  'contact',
  'message',
] as const

export type ParamNaam = (typeof PARAM_NAMEN)[number]

export interface Params {
  title?: string
  /** YYYY-MM-DD, in de tijdzone van het huishouden. */
  date?: string
  /** HH:MM, 24 uur. */
  time?: string
  text?: string
  items?: string[]
  contact?: string
  message?: string
}

/** Wat de interpretatielaag (AI of lokale regels) teruggeeft, na validatie. */
export interface IntentResultaat {
  intent: IntentNaam
  confidence: number
  parameters: Params
  missing_parameters: ParamNaam[]
  needs_confirmation: boolean
}

/**
 * - 'altijd': eerst "Klopt dat?" met JA / NEE / AANPASSEN.
 * - 'nooit':  meteen uitvoeren en zeggen wat er gebeurde. Alleen voor
 *             acties die niets overschrijven en makkelijk ongedaan te
 *             maken zijn.
 */
export type Bevestiging = 'altijd' | 'nooit'

export interface IntentConfig {
  /** 'actie' schrijft iets weg; 'vraag' leest alleen. */
  soort: 'actie' | 'vraag'
  /** In deze volgorde gevraagd als ze ontbreken. */
  verplicht: ParamNaam[]
  bevestiging: Bevestiging
}

export const INTENTS: Record<IntentNaam, IntentConfig> = {
  create_calendar_event: { soort: 'actie', verplicht: ['title', 'date', 'time'], bevestiging: 'altijd' },
  create_reminder: { soort: 'actie', verplicht: ['text', 'date', 'time'], bevestiging: 'altijd' },
  // Boodschappen: bevestigen zou elke keer een extra stap zijn voor iets
  // wat je met één tik weer van de lijst haalt.
  add_shopping_item: { soort: 'actie', verplicht: ['items'], bevestiging: 'nooit' },
  add_diary_entry: { soort: 'actie', verplicht: ['text'], bevestiging: 'nooit' },
  // Zonder tekst: de app neemt op. De opname zelf is de bevestiging.
  record_voice_diary: { soort: 'actie', verplicht: [], bevestiging: 'nooit' },
  get_today_schedule: { soort: 'vraag', verplicht: [], bevestiging: 'nooit' },
  get_upcoming_events: { soort: 'vraag', verplicht: [], bevestiging: 'nooit' },
  send_family_message: { soort: 'actie', verplicht: ['message'], bevestiging: 'altijd' },
  call_contact: { soort: 'actie', verplicht: ['contact'], bevestiging: 'altijd' },
  mark_medication_taken: { soort: 'actie', verplicht: [], bevestiging: 'altijd' },
  general_question: { soort: 'vraag', verplicht: [], bevestiging: 'nooit' },
  unknown: { soort: 'vraag', verplicht: [], bevestiging: 'nooit' },
}

/** Onder deze zekerheid vragen we altijd eerst of het klopt. */
export const DREMPEL_BEVESTIGEN = 0.7
/** Onder deze zekerheid doen we alsof we het niet begrepen: niet gokken. */
export const DREMPEL_ONBEKEND = 0.4

export function isIntent(x: unknown): x is IntentNaam {
  return typeof x === 'string' && (INTENT_NAMEN as readonly string[]).includes(x)
}

export function isParam(x: unknown): x is ParamNaam {
  return typeof x === 'string' && (PARAM_NAMEN as readonly string[]).includes(x)
}
