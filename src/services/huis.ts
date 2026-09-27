import { supabase } from '../lib/supabase'

/**
 * Eén huis, twee mensen.
 *
 * Twee mensen die samenwonen blijven twee huishoudens — hun medicatie en
 * hun dagindeling mogen nooit door elkaar lopen. Maar ze hebben één keuken,
 * en die stond tot nu toe twee keer in de app. Twee keer de wasmachine
 * fotograferen, en bij elke wijziging eraan denken dat het op twee plaatsen
 * staat. Dat gaat mis, en dan leest de ene persoon een uitleg die niet meer
 * klopt.
 */
export interface Samenvoeging {
  kamers_verplaatst?: number
  kamers_samengevoegd?: number
  dingen_verplaatst?: number
  dubbel_weggelaten?: number
  al_gedeeld?: boolean
  losgemaakt?: boolean
}

/**
 * Deel het Home Memory met een ander huishouden in hetzelfde huis.
 * `van` op null zet het weer los.
 */
export async function zetHuisgenoot(hh: string, van: string | null): Promise<Samenvoeging> {
  const { data, error } = await supabase.rpc('zet_huisgenoot', { hh, van })
  if (error) throw error
  return (data ?? {}) as Samenvoeging
}

/** Het minimum dat nodig is om te beslissen of iets een huisgenoot kan zijn. */
export interface HuisKandidaat {
  household_id: string
  person_name: string
  role: string
  home_id: string
}

/**
 * Bij wie kan dit huishouden intrekken?
 *
 * Elke voorwaarde hieronder staat ook in de database. Ze staat hier nog een
 * keer omdat een knop die er niet is beter uitlegt dan een foutmelding:
 *  - je moet beheerder zijn van het huis waar je bij intrekt, anders hang je
 *    je persoon aan de keuken van iemand die daar niets van weet;
 *  - dat huis moet zelf op zichzelf wonen, want een ketting A→B→C maakt
 *    onzichtbaar welk huis je aan het bewerken bent;
 *  - en woont er al iemand bij jóu in, dan kan je zelf niet verhuizen —
 *    dan zou je die ander meesleuren. Dan is er niets aan te bieden.
 *
 * Wat wél mag: meerdere huishoudens in hetzelfde huis. Drie mensen in een
 * woning met één keuken is geen uitzondering maar juist de situatie waar
 * dit voor bedoeld is.
 */
export function kiesHuisgenoten(hh: string, alle: HuisKandidaat[]): HuisKandidaat[] {
  const heeftInwoner = alle.some((a) => a.household_id !== hh && a.home_id === hh)
  if (heeftInwoner) return []

  return alle.filter(
    (h) => h.household_id !== hh && h.role === 'admin' && h.home_id === h.household_id,
  )
}

/**
 * Wat er gebeurd is, in één zin.
 *
 * Familie moet na het samenvoegen kunnen zien dat er niets verdwenen is —
 * dat is de enige vraag die ze op dat moment hebben. Daarom staan de
 * aantallen erbij en niet alleen "gelukt".
 */
export function samenvattingInWoorden(s: Samenvoeging): string {
  if (s.losgemaakt) {
    return 'Losgemaakt. De kamers en apparaten blijven bij het huis staan.'
  }
  if (s.al_gedeeld) return 'Deze twee delen het huis al.'

  const delen: string[] = []
  const verplaatst = s.kamers_verplaatst ?? 0
  const samen = s.kamers_samengevoegd ?? 0
  const dingen = s.dingen_verplaatst ?? 0
  const weg = s.dubbel_weggelaten ?? 0

  if (verplaatst > 0) delen.push(`${verplaatst} ${verplaatst === 1 ? 'kamer' : 'kamers'} verhuisd`)
  if (samen > 0) delen.push(`${samen} ${samen === 1 ? 'kamer' : 'kamers'} samengevoegd`)
  if (dingen > 0) delen.push(`${dingen} ${dingen === 1 ? 'ding' : 'dingen'} mee`)
  if (weg > 0) delen.push(`${weg} leeg dubbel weggelaten`)

  if (delen.length === 0) return 'Het huis is nu gedeeld. Er stond nog niets in om te verhuizen.'
  return `Het huis is nu gedeeld: ${delen.join(', ')}.`
}
