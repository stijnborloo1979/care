import type { ZorgTaak } from './zorgApi'
import { tt } from '../../lib/uiTaal'

/** Vaste antwoorden, zonder taalmodel. Alleen gebaseerd op de eigen gegevens. */
export function antwoordOpenTaken(taken: ZorgTaak[]): string {
  const open = taken.filter((t) => !t.done_at)
  if (open.length === 0) return tt('Er zijn geen open taken op deze afdeling.')
  return tt('Er zijn {n} open taken: {taken}.', { n: open.length, taken: open.map((t) => t.title).join('; ') })
}

export function antwoordDienst(dienst: 'vroeg' | 'laat' | 'nacht'): string {
  const naam = {
    vroeg: tt('vroege dienst (7 tot 15 uur)'),
    laat: tt('late dienst (15 tot 22 uur)'),
    nacht: tt('nachtdienst (22 tot 7 uur)'),
  }
  return tt('Je bent nu in de {dienst}.', { dienst: naam[dienst] })
}
