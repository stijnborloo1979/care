/**
 * De woorden waaraan de assistent een vraag herkent, per taal.
 *
 * Bewust los van answerEngine.ts: de logica (wat is er vandaag, staat de
 * medicatie nog open) is in elke taal hetzelfde; alleen de woorden waarmee
 * iemand het vraagt, verschillen.
 *
 * Deze lijst is niet volledig en hoeft dat ook niet te zijn. Ze dekt de
 * vragen die dagelijks terugkomen, gratis en offline. Wat ze niet herkent,
 * gaat naar de edge function `ask`, die in de eigen gegevens zoekt en in
 * de taal van het huishouden antwoordt.
 *
 * De patronen draaien op genormaliseerde tekst: kleine letters, zonder
 * accenten. "Où" wordt dus "ou".
 */
import type { Taal } from '../../lib/i18n'

export interface Patronen {
  bellen: RegExp
  radio: RegExp
  radioUit: RegExp
  hebIk: RegExp
  al: RegExp
  onthouden: RegExp
  watNu: RegExp
  wieKomt: RegExp
  wanneer: RegExp
  waar: RegExp
  hoe: RegExp
  /** Woorden die naar medicatie verwijzen, in een vraag of in een naam. */
  medicatie: RegExp
  /** Stopwoorden, zodat "waar liggen mijn sleutels" op "sleutels" uitkomt. */
  stopwoorden: string[]
}

const NL: Patronen = {
  bellen: /^bel\b|bellen|opbellen/,
  radio: /\bradio\b|muziek/,
  radioUit: /\b(uit|stop|stil|zwijg)\b/,
  hebIk: /\bheb ik\b/,
  al: /\bal\b|gedaan|genomen|gegeten/,
  onthouden: /onthoud/,
  watNu: /wat moet ik|wat nu|nu doen/,
  wieKomt: /wie komt|bezoek/,
  wanneer: /wanneer|hoe laat/,
  waar: /\bwaar\b/,
  hoe: /\bhoe\b/,
  medicatie: /pil|medic|medicijn|tablet|druppel|capsule/,
  stopwoorden: [
    'de', 'het', 'een', 'mijn', 'is', 'zijn', 'waar', 'wat', 'hoe', 'ik', 'mij',
    'me', 'van', 'op', 'in', 'ligt', 'liggen', 'staat', 'heb', 'gelegd', 'weer',
  ],
}

const FR: Patronen = {
  bellen: /^appelle|appeler|telephoner|telephone a/,
  radio: /\bradio\b|musique/,
  radioUit: /\b(arrete|arreter|stop|eteins|eteindre|silence)\b/,
  hebIk: /est ce que j ai|j ai deja|ai je/,
  al: /\bdeja\b|pris|mange|fait/,
  onthouden: /retenir|note|rappeler|souvenir/,
  watNu: /que dois je|quoi maintenant|qu est ce que je dois/,
  wieKomt: /qui vient|visite|passe aujourd hui/,
  wanneer: /quand|a quelle heure/,
  waar: /\bou\b|ou sont|ou est/,
  hoe: /comment/,
  medicatie: /medic|cachet|comprime|pilule|goutte|gelule/,
  stopwoorden: [
    'le', 'la', 'les', 'un', 'une', 'des', 'mon', 'ma', 'mes', 'est', 'sont',
    'ou', 'quoi', 'comment', 'je', 'me', 'moi', 'de', 'du', 'sur', 'dans',
    'ai', 'mis', 'trouve', 'encore',
  ],
}

const EN: Patronen = {
  bellen: /^call\b|phone\b|ring\b/,
  radio: /\bradio\b|music/,
  radioUit: /\b(off|stop|quiet|silence)\b/,
  hebIk: /\bhave i\b|did i\b/,
  al: /\balready\b|taken|eaten|done/,
  onthouden: /remember|note|reminder/,
  watNu: /what should i|what now|what do i/,
  wieKomt: /who is coming|who comes|visit/,
  wanneer: /when|what time/,
  waar: /\bwhere\b/,
  hoe: /\bhow\b/,
  medicatie: /pill|medic|medicine|tablet|drop|capsule/,
  stopwoorden: [
    'the', 'a', 'an', 'my', 'is', 'are', 'where', 'what', 'how', 'i', 'me',
    'of', 'on', 'in', 'did', 'put', 'left', 'again', 'do',
  ],
}

const PER_TAAL: Record<Taal, Patronen> = { nl: NL, fr: FR, en: EN }

export function patronen(taal: Taal): Patronen {
  return PER_TAAL[taal]
}
