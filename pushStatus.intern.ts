/**
 * Wat de edge function terugmeldde na een ronde.
 *
 * Apart van pushStatus.ts, zodat het te testen is zonder de supabase-client
 * te laden. Twee verschillende dingen, die om iets heel anders vragen:
 *
 *   - uitgeschakeld: de server kan die weg niet eens proberen, want zijn
 *     secrets ontbreken. Dat los je op in Supabase, bij Edge Functions.
 *   - redenen: de weg werd geprobeerd en de andere kant weigerde. De reden
 *     staat in hun antwoord — bij het opzetten van WhatsApp is dat het
 *     verschil tussen een namiddag gissen en één regel aanpassen.
 *
 * Ze door elkaar halen stuurt iemand naar pg_cron terwijl er gewoon een
 * sleutel ontbreekt.
 */
export function uitgeschakeld(data: unknown): string[] {
  const uit = (data as { wegen_uit?: unknown })?.wegen_uit
  if (!Array.isArray(uit)) return []
  return uit.filter((w): w is string => typeof w === 'string')
}

export function redenen(data: unknown): string[] {
  const fouten = (data as { wegen_fouten?: unknown })?.wegen_fouten
  if (!fouten || typeof fouten !== 'object') return []
  return Object.entries(fouten as Record<string, unknown>)
    .filter(([, v]) => typeof v === 'string' && v)
    .map(([weg, v]) => `${weg}: ${v as string}`)
}
