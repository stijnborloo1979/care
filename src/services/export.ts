import { supabase } from '../lib/supabase'

// Alles wat de app over een huishouden bewaart. RLS bepaalt wat jij
// daarvan terugkrijgt: je exporteert nooit meer dan je in de app ziet.
const TABELLEN = [
  'household',
  'membership',
  'person_card',
  'agenda_event',
  'routine',
  'routine_step',
  'room',
  'item',
  'item_step',
  'memory_note',
  'memory_photo',
  'medication',
  'medication_log',
  'care_log',
  'document',
  'notification',
  'message',
  'quick_note',
  'life_story',
  'location_setting',
  'location_point',
  'radio_station',
  'call',
]

/**
 * Het recht op inzage uit de AVG: alles wat de app over jou en je
 * huishoudens bewaart, in één bestand. Foto's, opnames en documenten staan
 * erin als verwijzing; de bestanden zelf download je in de app.
 */
export async function exporteer(): Promise<Blob> {
  const { data: gebruiker } = await supabase.auth.getUser()
  const uid = gebruiker.user?.id

  const { data: profiel } = await supabase.from('profile').select('*').eq('id', uid ?? '').maybeSingle()

  const tabellen: Record<string, unknown[]> = {}
  const overgeslagen: string[] = []

  for (const t of TABELLEN) {
    const { data, error } = await supabase.from(t).select('*').limit(20_000)
    if (error) {
      // Een tabel die nog niet bestaat (migratie niet gedraaid) of waar je
      // geen toegang toe hebt: overslaan, niet de hele export laten mislukken.
      overgeslagen.push(t)
      continue
    }
    tabellen[t] = data ?? []
  }

  const inhoud = {
    uitleg:
      'Alle gegevens die Thuis bewaart en die jij mag zien. Bestanden (foto’s, opnames, documenten) staan hier als pad in de opslag; de bestanden zelf download je in de app.',
    geexporteerd_op: new Date().toISOString(),
    gebruiker: { id: uid, email: gebruiker.user?.email },
    profiel,
    tabellen,
    overgeslagen,
  }

  return new Blob([JSON.stringify(inhoud, null, 2)], { type: 'application/json' })
}

export async function verwijderAccount(ookHuishoudens: boolean) {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { verwijderHuishoudens: ookHuishoudens },
  })
  if (error) {
    const context = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
    const body = context?.json ? await context.json().catch(() => null) : null
    throw new Error(body?.error ?? 'Verwijderen lukte niet. Probeer het opnieuw.')
  }
  return data
}
