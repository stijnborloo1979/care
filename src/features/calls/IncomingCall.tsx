import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { answerCall, endCall, getActiveCall } from '../../services/calls'
import { supabase } from '../../lib/supabase'
import CallScreen from './CallScreen'
import { useHousehold } from '../household/useHousehold'

const AUTO_NA = 5

/**
 * Een inkomende oproep aanvaarden is precies wat mensen met
 * geheugenproblemen niet lukt: het toestel rinkelt, en ze weten niet waar
 * te drukken. Daarom neemt de app na vijf seconden zelf op, met een
 * aftelling die zichtbaar is en een knop om het tegen te houden.
 */
export default function IncomingCall({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient()
  const [inGesprek, setInGesprek] = useState<string | null>(null)
  const [aftellen, setAftellen] = useState(AUTO_NA)
  const [gestopt, setGestopt] = useState(false)
  const { household } = useHousehold()
  // Automatisch opnemen hoort bij de ondersteunde fase. Wie zelfstandig is,
  // beslist zelf of hij opneemt — anders voelt het als binnenvallen.
  const autoOpnemen = household?.support_level === 'ondersteund'

  const { data: oproep } = useQuery({
    queryKey: ['active-call', householdId],
    queryFn: () => getActiveCall(householdId),
    enabled: !!householdId,
    refetchInterval: 10_000,
  })

  // Realtime, zodat het toestel binnen een seconde rinkelt in plaats van
  // bij de volgende poll.
  useEffect(() => {
    if (!householdId) return
    const kanaal = supabase
      .channel(`calls:${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'call', filter: `household_id=eq.${householdId}` },
        () => queryClient.invalidateQueries({ queryKey: ['active-call', householdId] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(kanaal)
    }
  }, [householdId, queryClient])

  const rinkelt = oproep?.status === 'ringing' && !inGesprek

  useEffect(() => {
    if (!rinkelt) {
      setAftellen(AUTO_NA)
      setGestopt(false)
      return
    }
    if (gestopt || !autoOpnemen) return

    const id = window.setInterval(() => setAftellen((v) => v - 1), 1000)
    return () => window.clearInterval(id)
  }, [rinkelt, gestopt, autoOpnemen])

  useEffect(() => {
    if (autoOpnemen && rinkelt && !gestopt && aftellen <= 0 && oproep) {
      opnemen(oproep.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aftellen, rinkelt, gestopt])

  async function opnemen(id: string) {
    await answerCall(id)
    setInGesprek(id)
    queryClient.invalidateQueries({ queryKey: ['active-call', householdId] })
  }

  async function weigeren(id: string) {
    await endCall(id, 'declined')
    queryClient.invalidateQueries({ queryKey: ['active-call', householdId] })
  }

  if (inGesprek) {
    return (
      <CallScreen
        callId={inGesprek}
        rol="ontvanger"
        metWie={oproep?.caller_name ?? 'Familie'}
        onKlaar={() => {
          setInGesprek(null)
          queryClient.invalidateQueries({ queryKey: ['active-call', householdId] })
        }}
      />
    )
  }

  if (!rinkelt || !oproep) return null

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-accent-soft px-6 text-center">
      <p className="text-6xl" aria-hidden="true">
        📹
      </p>
      <div>
        <p className="text-4xl font-extrabold tracking-tight">{oproep.caller_name ?? 'Familie'}</p>
        <p className="mt-2 text-2xl text-ink-soft">belt je</p>
      </div>

      <button
        onClick={() => opnemen(oproep.id)}
        className="min-h-[5rem] w-full max-w-sm rounded-card bg-accent-ink text-2xl font-bold text-white"
      >
        Opnemen
      </button>

      {!gestopt && autoOpnemen ? (
        <p className="text-lg text-ink-soft">
          Het gesprek begint vanzelf over {Math.max(0, aftellen)} seconden.{' '}
          <button onClick={() => setGestopt(true)} className="underline underline-offset-4">
            Wachten
          </button>
        </p>
      ) : null}

      <button
        onClick={() => weigeren(oproep.id)}
        className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-6 text-lg font-semibold"
      >
        Nu niet
      </button>
    </div>
  )
}
