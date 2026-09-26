import { supabase } from '../../lib/supabase'
import { redenen, uitgeschakeld } from './pushStatus.intern'

/**
 * Waarom komt een melding niet aan?
 *
 * Een melding heeft vier wegen naar familie, en elke weg kan stilvallen
 * zonder een spoor:
 *
 *   - Realtime in de app: werkt altijd, maar alleen zolang de app open staat.
 *   - Push in de browser: dit toestel gaf geen toestemming, of kan het niet
 *     (iPhone in een tabblad, een beheerde laptop), of het huishouden staat
 *     niet op "ondersteund", of push-notify draait niet omdat pg_cron uit
 *     staat.
 *   - WhatsApp of Telegram: niet ingesteld, of de secrets ontbreken.
 *   - E-mail: staat uit voor dit account, of RESEND_API_KEY ontbreekt.
 *
 * Dit haalt op wat de database ervan weet, zodat het scherm kan zeggen wat
 * eraan scheelt in plaats van niets te doen.
 */
export type Kanaal = 'whatsapp' | 'telegram'

export interface PushStatus {
  /** Toestellen van familie die pushmeldingen aan hebben staan. */
  toestellen: number
  /** Staat dít toestel daarbij? Toestemming is per toestel én per account. */
  eigen_toestel: boolean
  /** Laat het ondersteuningsniveau push toe? */
  niveau_ok: boolean
  /** Meldingen van de laatste twee uur die nog niet gepusht zijn. */
  wachtend: number
  /** Wil dit account dringende meldingen ook per e-mail? */
  mail_aan: boolean
  /** Dringende meldingen waarvoor voor mij nog een weg openstaat. */
  wachtend_weg: number
  /** Mijn eigen kanalen: { whatsapp: '+32...', telegram: '123' }. */
  kanalen: Partial<Record<Kanaal, string>>
}

export async function getPushStatus(householdId: string): Promise<PushStatus | null> {
  const { data, error } = await supabase.rpc('push_status', { hh: householdId })
  if (error) throw error
  return leesStatus((data ?? [])[0] as Record<string, unknown> | undefined)
}

/**
 * Apart van de query, zodat het te testen is zonder database.
 *
 * Wat hier binnenkomt hangt af van welke migratie er gedraaid is: 34 gaf vier
 * kolommen, 35 zes, 36 zeven. Een ontbrekende kolom mag nooit als "staat uit"
 * gelezen worden — dan waarschuwt het scherm voor iets wat er niet aan de
 * hand is.
 */
export function leesStatus(rij: Record<string, unknown> | undefined): PushStatus | null {
  if (!rij) return null
  return {
    toestellen: getal(rij.toestellen),
    eigen_toestel: !!rij.eigen_toestel,
    niveau_ok: !!rij.niveau_ok,
    wachtend: getal(rij.wachtend),
    // Ontbreekt de kolom, dan doen we alsof mail aan staat: dat is de
    // standaard in de database, en een onterechte waarschuwing is erger dan
    // geen.
    mail_aan: rij.mail_aan === undefined ? true : !!rij.mail_aan,
    // wachtend_weg heette wachtend_mail voor 36_kanalen.sql. Beide lezen,
    // zodat het scherm ook werkt op een database waar die migratie nog niet
    // gedraaid is.
    wachtend_weg: getal(rij.wachtend_weg ?? rij.wachtend_mail),
    kanalen: kanalen(rij.eigen_kanalen),
  }
}

function getal(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function kanalen(v: unknown): Partial<Record<Kanaal, string>> {
  if (!v || typeof v !== 'object') return {}
  const uit: Partial<Record<Kanaal, string>> = {}
  for (const soort of ['whatsapp', 'telegram'] as const) {
    const adres = (v as Record<string, unknown>)[soort]
    if (typeof adres === 'string' && adres) uit[soort] = adres
  }
  return uit
}

/** Dringende meldingen ook per e-mail, voor dit account. */
export async function zetMail(aan: boolean) {
  const { error } = await supabase.rpc('set_mail_alerts', { aan })
  if (error) throw error
}

/**
 * Een kanaal instellen, of met een leeg adres weer weghalen.
 *
 * Het nummer wordt in de database genormaliseerd, niet hier: dat is één
 * plaats om na te kijken in plaats van twee die uit elkaar kunnen lopen.
 * Komt er een fout terug, dan is het een leesbare zin die we tonen.
 */
export async function zetKanaal(householdId: string, soort: Kanaal, adres: string) {
  const { error } = await supabase.rpc('set_alert_channel', {
    hh: householdId,
    soort,
    adres,
  })
  if (error) throw error
}

/**
 * Wie stuurde de Telegram-bot recent iets?
 *
 * Een bot antwoordt niet uit zichzelf, dus een familielid heeft geen enkele
 * manier om zijn chat-id te weten te komen. Dit haalt op wie de bot de
 * laatste 24 uur aanschreef, zodat het scherm kan zeggen "jij bent
 * 123456789" in plaats van een handleiding te tonen.
 */
export async function telegramChats(): Promise<{ id: string; naam: string }[]> {
  const { data, error } = await supabase.functions.invoke('push-notify', {
    body: { actie: 'telegram-chats' },
  })
  if (error) throw error
  const chats = (data as { chats?: unknown })?.chats
  if (!Array.isArray(chats)) return []
  return chats.filter(
    (c): c is { id: string; naam: string } =>
      !!c && typeof c.id === 'string' && typeof c.naam === 'string',
  )
}

/**
 * Een testmelding, langs precies dezelfde weg als een echte — en langs álle
 * wegen, want een test die maar de helft aflegt bewijst niet wat je wil
 * weten.
 */
export interface Testuitslag {
  /** Wegen die de server helemaal niet kan gebruiken: hun secrets ontbreken. */
  uit: string[]
  /** Wegen die het probeerden en geweigerd werden, met de reden. */
  fouten: string[]
}

export async function stuurTestmelding(householdId: string): Promise<Testuitslag> {
  const { error } = await supabase.rpc('test_push', { hh: householdId })
  if (error) throw error
  try {
    const { data, error: invokeFout } = await supabase.functions.invoke('push-notify')
    if (invokeFout) {
      // Een 500 uit de functie draagt haar eigen uitleg mee; die is veel
      // bruikbaarder dan "niet bereikbaar". Alleen als er niets in zit,
      // vallen we terug op de algemene tekst.
      const uitleg = (data as { error?: unknown })?.error
      return {
        uit: [],
        fouten: [typeof uitleg === 'string' && uitleg ? `push-notify: ${uitleg}` : ONBEREIKBAAR],
      }
    }
    return { uit: uitgeschakeld(data), fouten: redenen(data) }
  } catch {
    return { uit: [], fouten: [ONBEREIKBAAR] }
  }
}

/**
 * De functie zelf is niet bereikbaar.
 *
 * Dit werd eerst stil weggeslikt, met als redenering: de melding staat al in
 * de database en de cron pikt hem wel op. Dat klopt voor een melding uit de
 * nacht, maar niet voor iemand die net op een testknop drukte en toekijkt.
 * Die ziet dan niets gebeuren en weet niet of het aan hem of aan de app ligt.
 *
 * De meest voorkomende oorzaak is een adres dat niet overeenkomt met de naam:
 * Supabase geeft een nieuwe functie een willekeurig adres, en dat verandert
 * niet mee als je de titel aanpast.
 */
const ONBEREIKBAAR =
  'push-notify is niet bereikbaar. Kijk in Supabase bij Edge Functions of het adres onder de titel eindigt op /push-notify — staat daar iets anders, dan roept de app een functie aan die niet bestaat.'

/**
 * Welke wegen de server niet eens kan proberen.
 *
 * Dit is het verschil tussen "de taak draait niet" en "de sleutel ontbreekt",
 * en die twee vragen om iets heel anders. Zonder dit stuurde het scherm je
 * naar pg_cron terwijl er gewoon geen RESEND_API_KEY stond.
 */

/**
 * Wat de wegen terugmeldden.
 *
 * Weigert Meta een sjabloon, dan staat de reden in het antwoord van de edge
 * function — en die hoort op het scherm, niet in een logboek dat niemand
 * opent. Bij het opzetten is dit het verschil tussen "het werkt niet" en
 * "het sjabloon heet anders".
 */
