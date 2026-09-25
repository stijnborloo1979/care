import { supabase } from '../lib/supabase'

export interface ActiveCall {
  id: string
  caller_id: string | null
  caller_name: string | null
  status: string
  started_at: string
}

export async function startCall(householdId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_call', { hh: householdId })
  if (error) throw error
  return data as string
}

export async function answerCall(callId: string) {
  const { error } = await supabase.rpc('answer_call', { call_id: callId })
  if (error) throw error
}

export async function endCall(callId: string, reden = 'hangup') {
  const { error } = await supabase.rpc('end_call', { call_id: callId, reden })
  if (error) throw error
}

export async function getActiveCall(householdId: string): Promise<ActiveCall | null> {
  const { data, error } = await supabase.rpc('active_call', { hh: householdId })
  if (error) throw error
  const rij = Array.isArray(data) ? data[0] : data
  return (rij ?? null) as ActiveCall | null
}

/** De status van één gesprek. Voor de beller: geweigerd, gemist of gedaan. */
export async function getCallStatus(callId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('call')
    .select('status')
    .eq('id', callId)
    .maybeSingle()
  if (error) return null
  return (data?.status as string | undefined) ?? null
}

/**
 * "Bel me eens."
 *
 * Bellen gaat in deze app maar één kant op: familie belt, de tablet rinkelt
 * en neemt op. Vanaf haar kant is dit de weg — een vraag in plaats van een
 * gesprek. Familie krijgt een melding en belt.
 *
 * Hoogstens één melding per tien minuten, maar dat regelt de database. Zij
 * krijgt altijd te horen dat het gelukt is: wie onzeker is drukt nog eens,
 * en "je hebt net al gevraagd" helpt dan niemand.
 */
export async function vraagGesprek(householdId: string) {
  const { error } = await supabase.rpc('vraag_gesprek', { hh: householdId })
  if (error) throw error
}
