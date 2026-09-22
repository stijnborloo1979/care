import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPersonInbox } from '../messages/messages'
import { getActiveCall } from '../../services/calls'
import { hhmm } from '../../lib/time'
import { useLicht } from './lichtStore'

/**
 * Beslist wanneer het scherm oplicht: een nieuw bericht van familie, een
 * inkomende oproep. Herinneringen voor afspraken en medicatie komen van de
 * spraakherinneringen, die op hetzelfde moment afgaan.
 *
 * Alleen iets nieuws geeft licht. Een bericht dat al licht gaf en
 * weggetikt werd, doet dat niet opnieuw bij elke verversing.
 */
export function useLichtSignalen(householdId: string, tz: string, aan: boolean) {
  const { start, stop } = useLicht()
  const gezien = useRef<Set<string> | null>(null)

  const { data: inbox } = useQuery({
    queryKey: ['inbox', householdId],
    queryFn: () => getPersonInbox(householdId),
    enabled: !!householdId,
    refetchInterval: 60_000,
  })

  const { data: oproep } = useQuery({
    queryKey: ['active-call', householdId],
    queryFn: () => getActiveCall(householdId),
    enabled: !!householdId,
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (!inbox) return
    const ongelezen = inbox.filter((m) => !m.seen).map((m) => m.id)
    // De eerste keer onthouden we wat er al lag: bij het opstarten
    // hoort het scherm niet op te lichten voor een bericht van gisteren.
    if (gezien.current === null) {
      gezien.current = new Set(ongelezen)
      return
    }
    const nieuw = ongelezen.some((id) => !gezien.current!.has(id))
    ongelezen.forEach((id) => gezien.current!.add(id))
    if (nieuw && aan && !stil(tz)) start('bericht')
    if (ongelezen.length === 0) stop('bericht')
  }, [inbox, aan, tz, start, stop])

  useEffect(() => {
    // Een oproep geeft altijd licht, ook 's nachts: daar belt niemand
    // zomaar.
    if (oproep?.status === 'ringing' && aan) start('oproep')
    else stop('oproep')
  }, [oproep?.status, aan, start, stop])
}

/** 's Nachts geen licht voor gewone meldingen: een oplichtend scherm om drie uur maakt ongerust. */
export function stil(tz: string) {
  const uur = Number(hhmm(new Date(), tz).slice(0, 2))
  return uur >= 22 || uur < 7
}
