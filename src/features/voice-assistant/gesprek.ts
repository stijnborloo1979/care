/**
 * Het gesprek: van zin naar actie, met vragen en bevestiging ertussen.
 *
 * Een pure toestandsmachine met meegegeven diensten, zodat elk pad te
 * testen is zonder microfoon, netwerk of database:
 *
 *   rust ──zin──▶ interpretatie ──▶ ontbreekt iets?  ──▶ aanvullen ──┐
 *                                  │                                 │
 *                                  ├─ bevestigen nodig? ──▶ bevestigen ◀┘
 *                                  │                      │ ja  │ nee │ pas aan
 *                                  │                      ▼     ▼     ▼
 *                                  └─ meteen ─────────▶ uitvoeren  rust  aanpassen
 *
 * "Ik wil iets vertellen" gaat naar 'dagboek': de app neemt op, en de
 * opname komt als invoer terug.
 */

import type { Taal } from '../../lib/i18n'
import { t } from '../../lib/i18n'
import type { LopendGesprek } from './aiIntentService'
import { IntentFout } from './aiIntentService'
import type { Uitkomst } from './actionEngine'
import { INTENTS, type ParamNaam, type Params } from './intents'
import { corrigeer, isAanpassen, isJa, isNee, vulVeld } from './lokaleRegels'
import { hervalideer, valideer, type Gevalideerd } from './valideer'
import { bevestigZin, vraagNaar } from './zinnen'

export type Stand =
  | { soort: 'rust' }
  | { soort: 'aanvullen'; v: Gevalideerd; veld: ParamNaam }
  | { soort: 'bevestigen'; v: Gevalideerd; actieId: string }
  | { soort: 'aanpassen'; v: Gevalideerd; actieId: string }
  | { soort: 'dagboek' }

export const RUST: Stand = { soort: 'rust' }

export type Invoer =
  | { soort: 'tekst'; tekst: string }
  | { soort: 'knop'; knop: 'ja' | 'nee' | 'aanpassen' }
  | { soort: 'opname'; blob: Blob; mimeType: string; seconden: number; transcript?: string }
  /** Spraakherkenning gaf niets bruikbaars terug. */
  | { soort: 'nietVerstaan' }

export type Status = 'vraag' | 'bevestig' | 'gelukt' | 'mislukt' | 'info' | 'dagboek' | 'geannuleerd'

export interface Beurt {
  stand: Stand
  zeg: string
  status: Status
  /** Moet de microfoon na het uitspreken meteen weer luisteren? */
  luisterNa: boolean
  /** Extra regels onder de zin (bv. de agenda van vandaag). */
  regels?: string[]
  bellen?: { naam: string; nummer: string }
  link?: { naar: string; label: string }
  ververs?: string[]
  /** Net bewaard dagboekfragment; de bewoner kan het nog privé zetten. */
  dagboekId?: string
  /** Samenvatting van wat LifeAngle gaat doen, voor de bevestigingskaart. */
  samenvatting?: { intent: Gevalideerd['intent']; parameters: Params }
}

export interface Antwoord {
  zeg: string
  regels?: string[]
  bellen?: { naam: string; nummer: string }
  link?: { naar: string; label: string }
}

export interface GesprekDiensten {
  nu(): Date
  tz: string
  taal: Taal
  nieuwId(): string
  interpreteer(tekst: string, lopend?: LopendGesprek): Promise<Gevalideerd>
  voerUit(v: Gevalideerd, actieId: string, audio?: Extract<Invoer, { soort: 'opname' }>): Promise<Uitkomst>
  /** Vragen (agenda van vandaag, algemene vraag) — alleen lezen. */
  beantwoord(v: Gevalideerd, tekst: string): Promise<Antwoord>
  /** Details voor de bevestigingszin: medicatie-uren, de echte naam van een contact. */
  bevestigDetails?(v: Gevalideerd): { tijden?: string; naam?: string }
}

function beurt(stand: Stand, zeg: string, status: Status, extra: Partial<Beurt> = {}): Beurt {
  return {
    stand,
    zeg,
    status,
    luisterNa: status === 'vraag' || status === 'bevestig',
    ...extra,
  }
}

function foutBeurt(e: unknown): Beurt {
  if (e instanceof IntentFout && e.soort === 'ongeldig') return beurt(RUST, t('voice.nietBegrepen'), 'mislukt')
  return beurt(RUST, t('voice.nietBeschikbaar'), 'mislukt')
}

/** Na elke interpretatie of aanvulling: vragen, bevestigen of uitvoeren. */
async function verder(v: Gevalideerd, d: GesprekDiensten, tekst: string): Promise<Beurt> {
  const config = INTENTS[v.intent]

  if (v.intent === 'unknown') return beurt(RUST, t('voice.nietBegrepen'), 'mislukt')

  if (config.soort === 'vraag') {
    try {
      const a = await d.beantwoord(v, tekst)
      return beurt(RUST, a.zeg, 'info', { regels: a.regels, bellen: a.bellen, link: a.link })
    } catch {
      return beurt(RUST, t('voice.nietBeschikbaar'), 'mislukt')
    }
  }

  if (v.intent === 'record_voice_diary') {
    return beurt({ soort: 'dagboek' }, t('voice.dagboekLuister'), 'dagboek')
  }

  if (v.missing_parameters.length > 0) {
    const veld = v.missing_parameters[0]
    return beurt({ soort: 'aanvullen', v, veld }, vraagNaar(veld, v.problemen), 'vraag')
  }

  const actieId = d.nieuwId()
  if (v.needs_confirmation) {
    const zin = bevestigZin(v, d.nu(), d.tz, d.bevestigDetails?.(v))
    return beurt({ soort: 'bevestigen', v, actieId }, zin, 'bevestig', {
      samenvatting: { intent: v.intent, parameters: v.parameters },
    })
  }
  return voerUit(v, actieId, d)
}

async function voerUit(
  v: Gevalideerd,
  actieId: string,
  d: GesprekDiensten,
  audio?: Extract<Invoer, { soort: 'opname' }>,
): Promise<Beurt> {
  const u = await d.voerUit(v, actieId, audio)
  if (!u.gelukt) return beurt(RUST, u.zeg, 'mislukt')
  return beurt(RUST, u.zeg, 'gelukt', { bellen: u.bellen, ververs: u.ververs, dagboekId: u.dagboekId })
}

function samen(v: Gevalideerd, erbij: Partial<Params>, d: GesprekDiensten): Gevalideerd {
  return hervalideer(v, { ...v.parameters, ...erbij }, d.nu(), d.tz)
}

async function nieuweZin(tekst: string, d: GesprekDiensten): Promise<Beurt> {
  try {
    const v = await d.interpreteer(tekst)
    return await verder(v, d, tekst)
  } catch (e) {
    return foutBeurt(e)
  }
}

export async function verwerk(stand: Stand, invoer: Invoer, d: GesprekDiensten): Promise<Beurt> {
  if (invoer.soort === 'nietVerstaan') {
    // De stand blijft: wie midden in een vraag zat, kan gewoon opnieuw antwoorden.
    return { ...beurt(stand, t('voice.nietVerstaan'), 'mislukt'), luisterNa: stand.soort !== 'rust' && stand.soort !== 'dagboek' }
  }

  const tekst = invoer.soort === 'tekst' ? invoer.tekst.trim() : ''
  if (invoer.soort === 'tekst' && !tekst) {
    return { ...beurt(stand, t('voice.nietVerstaan'), 'mislukt'), luisterNa: stand.soort !== 'rust' }
  }

  switch (stand.soort) {
    case 'rust': {
      if (invoer.soort !== 'tekst') return beurt(RUST, t('voice.hallo'), 'vraag')
      return nieuweZin(tekst, d)
    }

    case 'dagboek': {
      if (invoer.soort === 'opname') {
        const v = valideer(
          { intent: 'record_voice_diary', confidence: 1, parameters: {}, missing_parameters: [], needs_confirmation: false },
          d.nu(),
          d.tz,
        )!
        return voerUit(v, d.nieuwId(), d, invoer)
      }
      if (invoer.soort === 'knop' && invoer.knop === 'nee') return beurt(RUST, t('voice.geannuleerd'), 'geannuleerd')
      if (invoer.soort === 'tekst') {
        if (isNee(tekst, d.taal) && tekst.split(' ').length <= 3) return beurt(RUST, t('voice.geannuleerd'), 'geannuleerd')
        const v = valideer(
          { intent: 'add_diary_entry', confidence: 1, parameters: { text: tekst }, missing_parameters: [], needs_confirmation: false },
          d.nu(),
          d.tz,
        )!
        return voerUit(v, d.nieuwId(), d)
      }
      return beurt(stand, t('voice.dagboekLuister'), 'dagboek')
    }

    case 'aanvullen': {
      if (invoer.soort === 'knop') {
        if (invoer.knop === 'nee') return beurt(RUST, t('voice.geannuleerd'), 'geannuleerd')
        return beurt(stand, vraagNaar(stand.veld, stand.v.problemen), 'vraag')
      }
      if (invoer.soort !== 'tekst') return beurt(stand, vraagNaar(stand.veld), 'vraag')
      if (isNee(tekst, d.taal) && tekst.split(' ').length <= 3) return beurt(RUST, t('voice.geannuleerd'), 'geannuleerd')

      // Eerst zelf: "vrijdag", "tien uur". Snel, en er gaat niets de deur uit.
      const lokaal = vulVeld(stand.veld, tekst, d.nu(), d.tz, d.taal)
      if (lokaal) return verder(samen(stand.v, lokaal, d), d, tekst)

      try {
        const r = await d.interpreteer(tekst, {
          intent: stand.v.intent,
          parameters: stand.v.parameters,
          vraagt: stand.veld,
          modus: 'aanvullen',
        })
        if (r.intent === stand.v.intent) return verder(samen(stand.v, r.parameters, d), d, tekst)
        // Iets heel anders gezegd: dan is dat de nieuwe opdracht.
        if (r.intent !== 'unknown') return verder(r, d, tekst)
      } catch (e) {
        return { ...foutBeurt(e), stand, luisterNa: false }
      }
      return beurt(stand, vraagNaar(stand.veld, stand.v.problemen), 'vraag')
    }

    case 'bevestigen': {
      const ja = invoer.soort === 'knop' ? invoer.knop === 'ja' : isJa(tekst, d.taal)
      const aanpassen = invoer.soort === 'knop' ? invoer.knop === 'aanpassen' : isAanpassen(tekst, d.taal)
      const nee = invoer.soort === 'knop' ? invoer.knop === 'nee' : !aanpassen && isNee(tekst, d.taal)

      if (ja && !aanpassen) return voerUit(stand.v, stand.actieId, d)
      if (nee) {
        // "Nee, om drie uur": geen annulering maar een correctie.
        const c = invoer.soort === 'tekst' ? corrigeer(tekst, d.nu(), d.tz, d.taal) : null
        if (c) return verder(samen(stand.v, c, d), d, tekst)
        return beurt(RUST, t('voice.geannuleerd'), 'geannuleerd')
      }
      if (aanpassen) {
        const c = invoer.soort === 'tekst' ? corrigeer(tekst, d.nu(), d.tz, d.taal) : null
        if (c) return verder(samen(stand.v, c, d), d, tekst)
        return beurt({ soort: 'aanpassen', v: stand.v, actieId: stand.actieId }, t('voice.watAanpassen'), 'vraag')
      }
      if (invoer.soort === 'tekst') {
        const c = corrigeer(tekst, d.nu(), d.tz, d.taal)
        if (c) return verder(samen(stand.v, c, d), d, tekst)
        // Geen ja, geen nee, geen correctie: dit is een nieuwe opdracht.
        return nieuweZin(tekst, d)
      }
      return beurt(stand, t('voice.klopt'), 'bevestig')
    }

    case 'aanpassen': {
      if (invoer.soort === 'knop') {
        if (invoer.knop === 'nee') return beurt(RUST, t('voice.geannuleerd'), 'geannuleerd')
        if (invoer.knop === 'ja') return voerUit(stand.v, stand.actieId, d)
        return beurt(stand, t('voice.watAanpassen'), 'vraag')
      }
      if (invoer.soort !== 'tekst') return beurt(stand, t('voice.watAanpassen'), 'vraag')
      if (isNee(tekst, d.taal) && tekst.split(' ').length <= 3) return beurt(RUST, t('voice.geannuleerd'), 'geannuleerd')

      const c = corrigeer(tekst, d.nu(), d.tz, d.taal)
      if (c) return verder(samen(stand.v, c, d), d, tekst)

      try {
        const r = await d.interpreteer(tekst, {
          intent: stand.v.intent,
          parameters: stand.v.parameters,
          modus: 'aanpassen',
        })
        if (r.intent === stand.v.intent) return verder(samen(stand.v, r.parameters, d), d, tekst)
      } catch (e) {
        return { ...foutBeurt(e), stand, luisterNa: false }
      }
      return beurt(stand, t('voice.watAanpassen'), 'vraag')
    }
  }
}
