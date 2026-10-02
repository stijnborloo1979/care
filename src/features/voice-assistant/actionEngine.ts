/**
 * LifeAngle Action Engine.
 *
 * De enige plek waar een spraakopdracht iets verandert. Per intent één
 * uitvoerder, en elke uitvoerder gebruikt een bestaande, begrensde dienst
 * (RPC of service) — nooit een vrije query. Wat niet in het register
 * staat, kan niet uitgevoerd worden, wat een model ook terugstuurt.
 *
 * Regels:
 *  - Alleen een Gevalideerd object zonder ontbrekende velden gaat door.
 *  - Elke actie heeft een actieId. Dezelfde actieId twee keer = één keer
 *    uitvoeren, ook als de knop twee keer ingedrukt wordt.
 *  - Mislukt de dienst, dan zegt de uitkomst dat het mislukt is. Nooit
 *    "gelukt" zeggen als het niet gelukt is.
 */

import { zonedToUtc } from '../../lib/time'
import { t } from '../../lib/i18n'
import type { IntentNaam } from './intents'
import { INTENTS } from './intents'
import type { Gevalideerd } from './valideer'
import { herinneringGedaan, opsomming } from './zinnen'
import { normaal } from './datumTijd'

export interface Diensten {
  voegAfspraakToe(p: {
    householdId: string
    startsAt: Date
    titel: string
    soort: 'appt' | 'reminder'
    emoji: string
    notitie: string | null
    actieId: string
  }): Promise<void>
  /** Geeft het aantal producten dat echt nieuw op de lijst kwam. */
  voegBoodschappenToe(p: { householdId: string; namen: string[]; actieId: string }): Promise<number>
  bewaarDagboek(p: {
    householdId: string
    titel: string
    tekst?: string
    audio?: { blob: Blob; mimeType: string; seconden: number }
    delen: boolean
  }): Promise<string | void>
  stuurBericht(p: { householdId: string; tekst: string }): Promise<void>
  bevestigMedicatie(ids: string[]): Promise<void>
}

export interface ActieContext {
  householdId: string
  tz: string
  nu: Date
  /** Mensen die de persoon kan bellen. */
  mensen: { naam: string; telefoon: string | null }[]
  /** Medicatiemomenten van vandaag. */
  medicatie: { id: string; due_at: string; taken_at: string | null }[]
  /** Mag dit toestel bellen? (zie magBellen in useDisplayPrefs) */
  magBellen: boolean
  /** Gaat een dagboekfragment standaard naar familie? */
  dagboekDelen: boolean
  /** Enkel voor record_voice_diary. */
  audio?: { blob: Blob; mimeType: string; seconden: number; transcript?: string }
}

export type Uitkomst =
  | {
      gelukt: true
      zeg: string
      bellen?: { naam: string; nummer: string }
      ververs?: string[]
      /** Het bewaarde dagboekfragment, zodat de bewoner het privé kan zetten. */
      dagboekId?: string
    }
  | { gelukt: false; zeg: string }

type Uitvoerder = (v: Gevalideerd, ctx: ActieContext, actieId: string) => Promise<Uitkomst>

/** Open medicatie: niet genomen, en ten laatste binnen het uur. */
export function openMedicatie(ctx: Pick<ActieContext, 'medicatie' | 'nu'>) {
  const grens = ctx.nu.getTime() + 60 * 60_000
  return ctx.medicatie.filter((m) => !m.taken_at && new Date(m.due_at).getTime() <= grens)
}

/** "els" vindt "Els", "Els Janssens" en "Els (dochter)". */
export function vindPersoon(naam: string, mensen: ActieContext['mensen']) {
  const n = normaal(naam)
  if (!n) return null
  return (
    mensen.find((m) => normaal(m.naam) === n) ??
    mensen.find((m) => normaal(m.naam).split(' ')[0] === n.split(' ')[0]) ??
    mensen.find((m) => normaal(m.naam).includes(n)) ??
    null
  )
}

/** Een korte titel voor het dagboek: de eerste woorden van wat verteld werd. */
export function dagboekTitel(tekst: string | undefined, datum: Date, locale = 'nl-BE'): string {
  const woorden = (tekst ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (woorden.length >= 3) {
    const kort = woorden.slice(0, 7).join(' ').replace(/[.,;:!?]+$/, '')
    return kort.charAt(0).toUpperCase() + kort.slice(1) + (woorden.length > 7 ? '…' : '')
  }
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(datum)
}

export function maakUitvoerders(d: Diensten): Partial<Record<IntentNaam, Uitvoerder>> {
  return {
    async create_calendar_event(v, ctx, actieId) {
      const p = v.parameters
      await d.voegAfspraakToe({
        householdId: ctx.householdId,
        startsAt: zonedToUtc(p.date!, p.time!, ctx.tz),
        titel: p.title!,
        soort: 'appt',
        emoji: '📅',
        notitie: null,
        actieId,
      })
      return { gelukt: true, zeg: t('voice.gedaan.afspraak'), ververs: ['agenda', 'week', 'summary'] }
    },

    async create_reminder(v, ctx, actieId) {
      const p = v.parameters
      await d.voegAfspraakToe({
        householdId: ctx.householdId,
        startsAt: zonedToUtc(p.date!, p.time!, ctx.tz),
        titel: p.text!,
        soort: 'reminder',
        emoji: '🔔',
        notitie: null,
        actieId,
      })
      return { gelukt: true, zeg: herinneringGedaan(p, ctx.nu, ctx.tz), ververs: ['agenda', 'week', 'summary'] }
    },

    async add_shopping_item(v, ctx, actieId) {
      const namen = v.parameters.items!
      const nieuw = await d.voegBoodschappenToe({ householdId: ctx.householdId, namen, actieId })
      const lijst = opsomming(namen)
      return {
        gelukt: true,
        zeg: nieuw === 0 ? t('voice.gedaan.boodschappenAl', { lijst }) : t('voice.gedaan.boodschappen', { lijst }),
        ververs: ['shopping'],
      }
    },

    async add_diary_entry(v, ctx) {
      const tekst = v.parameters.text!
      const id = await d.bewaarDagboek({
        householdId: ctx.householdId,
        titel: dagboekTitel(tekst, ctx.nu),
        tekst,
        delen: ctx.dagboekDelen,
      })
      return { gelukt: true, zeg: t('voice.gedaan.dagboek'), ververs: ['stories'], dagboekId: id || undefined }
    },

    async record_voice_diary(_v, ctx) {
      if (!ctx.audio) return { gelukt: false, zeg: t('voice.actieMislukt') }
      const tekst = ctx.audio.transcript?.trim() || undefined
      const id = await d.bewaarDagboek({
        householdId: ctx.householdId,
        titel: dagboekTitel(tekst, ctx.nu),
        tekst,
        audio: ctx.audio,
        delen: ctx.dagboekDelen,
      })
      return { gelukt: true, zeg: t('voice.gedaan.dagboek'), ververs: ['stories'], dagboekId: id || undefined }
    },

    async send_family_message(v, ctx) {
      await d.stuurBericht({ householdId: ctx.householdId, tekst: v.parameters.message! })
      return { gelukt: true, zeg: t('voice.gedaan.bericht') }
    },

    async call_contact(v, ctx) {
      const wie = vindPersoon(v.parameters.contact!, ctx.mensen)
      if (!wie) return { gelukt: false, zeg: t('voice.onbekendePersoon', { naam: v.parameters.contact! }) }
      if (!wie.telefoon) return { gelukt: false, zeg: t('voice.geenNummer', { naam: wie.naam }) }
      if (!ctx.magBellen) return { gelukt: false, zeg: t('voice.kanNietBellen') }
      return {
        gelukt: true,
        zeg: t('voice.gedaan.bellen', { naam: wie.naam }),
        bellen: { naam: wie.naam, nummer: wie.telefoon },
      }
    },

    async mark_medication_taken(_v, ctx) {
      const open = openMedicatie(ctx)
      // Niets open: dan ook niets noteren, en dat eerlijk zeggen.
      if (open.length === 0) return { gelukt: true, zeg: t('voice.geenMedicatieOpen') }
      await d.bevestigMedicatie(open.map((m) => m.id))
      return { gelukt: true, zeg: t('voice.gedaan.medicatie'), ververs: ['meds-today', 'summary'] }
    },
  }
}

export class ActionEngine {
  private uitvoerders: Partial<Record<IntentNaam, Uitvoerder>>
  private klaar = new Map<string, Uitkomst>()
  private bezig = new Map<string, Promise<Uitkomst>>()

  constructor(diensten: Diensten) {
    this.uitvoerders = maakUitvoerders(diensten)
  }

  kan(intent: IntentNaam): boolean {
    return INTENTS[intent].soort === 'actie' && !!this.uitvoerders[intent]
  }

  async voerUit(v: Gevalideerd, actieId: string, ctx: ActieContext): Promise<Uitkomst> {
    // Dubbele actie: het resultaat van de eerste keer, zonder opnieuw te schrijven.
    const vorige = this.klaar.get(actieId)
    if (vorige?.gelukt) return vorige
    const lopend = this.bezig.get(actieId)
    if (lopend) return lopend

    if (!v || v.__gevalideerd !== true) return { gelukt: false, zeg: t('voice.nietBegrepen') }
    if (v.missing_parameters.length > 0) return { gelukt: false, zeg: t('voice.nietBegrepen') }
    const uitvoerder = this.uitvoerders[v.intent]
    if (!uitvoerder || INTENTS[v.intent].soort !== 'actie') return { gelukt: false, zeg: t('voice.nietBegrepen') }

    const p = (async (): Promise<Uitkomst> => {
      try {
        return await uitvoerder(v, ctx, actieId)
      } catch {
        return { gelukt: false, zeg: t('voice.actieMislukt') }
      }
    })()
    this.bezig.set(actieId, p)
    const uitkomst = await p
    this.bezig.delete(actieId)
    this.klaar.set(actieId, uitkomst)
    return uitkomst
  }
}
