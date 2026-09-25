/**
 * De hoofdstukken van het levensboek.
 *
 * "Vertel eens" stelt elke dag één vraag, in willekeurige volgorde. Een
 * boek op datum is daardoor een rommelig boek: de trouwdag staat tussen
 * het lievelingsspel en de eerste auto. Daarom krijgt elke vraag een
 * hoofdstuk, en staan de verhalen in het boek bij elkaar.
 *
 * De indeling loopt grofweg met een leven mee: kindertijd, werk, liefde,
 * gezin, en dan wat iemand meedraagt. Zonder React of database, zodat ze
 * te testen is.
 */
export const HOOFDSTUKKEN = [
  'Toen ik klein was',
  'School en werk',
  'Liefde en gezin',
  'Feesten en gewoontes',
  'Reizen en plekken',
  'Muziek, spel en vrije tijd',
  'Wat ik meedraag',
] as const

export type Hoofdstuk = (typeof HOOFDSTUKKEN)[number]

/**
 * Per hoofdstuk de woorden die erop wijzen, in volgorde van beslissing:
 * de eerste die past, wint. Vandaar dat de kindertijd vóór "Liefde en
 * gezin" komt — anders slokt het woord "kind" daar elke vraag over
 * vroeger op.
 */
const REGELS: { hoofdstuk: Hoofdstuk; woorden: RegExp }[] = [
  {
    hoofdstuk: 'School en werk',
    woorden: /school|juf|meester|werk|collega|trots was/,
  },
  {
    hoofdstuk: 'Toen ik klein was',
    woorden: /als kind|klein was|opgegroeid|jong was|straat waar je woonde/,
  },
  {
    hoofdstuk: 'Liefde en gezin',
    woorden: /partner|trouw|je kinderen|eerste kind|kleinkind|moeder|vader|gezin|geboren/,
  },
  {
    hoofdstuk: 'Feesten en gewoontes',
    woorden: /feest|kerst|nieuwjaar|gerecht|recept|ritueel|cadeau|zondag/,
  },
  {
    hoofdstuk: 'Reizen en plekken',
    woorden: /reis|vakantie|uitstap|plek|huis waar je|buurt|winkel|auto|fiets/,
  },
  {
    hoofdstuk: 'Muziek, spel en vrije tijd',
    woorden: /lied|muziek|dansen|spel|hobby|vrije tijd|sport|film|programma|boek|huisdier|tuin/,
  },
]

export function hoofdstukVan(vraag: string): Hoofdstuk {
  const v = vraag.toLowerCase()
  for (const regel of REGELS) {
    if (regel.woorden.test(v)) return regel.hoofdstuk
  }
  // Alles wat over vandaag of over wijsheid gaat, en alles wat we niet
  // herkennen: achteraan, want dat leest als een afsluiting.
  return 'Wat ik meedraag'
}

/**
 * Een foto hoort bij het hoofdstuk waar haar titel en verhaal over gaan.
 * Zonder geboortejaar kunnen we niet op jaartal indelen, en gokken op
 * leeftijd levert foto's op de verkeerde plaats. Staat er niets
 * herkenbaars in, dan blijft de foto voor het album achteraan.
 */
export function hoofdstukVanFoto(titel: string, verhaal?: string | null): Hoofdstuk | null {
  const tekst = `${titel} ${verhaal ?? ''}`.toLowerCase()
  for (const regel of REGELS) {
    if (regel.woorden.test(tekst)) return regel.hoofdstuk
  }
  return null
}

export interface TeOrdenen {
  question: string
}

/**
 * De verhalen gegroepeerd, in de volgorde van HOOFDSTUKKEN. Lege
 * hoofdstukken komen niet in het boek: een hoofdstuktitel zonder verhaal
 * leest als iets wat ontbreekt.
 */
export function inHoofdstukken<T extends TeOrdenen>(
  verhalen: T[],
): { titel: Hoofdstuk; verhalen: T[] }[] {
  return HOOFDSTUKKEN.map((titel) => ({
    titel,
    verhalen: verhalen.filter((v) => hoofdstukVan(v.question) === titel),
  })).filter((h) => h.verhalen.length > 0)
}
