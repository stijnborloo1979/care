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
