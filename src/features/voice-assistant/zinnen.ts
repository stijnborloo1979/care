/**
 * Wat LifeAngle zegt. Kort, rustig, volwassen. Geen "Uiteraard! Met veel
 * plezier…" — één zin die zegt wat er gebeurt of gebeurd is.
 */

import { locale, t, taal } from '../../lib/i18n'
import { datumVoorStem, tijdVoorStem } from './datumTijd'
import type { ParamNaam, Params } from './intents'
import type { Gevalideerd, Probleem } from './valideer'

function dag(datum: string, nu: Date, tz: string) {
  return datumVoorStem(datum, nu, tz, locale())
}

function tijd(hhmm: string) {
  return taal() === 'nl' ? tijdVoorStem(hhmm) : hhmm
}

/** "melk, brood en kaas" */
export function opsomming(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ${taal() === 'fr' ? 'et' : taal() === 'en' ? 'and' : 'en'} ${items[items.length - 1]}`
}

export function vraagNaar(veld: ParamNaam, problemen: Probleem[] = []): string {
  if (veld === 'date' && problemen.includes('datum_verleden')) return t('voice.verleden.date')
  if (veld === 'time' && problemen.includes('tijd_verleden')) return t('voice.verleden.time')
  return t(`voice.vraag.${veld}`)
}

export function bevestigZin(v: Gevalideerd, nu: Date, tz: string, extra?: { tijden?: string; naam?: string }): string {
  const p: Params = v.parameters
  switch (v.intent) {
    case 'create_calendar_event':
      return t('voice.bevestig.afspraak', { dag: dag(p.date!, nu, tz), tijd: tijd(p.time!), titel: p.title! })
    case 'create_reminder':
      return t('voice.bevestig.herinnering', { dag: dag(p.date!, nu, tz), tijd: tijd(p.time!), wat: p.text! })
    case 'send_family_message':
      return t('voice.bevestig.bericht', { bericht: p.message! })
    case 'call_contact':
      return t('voice.bevestig.bellen', { naam: extra?.naam ?? p.contact! })
    case 'mark_medication_taken':
      return t('voice.bevestig.medicatie', { tijden: extra?.tijden ?? '' })
    case 'add_shopping_item':
      return t('voice.bevestig.boodschappen', { lijst: opsomming(p.items ?? []) })
    default:
      return t('voice.bevestig.algemeen')
  }
}

export function herinneringGedaan(p: Params, nu: Date, tz: string): string {
  return t('voice.gedaan.herinnering', { dag: dag(p.date!, nu, tz), tijd: tijd(p.time!) })
}
