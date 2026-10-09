/**
 * Maakt een tekst geschikt om hardop te lezen. De stem van het toestel
 * kent sommige korte woorden niet als woord: "min." aan het eind van een
 * zin leest hij als de afkorting van "minister". Hier schrijven we dat om
 * naar het woord dat bedoeld wordt, vóór de tekst naar de stem gaat.
 *
 * Alleen Nederlands: in het Frans en Engels betekent "min" iets anders.
 */
export function uitspraak(tekst: string, taal: string): string {
  if (!taal.toLowerCase().startsWith('nl')) return tekst
  return (
    tekst
      // "10 min." of "5min": minuten, geen minus.
      .replace(/(?<=\d\s?)min(\.?)(?![\p{L}\d])/gu, 'minuten$1')
      // Los woord "min" (ook met punt): minus.
      .replace(/(?<![\p{L}\d])min(\.?)(?![\p{L}\d])/gu, 'minus$1')
  )
}
