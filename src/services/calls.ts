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
 * De edge function meteen aanporren.
 *
 * push-notify hangt normaal aan pg_cron en draait dan elke vijf minuten.
 * Voor een melding uit de nacht is dat prima; voor "bel me eens" of "ik heb
 * hulp nodig" is vijf minuten lang, en zonder pg_cron gebeurt het nooit.
 *
 * Mislukt het, dan gebeurt er niets ergs: de melding staat al in de
 * database en gaat alsnog mee met de volgende ronde. Daarom geen
 * foutafhandeling — dit is een duwtje, geen voorwaarde.
 */
async function duwPush() {
  try {
    await supabase.functions.invoke('push-notify')
  } catch {
    // Niet ingesteld of niet bereikbaar. De cron vangt het op.
  }
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
  await duwPush()
}

/**
 * "Ik heb hulp nodig."
 *
 * Geen noodnummer en het mag er nooit voor doorgaan. Het is wat een toestel
 * zonder telefoon wél kan: familie meteen laten weten dat er iets is.
 * Niveau alert, hoogstens één melding per twee minuten.
 */
export async function vraagHulp(householdId: string) {
  const { error } = await supabase.rpc('vraag_hulp', { hh: householdId })
  if (error) throw error
  await duwPush()
}
