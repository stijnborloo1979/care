/**
 * Hoeveel bewoners er voor een activiteit staan. "Afwezig" telt niet mee:
 * wie niet komt, staat niet op de lijst van wie er verwacht wordt.
 * Pure functie, zodat de telling los van de database te testen is.
 */
export type DeelnameRij = { activity_id: string; status: 'ingeschreven' | 'aanwezig' | 'afwezig' }

export function telDeelnemers(rijen: DeelnameRij[]): Record<string, number> {
  const telling: Record<string, number> = {}
  for (const r of rijen) {
    if (r.status === 'afwezig') continue
    telling[r.activity_id] = (telling[r.activity_id] ?? 0) + 1
  }
  return telling
}
