/**
 * Welke blokken er bestaan, en wat er van weggelaten werd.
 *
 * Eén lijst voor het analysescherm én voor het verslag. Twee lijsten zouden
 * uiteen gaan lopen, en dan staat er op papier iets anders dan familie
 * aanvinkte.
 */

export interface BlokDef {
  id: string
  /** Kop op het scherm. */
  titel: string
  /** Kop op papier: korter, en zonder de uitleg die een arts niet nodig heeft. */
  opPapier: string
  /** Waarom dit blok er staat. Alleen op het scherm. */
  onder: string
}

export const BLOKKEN: BlokDef[] = [
  {
    id: 'medicatie',
    titel: 'Medicatie bevestigd',
    opPapier: 'Medicatie',
    onder: 'Per moment van de dag, en welk deel de persoon zelf bevestigde.',
  },
  {
    id: 'dagritme',
    titel: 'Wanneer de dag begon',
    opPapier: 'Dagritme',
    onder:
      'Het tijdstip van de eerste afgevinkte activiteit. Het uiteenlopen zegt meer dan het gemiddelde.',
  },
  {
    id: 'weekpatroon',
    titel: 'Per dag van de week',
    opPapier: 'Per dag van de week',
    onder:
      'Klopt alles op zondag omdat er dan bezoek is, dan meet je bezoek en geen zelfstandigheid.',
  },
  {
    id: 'nacht',
    titel: "Activiteit 's nachts",
    opPapier: "Activiteit 's nachts",
    onder: 'Handelingen door de persoon zelf tussen 1 en 6 uur.',
  },
  {
    id: 'schema',
    titel: 'Wijzigingen aan het medicatieschema',
    opPapier: 'Wijzigingen aan het medicatieschema',
    onder: 'Een daling betekent iets anders als er kort daarvoor een middel bijkwam.',
  },
  {
    id: 'notities',
    titel: 'Wat familie en zorgverleners noteerden',
    opPapier: 'Notities van familie en zorgverleners',
    onder: 'In hun eigen woorden. Vaak het stuk waar een arts het meest aan heeft.',
  },
]

export interface Weggelaten {
  /** Er waren gegevens, maar familie vinkte het blok niet aan. */
  bewustWeg: string[]
  /** Er waren geen gegevens. Niet weggelaten, maar ook niet gemeten. */
  geenGegevens: string[]
}

/**
 * Wat er niet op het verslag staat.
 *
 * Dit hoort op het blad, en het onderscheid ook. "Familie liet dit weg" en
 * "de app heeft dit niet" betekenen iets heel anders voor een arts. Zonder
 * deze regel cureert familie zonder het te beseffen wat de arts ziet, en
 * weet de arts niet wat hij mist.
 */
export function nietOpgenomen(aangevinkt: string[], leeg: Record<string, boolean>): Weggelaten {
  const bewustWeg: string[] = []
  const geenGegevens: string[] = []

  for (const b of BLOKKEN) {
    if (leeg[b.id]) geenGegevens.push(b.opPapier)
    else if (!aangevinkt.includes(b.id)) bewustWeg.push(b.opPapier)
  }

  return { bewustWeg, geenGegevens }
}
