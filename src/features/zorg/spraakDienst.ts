/**
 * Koppelpunt voor een spraakdienst. Er is hier bewust geen externe dienst
 * aangesloten: zonder verwerkersovereenkomst gaat er niets naar buiten.
 * Zolang `geenDienst` actief is, geeft `vraag` altijd null terug en valt
 * de app terug op de vaste vragen.
 */
export interface SpraakDienst {
  naam: string
  /** True als de gegevens de app niet verlaten, bv. een lokale provider. */
  lokaal: boolean
  /** Null betekent: deze dienst beantwoordt de vraag niet. */
  vraag(soort: 'tijd_dienst' | 'open_taken', context: string): Promise<string | null>
}

export const geenDienst: SpraakDienst = {
  naam: 'uit',
  lokaal: true,
  vraag: async () => null,
}

let actief: SpraakDienst = geenDienst

export function kiesSpraakDienst(dienst: SpraakDienst) {
  actief = dienst
}

export function huidigeSpraakDienst(): SpraakDienst {
  return actief
}
