import type { IconNaam } from '../../components/Icon'

/**
 * De indeling van het scherm van de persoon.
 *
 * Familie kiest WELKE blokken erop staan, in welke VOLGORDE en hoe GROOT.
 * Bewust geen posities: met x/y klopt een indeling alleen op het scherm
 * waarop ze gemaakt is. Draait de tablet, zet de persoon de tekst groter,
 * of bewerkt familie het op een telefoon, dan schuift alles over elkaar.
 *
 * Volgorde plus grootte lost dat in één keer op: niets kan overlappen, er
 * blijven geen gaten staan, het herschikt zichzelf op elk scherm, en de
 * leesvolgorde is per definitie gelijk aan wat je ziet — wat voor de
 * voorleesfunctie en het toetsenbord de volgorde is die telt.
 */

export type Maat = 'vol' | 'half'

export interface Tegel {
  id: string
  maat: Maat
}

export interface Indeling {
  versie: 1
  tegels: Tegel[]
}

export interface ModuleDef {
  id: string
  /** Naam in de editor. De persoon ziet deze niet; die ziet de inhoud. */
  naam: string
  /** Eén regel die zegt wat erop komt te staan. */
  uitleg: string
  icoon: IconNaam
  /** Staat altijd bovenaan, vol-breed, en kan niet weg. */
  vast?: boolean
  /** Kan nooit half: een lijst of een rij knoppen wordt daar onleesbaar. */
  altijdVol?: boolean
}

/**
 * Zes is de bovengrens.
 *
 * Niet omdat er technisch niet meer past, maar omdat een zevende tegel het
 * gesprek overslaat dat je juist wil: wat heeft zij écht nodig? Wie er een
 * bij wil, moet er eerst een weghalen.
 */
export const MAX_TEGELS = 6

export const MODULES: ModuleDef[] = [
  {
    id: 'nu',
    naam: 'Wat nu?',
    uitleg: 'Wat er op dit moment moet gebeuren, met een knop om het af te vinken.',
    icoon: 'vandaag',
    vast: true,
    altijdVol: true,
  },
  {
    id: 'daarna',
    naam: 'Daarna',
    uitleg: 'Het eerstvolgende dat eraan komt.',
    icoon: 'verder',
  },
  {
    id: 'vandaag',
    naam: 'Vandaag',
    uitleg: 'De hele dag als tijdlijn, met wat al gedaan is.',
    icoon: 'agenda',
  },
  {
    id: 'berichten',
    naam: 'Berichten',
    uitleg: 'Wat familie stuurde, met de mogelijkheid te antwoorden.',
    icoon: 'bellen',
  },
  {
    id: 'onthoud',
    naam: 'Onthoud dit',
    uitleg: 'Iets laten onthouden: waar iets ligt, wat er gezegd is.',
    icoon: 'weetjes',
  },
  {
    id: 'radio',
    naam: 'Muziek',
    uitleg: 'De radio of de muziek van vroeger, met één knop aan.',
    icoon: 'afspelen',
  },
  {
    id: 'vroeger',
    naam: 'Vandaag vroeger',
    uitleg: 'Een foto van deze dag in een ander jaar.',
    icoon: 'fotos',
  },
  {
    id: 'vertellen',
    naam: 'Vertel eens',
    uitleg: 'Elke dag één vraag over vroeger, voor het levensboek.',
    icoon: 'praten',
  },
  {
    id: 'knoppen',
    naam: 'Grote knoppen',
    uitleg: 'Wat nu?, Familie en Help als drie grote knoppen.',
    icoon: 'help',
    altijdVol: true,
  },
]

export function moduleVan(id: string): ModuleDef | undefined {
  return MODULES.find((m) => m.id === id)
}

/**
 * De indeling waarmee een nieuw huishouden begint.
 *
 * Eén grote kaart bovenaan en daaronder vier halve: op een tablet staan
 * die twee aan twee naast elkaar, zoals het scherm er voorheen liggend
 * uitzag. Op een telefoon is alles vanzelf vol-breed, want daar past niets
 * naast elkaar.
 */
export const STANDAARD: Indeling = {
  versie: 1,
  tegels: [
    { id: 'nu', maat: 'vol' },
    { id: 'daarna', maat: 'half' },
    { id: 'berichten', maat: 'half' },
    { id: 'vandaag', maat: 'half' },
    { id: 'onthoud', maat: 'half' },
    { id: 'knoppen', maat: 'vol' },
  ],
}

/**
 * Maakt van een opgeslagen indeling een indeling die zeker klopt.
 *
 * Dit draait op twee plaatsen: in de editor, zodat familie nooit iets kan
 * bewaren dat niet kan, en op het scherm van de persoon, zodat een oude of
 * half kapotte indeling daar nooit een leeg scherm oplevert. De tweede is
 * de belangrijkste: dat scherm hoort altijd te werken.
 *
 * Grote tekst maakt halve tegels vol-breed. Twee kolommen naast elkaar
 * betekenen bij die tekstgrootte drie woorden per regel — familie hoeft
 * daar niet aan te denken.
 */
export function normaliseer(
  ruw: unknown,
  opties: { groteTekst?: boolean } = {},
): Indeling {
  const tegels: Tegel[] = []
  const gezien = new Set<string>()

  const lijst =
    ruw && typeof ruw === 'object' && Array.isArray((ruw as Indeling).tegels)
      ? (ruw as Indeling).tegels
      : STANDAARD.tegels

  for (const t of lijst) {
    const def = t && typeof t === 'object' ? moduleVan((t as Tegel).id) : undefined
    // Een module die niet meer bestaat verdwijnt stilletjes; het scherm van
    // de persoon is niet de plek om een foutmelding te tonen.
    if (!def || gezien.has(def.id)) continue
    gezien.add(def.id)

    const half = (t as Tegel).maat === 'half' && !def.altijdVol && !opties.groteTekst
    tegels.push({ id: def.id, maat: half ? 'half' : 'vol' })
  }

  // "Wat nu?" staat altijd bovenaan. Dat is de vraag waar de app om draait;
  // die mag niet per huishouden ergens anders staan.
  const vast = MODULES.filter((m) => m.vast)
  for (const m of vast) {
    const i = tegels.findIndex((t) => t.id === m.id)
    if (i === -1) tegels.unshift({ id: m.id, maat: 'vol' })
    else if (i > 0) tegels.unshift(tegels.splice(i, 1)[0])
  }

  return { versie: 1, tegels: tegels.slice(0, MAX_TEGELS) }
}

/** Kan deze tegel omhoog of omlaag? De vaste tegel blokkeert plek 1. */
export function magSchuiven(tegels: Tegel[], index: number, stap: -1 | 1): boolean {
  const doel = index + stap
  const vastAantal = tegels.filter((t) => moduleVan(t.id)?.vast).length
  return index >= vastAantal && doel >= vastAantal && doel < tegels.length
}

export function schuif(tegels: Tegel[], index: number, stap: -1 | 1): Tegel[] {
  if (!magSchuiven(tegels, index, stap)) return tegels
  const kopie = tegels.slice()
  const doel = index + stap
  const hier = kopie[index]
  kopie[index] = kopie[doel]
  kopie[doel] = hier
  return kopie
}
