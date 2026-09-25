import { supabase } from '../lib/supabase'

/**
 * De analyses achter het familiescherm en het verslag voor de dokter.
 *
 * Alles komt uit gegevens die de app toch al bewaart. Er wordt niets
 * extra geregistreerd: geen gelogde vragen, geen schermtijd, geen
 * sensoren. Wat er niet is, staat op het scherm als "niet beschikbaar"
 * met de reden erbij, in plaats van als een leeg vakje.
 */

export interface DagritmeRij {
  maand: string
  dagen: number
  vroegste: string
  mediaan: string
  laatste: string
  /** Minuten tussen de vroegste en de laatste start van de dag. */
  spreiding: number
}

export interface WeekRij {
  weekdag: number
  med_momenten: number
  med_bevestigd: number
  med_zelf: number
  agenda_items: number
  agenda_gedaan: number
  dagen: number
}

export interface UurRij {
  uur: number
  aantal: number
  dagen: number
}

export interface Dekking {
  dagen_periode: number
  dagen_gebruik: number
  eerste_dag: string | null
  laatste_dag: string | null
}

export interface RapportKeuze {
  /** Welke blokken meegaan. De vaste kern staat hier niet in. */
  blokken: string[]
  dagen: number
}

export const STANDAARD_KEUZE: RapportKeuze = {
  blokken: ['medicatie', 'dagritme', 'weekpatroon', 'notities'],
  dagen: 90,
}

export const WEEKDAGEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']

/**
 * De periode in twee helften, om de eerste met de tweede te kunnen
 * vergelijken. Zonder dit vergelijk je een getal met zichzelf en leest
 * alles als stabiel.
 */
export function helften(dagen: number): {
  eerste: { van: string; tot: string }
  tweede: { van: string; tot: string }
} {
  const dag = 24 * 3600_000
  const nu = Date.now()
  const sleutel = (t: number) => new Date(t).toISOString().slice(0, 10)
  const helft = Math.max(1, Math.floor(dagen / 2))

  return {
    eerste: { van: sleutel(nu - dagen * dag), tot: sleutel(nu - helft * dag) },
    tweede: { van: sleutel(nu - (helft - 1) * dag), tot: sleutel(nu) },
  }
}

export async function getDagritme(hh: string, van: string, tot: string): Promise<DagritmeRij[]> {
  const { data, error } = await supabase.rpc('analyse_dagritme', { hh, van, tot })
  if (error) throw error
  return (data ?? []) as DagritmeRij[]
}

export async function getWeekpatroon(hh: string, van: string, tot: string): Promise<WeekRij[]> {
  const { data, error } = await supabase.rpc('analyse_weekpatroon', { hh, van, tot })
  if (error) throw error
  return (data ?? []) as WeekRij[]
}

export async function getActiviteit(hh: string, van: string, tot: string): Promise<UurRij[]> {
  const { data, error } = await supabase.rpc('analyse_activiteit', { hh, van, tot })
  if (error) throw error
  return (data ?? []) as UurRij[]
}

export async function getDekking(hh: string, van: string, tot: string): Promise<Dekking | null> {
  const { data, error } = await supabase.rpc('analyse_dekking', { hh, van, tot })
  if (error) throw error
  return ((data ?? [])[0] ?? null) as Dekking | null
}

export async function getRapportKeuze(hh: string): Promise<RapportKeuze> {
  const { data, error } = await supabase
    .from('household')
    .select('report_prefs')
    .eq('id', hh)
    .maybeSingle()
  if (error) throw error
  const rij = (data as { report_prefs: Partial<RapportKeuze> } | null)?.report_prefs ?? {}
  return { ...STANDAARD_KEUZE, ...rij }
}

export async function setRapportKeuze(hh: string, keuze: Partial<RapportKeuze>) {
  const { error } = await supabase.rpc('set_report_prefs', { hh, prefs: keuze })
  if (error) throw error
}

/**
 * Wat er níét veranderde.
 *
 * Zonder dit leest elk verslag als achteruitgang, ook wanneer er niets
 * aan de hand is. We vergelijken de eerste helft van de periode met de
 * tweede; blijft het verschil klein, dan is het stabiel. Bewust ruim
 * genomen: kleine schommelingen zijn ruis, geen bevinding.
 */
export interface Helft {
  tijdstip: string
  /** Bevestigd in procenten, eerste helft van de periode. */
  eerste: number
  /** Idem, tweede helft. */
  laatste: number
  /** Hoeveel momenten er in elke helft waren. Te weinig = niets zeggen. */
  momentenEerste: number
  momentenTweede: number
}

export function watStabielBleef(medicatiePerTijdstip: Helft[], dagritme: DagritmeRij[]): string[] {
  const stabiel: string[] = []

  for (const m of medicatiePerTijdstip) {
    // Onder vijf momenten per helft is een percentage geen percentage.
    // Dan liever niets beweren dan "stabiel" op drie metingen.
    if (m.momentenEerste < 5 || m.momentenTweede < 5) continue
    if (Math.abs(m.laatste - m.eerste) <= 5) {
      stabiel.push(`Medicatie van ${m.tijdstip} bleef rond ${Math.round(m.laatste)} %.`)
    }
  }

  if (dagritme.length >= 2) {
    const eerste = dagritme[0]
    const laatste = dagritme[dagritme.length - 1]
    if (Math.abs(laatste.spreiding - eerste.spreiding) <= 45) {
      stabiel.push('De spreiding van het dagbegin bleef ongeveer gelijk.')
    }
  }

  return stabiel
}
