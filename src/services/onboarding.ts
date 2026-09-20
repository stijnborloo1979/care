import { supabase } from '../lib/supabase'

export const STANDAARD_KAMERS = [
  { name: 'Woonkamer', emoji: '🛋️' },
  { name: 'Keuken', emoji: '🍳' },
  { name: 'Slaapkamer', emoji: '🛏️' },
  { name: 'Badkamer', emoji: '🚿' },
  { name: 'Garage', emoji: '🚗' },
  { name: 'Tuin', emoji: '🌿' },
]

export const STANDAARD_OCHTEND = [
  { at: '07:30', title: 'Opstaan' },
  { at: '08:00', title: 'Ontbijten' },
  { at: '08:30', title: 'Medicatie nemen' },
  { at: '12:30', title: 'Lunch' },
  { at: '18:00', title: 'Avondeten' },
]

export async function createHousehold(personName: string, address: string): Promise<string> {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Brussels'
  const { data, error } = await supabase.rpc('create_household', {
    person_name: personName,
    tz,
    address: address || null,
  })
  if (error) throw error
  return data as string
}

export async function addPersonCards(
  householdId: string,
  mensen: { name: string; relation: string; phone: string }[],
) {
  const rijen = mensen
    .filter((m) => m.name.trim())
    .map((m, i) => ({
      household_id: householdId,
      name: m.name.trim(),
      relation: m.relation.trim() || 'Familie',
      phone: m.phone.trim() || null,
      description: `${m.name.trim()} is je ${(m.relation.trim() || 'familie').toLowerCase()}.`,
      kind: 'family',
      sort: i + 1,
    }))
  if (rijen.length === 0) return
  const { error } = await supabase.from('person_card').insert(rijen)
  if (error) throw error
}

export async function createRooms(householdId: string, namen: string[]) {
  const rijen = namen.map((naam, i) => {
    const std = STANDAARD_KAMERS.find((k) => k.name === naam)
    return { household_id: householdId, name: naam, emoji: std?.emoji ?? '🚪', sort: i }
  })
  if (rijen.length === 0) return []
  const { data, error } = await supabase.from('room').insert(rijen).select('id, name')
  if (error) throw error
  return (data ?? []) as { id: string; name: string }[]
}

export async function createRoutine(
  householdId: string,
  name: string,
  steps: { at: string; title: string }[],
) {
  const { data, error } = await supabase
    .from('routine')
    .insert({ household_id: householdId, name, emoji: '🔁', rrule: 'FREQ=DAILY' })
    .select('id')
    .single()
  if (error) throw error
  const routineId = (data as { id: string }).id

  const rijen = steps
    .filter((s) => s.at && s.title.trim())
    .map((s, i) => ({
      routine_id: routineId,
      household_id: householdId,
      at_time: s.at,
      title: s.title.trim(),
      sort: i,
    }))
  if (rijen.length > 0) {
    const { error: stepError } = await supabase.from('routine_step').insert(rijen)
    if (stepError) throw stepError
  }

  // Meteen toepassen, anders is het eerste scherm dat iemand ziet leeg.
  const vandaag = new Date().toISOString().slice(0, 10)
  await supabase.rpc('materialise_day', { hh: householdId, on_day: vandaag })
  await supabase.rpc('materialise_day', { hh: householdId, on_day: nieuweDag(vandaag) })

  return routineId
}

function nieuweDag(iso: string) {
  const d = new Date(iso)
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export async function addFirstItem(p: {
  householdId: string
  roomId: string
  name: string
  where: string
  steps: string[]
}) {
  const { data, error } = await supabase
    .from('item')
    .insert({
      household_id: p.householdId,
      room_id: p.roomId,
      name: p.name.trim(),
      emoji: '📦',
      where_text: p.where.trim(),
    })
    .select('id')
    .single()
  if (error) throw error
  const id = (data as { id: string }).id

  const rijen = p.steps
    .map((s) => s.trim())
    .filter(Boolean)
    .map((body, i) => ({ item_id: id, household_id: p.householdId, sort: i, body }))
  if (rijen.length > 0) {
    const { error: stepError } = await supabase.from('item_step').insert(rijen)
    if (stepError) throw stepError
  }
  return id
}
