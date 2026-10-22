import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellRing } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { tt } from '../../lib/uiTaal'
import { useNow } from '../today/useAgenda'
import { alarmOpgevolgd, zorgAlarmen, type HulpAlarm } from './zorgApi'
import { herhaling, hoeLang, ietsNieuws, waar } from './hulpAlarmPuur'

/**
 * Een bewoner drukte op "Ik heb hulp nodig". Staat boven elk zorgscherm,
 * tot iemand "Ik ga" drukt: dan verdwijnt het bij iedereen van de afdeling
 * tegelijk, zodat er niet drie mensen lopen en niemand voor de volgende.
 *
 * Live via realtime, met elke halve minuut opnieuw ophalen als vangnet:
 * een tablet op de afdeling kan zijn verbinding verliezen zonder het te
 * merken, en dit is de lijst die niet stil mag vallen.
 */
export default function HulpAlarmen({ org }: { org: string }) {
  const queryClient = useQueryClient()
  const sleutel = ['zorg', 'alarmen', org]
  const nu = useNow()

  const { data } = useQuery({
    queryKey: sleutel,
    queryFn: () => zorgAlarmen(org),
    refetchInterval: 30_000,
    staleTime: 0,
  })

  useEffect(() => {
    const kanaal = supabase
      .channel(`alarm:${org}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'zorg_alarm', filter: `org_id=eq.${org}` },
        () => queryClient.invalidateQueries({ queryKey: ['zorg', 'alarmen', org] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(kanaal)
    }
  }, [org, queryClient])

  // Een kort signaal bij een nieuwe vraag of als er opnieuw gedrukt wordt.
  const vorige = useRef<HulpAlarm[] | undefined>(undefined)
  useEffect(() => {
    if (!data) return
    if (ietsNieuws(vorige.current, data)) piep()
    vorige.current = data
  }, [data])

  const ikGa = useMutation({
    mutationFn: alarmOpgevolgd,
    onSettled: () => queryClient.invalidateQueries({ queryKey: sleutel }),
  })

  const lijst = data ?? []
  if (lijst.length === 0) return null

  return (
    <section aria-labelledby="hulp-alarm" role="alert" className="mb-5 space-y-2">
      <h2 id="hulp-alarm" className="sr-only">
        {tt('Hulpvragen van bewoners')}
      </h2>
      {lijst.map((a) => (
        <div
          key={a.id}
          className="flex flex-wrap items-center gap-3 rounded-card border-2 border-alert bg-surface p-4 shadow-lift"
        >
          <BellRing size={28} strokeWidth={2} className="shrink-0 text-alert" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold">{tt('{naam} vraagt hulp', { naam: a.naam })}</p>
            <p className="text-ink-soft">
              {[waar(a), hoeLang(a.created_at, nu), herhaling(a.herhalingen)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            onClick={() => ikGa.mutate(a.id)}
            disabled={ikGa.isPending}
            className="min-h-touch rounded-pill bg-alert px-5 font-bold text-white disabled:opacity-60"
          >
            {tt('Ik ga')}
          </button>
        </div>
      ))}
      {ikGa.isError ? (
        <p className="font-semibold text-alert">{tt('Dat lukte niet. Probeer het opnieuw.')}</p>
      ) : null}
    </section>
  )
}

/** Twee korte tonen. Lukt het niet (geen aanraking sinds het laden, geen geluid), dan blijft het blok. */
function piep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctx()
    ;[0, 0.25].forEach((t) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.frequency.value = 880
      g.gain.setValueAtTime(0.2, ctx.currentTime + t)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + t)
      o.stop(ctx.currentTime + t + 0.2)
    })
    setTimeout(() => ctx.close(), 800)
  } catch {
    // geen geluid mogelijk: het blok bovenaan blijft het signaal
  }
}
