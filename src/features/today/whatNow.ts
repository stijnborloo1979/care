import type { AgendaEvent } from '../../services/agenda'
import { minutesBetween } from '../../lib/time'

export type Status = 'done' | 'now' | 'soon' | 'late' | 'later'

export interface Slot {
  current: AgendaEvent | null
  next: AgendaEvent | null
}

/** Het venster waarin iets "nu" is: een half uur voor tot ruim een uur na. */
const VOOR = 30
const NA = 75

/**
 * De kern van de app, bewust een pure functie: geen React, geen Supabase,
 * geen klok van zichzelf. Zo is ze testbaar met een vaste tijd, en dat is
 * nodig — dit is waar de hele app op staat of valt.
 */
export function whatNow(events: AgendaEvent[], now: Date): Slot {
  const open = events
    .filter((e) => !e.done_at)
    .slice()
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  const current =
    open.find((e) => {
      const verschil = minutesBetween(now, new Date(e.starts_at))
      return verschil <= VOOR && verschil > -NA
    }) ?? null

  const next =
    open.find((e) => new Date(e.starts_at) > now && e.id !== current?.id) ?? null

  return { current, next }
}

export function statusOf(event: AgendaEvent, now: Date): Status {
  if (event.done_at) return 'done'
  const verschil = minutesBetween(now, new Date(event.starts_at))
  if (verschil <= 25 && verschil > -60) return 'now'
  if (verschil > 0 && verschil <= 120) return 'soon'
  if (verschil <= 0) return 'late'
  return 'later'
}

export const STATUS_LABEL: Record<Status, string> = {
  done: 'gedaan',
  now: 'nu',
  soon: 'straks',
  late: 'voorbij',
  later: 'later',
}
