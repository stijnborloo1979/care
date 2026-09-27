/**
 * AIIntentService — bepaalt WAT de gebruiker bedoelt. Niets meer.
 *
 * De provider is verwisselbaar. De app praat nooit rechtstreeks met een
 * AI-leverancier: de standaardprovider roept de edge function
 * `voice-intent` aan (de "LifeAngle Voice API"), en die kiest aan de
 * serverkant welk model het wordt. Sleutels staan dus nooit in de
 * frontend. Een latere LifeAngle Companion roept dezelfde functie aan.
 *
 * Wat een provider teruggeeft is onbetrouwbaar tot valideer() het
 * goedkeurt.
 */

import { supabase } from '../../lib/supabase'
import { hhmm, localDateKey } from '../../lib/time'
import type { Taal } from '../../lib/i18n'
import type { IntentNaam, ParamNaam, Params } from './intents'
import { lokaleInterpretatie } from './lokaleRegels'
import { valideer, type Gevalideerd } from './valideer'

export interface LopendGesprek {
  intent: IntentNaam
  parameters: Params
  /** Het veld waar LifeAngle net naar vroeg. */
  vraagt?: ParamNaam
  modus: 'aanvullen' | 'aanpassen'
}

export interface IntentVerzoek {
  tekst: string
  householdId: string
  taal: Taal
  tz: string
  nu: Date
  lopend?: LopendGesprek
}

export interface IntentProvider {
  readonly naam: string
  /** Ruwe, nog niet gevalideerde uitkomst. Gooit bij een netwerk- of dienstfout. */
  interpreteer(v: IntentVerzoek): Promise<unknown>
}

export type IntentFoutSoort = 'onbereikbaar' | 'ongeldig'

export class IntentFout extends Error {
  constructor(public soort: IntentFoutSoort, bericht?: string) {
    super(bericht ?? soort)
  }
}

/** Alleen wat nodig is om de zin te begrijpen: de zin en de klok. */
export function context(v: IntentVerzoek) {
  return {
    datum: localDateKey(v.nu, v.tz),
    tijd: hhmm(v.nu, v.tz),
    weekdag: new Intl.DateTimeFormat('nl-BE', { timeZone: v.tz, weekday: 'long' }).format(v.nu),
    tijdzone: v.tz,
  }
}

const TIMEOUT_MS = 9000

function metTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = window.setTimeout(() => reject(new IntentFout('onbereikbaar', 'timeout')), ms)
    p.then(
      (x) => {
        window.clearTimeout(id)
        resolve(x)
      },
      (e) => {
        window.clearTimeout(id)
        reject(e)
      },
    )
  })
}

/** De LifeAngle Voice API: edge function `voice-intent`. */
export class EdgeFunctionProvider implements IntentProvider {
  readonly naam = 'voice-intent'

  async interpreteer(v: IntentVerzoek): Promise<unknown> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new IntentFout('onbereikbaar', 'offline')
    }
    const { data, error } = await metTimeout(
      supabase.functions.invoke('voice-intent', {
        body: {
          household_id: v.householdId,
          tekst: v.tekst.slice(0, 500),
          taal: v.taal,
          context: context(v),
          lopend: v.lopend ?? null,
        },
      }),
      TIMEOUT_MS,
    )
    if (error) throw new IntentFout('onbereikbaar', error.message)
    if (!data?.ok) throw new IntentFout(data?.fout === 'ongeldig' ? 'ongeldig' : 'onbereikbaar')
    return data.resultaat
  }
}

/** Regels in de app zelf. Werkt offline; herkent de gewone opdrachten. */
export class LokaleProvider implements IntentProvider {
  readonly naam = 'lokaal'

  async interpreteer(v: IntentVerzoek): Promise<unknown> {
    return lokaleInterpretatie(v.tekst, v.nu, v.tz, v.taal)
  }
}

export interface Interpretatie {
  resultaat: Gevalideerd
  bron: string
}

export class AIIntentService {
  constructor(
    private primair: IntentProvider,
    private terugval: IntentProvider | null = new LokaleProvider(),
  ) {}

  async interpreteer(v: IntentVerzoek): Promise<Interpretatie> {
    let fout: IntentFout | null = null
    try {
      const ruw = await this.primair.interpreteer(v)
      const r = valideer(ruw, v.nu, v.tz)
      if (r) return { resultaat: r, bron: this.primair.naam }
      fout = new IntentFout('ongeldig')
    } catch (e) {
      fout = e instanceof IntentFout ? e : new IntentFout('onbereikbaar', String(e))
    }

    // De terugval telt alleen als hij iets zeker herkent. Een 'unknown' van
    // de regels zou "ik begrijp je niet" zeggen, terwijl het eigenlijke
    // probleem is dat de dienst niet bereikbaar was.
    if (this.terugval && !v.lopend) {
      try {
        const r = valideer(await this.terugval.interpreteer(v), v.nu, v.tz)
        if (r && r.intent !== 'unknown') return { resultaat: r, bron: this.terugval.naam }
      } catch {
        // valt door naar de oorspronkelijke fout
      }
    }
    throw fout
  }
}

/** De standaardopstelling van de app. */
export function maakIntentService(): AIIntentService {
  return new AIIntentService(new EdgeFunctionProvider(), new LokaleProvider())
}
