import { supabase } from '../lib/supabase'

export interface ShoppingItem {
  id: string
  household_id: string
  name: string
  done_at: string | null
  created_at: string
}

/** Open producten eerst; wat gekocht is nog één dag zichtbaar. */
export async function getShopping(householdId: string): Promise<ShoppingItem[]> {
  const gisteren = new Date(Date.now() - 24 * 3600_000).toISOString()
  const { data, error } = await supabase
    .from('shopping_item')
    .select('id, household_id, name, done_at, created_at')
    .eq('household_id', householdId)
    .or(`done_at.is.null,done_at.gte.${gisteren}`)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as ShoppingItem[]
}

export async function setBought(id: string, bought: boolean) {
  const { error } = await supabase
    .from('shopping_item')
    .update({ done_at: bought ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

export async function deleteShoppingItem(id: string) {
  const { error } = await supabase.from('shopping_item').delete().eq('id', id)
  if (error) throw error
}

/** Via de begrensde RPC: dubbels en herhaalde acties komen er niet bij. */
export async function addShoppingItems(householdId: string, namen: string[], actieId: string | null = null) {
  const { data, error } = await supabase.rpc('voice_add_shopping', {
    hh: householdId,
    namen,
    action_id: actieId,
  })
  if (error) throw error
  return (data as number | null) ?? 0
}
