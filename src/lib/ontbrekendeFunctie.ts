/**
 * Kent de database deze functie nog niet (migratie nog niet gedraaid)?
 * Dan valt de app terug op de oude weg in plaats van een fout te tonen.
 */
export function ontbrekendeFunctie(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null
  // PGRST202: "Could not find the function ... in the schema cache".
  // 42883: "function ... does not exist".
  return (
    e?.code === 'PGRST202' ||
    e?.code === '42883' ||
    (e?.message ?? '').includes('Could not find the function')
  )
}
