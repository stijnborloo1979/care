// Vervangt https://esm.sh/@supabase/supabase-js@2 in de tests van de edge
// functions. De test zet globalThis.__maakClient.
export function createClient(...args: unknown[]) {
  return (globalThis as unknown as { __maakClient: (...a: unknown[]) => unknown }).__maakClient(...args)
}
