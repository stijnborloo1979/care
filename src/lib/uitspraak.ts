/**
 * Maakt een tekst geschikt om hardop te lezen. De stem van het toestel
 * leest "min." aan het eind van een zin als de afkorting van "minister".
 * Het woord zelf blijft "min": alleen de punt wordt een komma, zodat de
 * stem het niet als afkorting ziet maar wel even pauzeert.
 *
 * Alleen Nederlands: in het Frans en Engels betekent "min" iets anders.
 */
export function uitspraak(tekst: string, taal: string): string {
  if (!taal.toLowerCase().startsWith('nl')) return tekst
  return (
    tekst
      // "10 min." of "5min": minuten.
      .replace(/(?<=\d\s?)min(\.?)(?![\p{L}\d])/gu, 'minuten$1')
      // Los woord "min" met een punt: de punt wordt een komma.
      .replace(/(?<![\p{L}\d])min\.(?=\s|$)/gu, 'min,')
  )
}
