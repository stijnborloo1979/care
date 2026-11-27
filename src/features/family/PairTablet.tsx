import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Tablet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { tt } from '../../lib/uiTaal'
import { useHousehold } from '../household/useHousehold'
import { useMag } from '../../core/access/useAccess'
import { useOntkoppelTablet } from './useOntkoppelTablet'

/**
 * Familie maakt hier een code, en tikt die in op de tablet onder
 * "Dit is de tablet van de persoon". Tien minuten geldig, één keer.
 */
export default function PairTablet({
  householdId,
  personName,
}: {
  householdId: string
  personName: string
}) {
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null)
  const [rest, setRest] = useState(0)
  const { household } = useHousehold()
  const isBeheerder = useMag(householdId, 'membership.manage', household?.role === 'admin')
  const ontkoppel = useOntkoppelTablet(householdId)

  // Is er nu een tablet gekoppeld? Dat is het lidmaatschap 'person'.
  const { data: tablet } = useQuery({
    queryKey: ['tablet', householdId],
    enabled: !!householdId,
    queryFn: async (): Promise<{ profile_id: string } | null> => {
      const { data, error } = await supabase
        .from('membership')
        .select('profile_id')
        .eq('household_id', householdId)
        .eq('role', 'person')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  const maak = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_pairing_code', { hh: householdId })
      if (error) throw error
      const rij = Array.isArray(data) ? data[0] : data
      return rij as { code: string; expires_at: string }
    },
    onSuccess: (r) => setCode(r),
  })

  useEffect(() => {
    if (!code) return
    const tik = () =>
      setRest(Math.max(0, Math.round((new Date(code.expires_at).getTime() - Date.now()) / 1000)))
    tik()
    const id = window.setInterval(tik, 1000)
    return () => window.clearInterval(id)
  }, [code])

  const verlopen = code && rest <= 0
  const [uitlegVoor, uitlegNa] = tt(
    'Open LifeAngle op de tablet van {naam}, kies {knop}, en tik daar deze code in. {naam} hoeft geen mail of wachtwoord te hebben.',
    { naam: personName },
  ).split('{knop}')

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent-soft text-accent-ink">
          <Tablet size={20} strokeWidth={1.75} />
        </span>
        <h2 className="text-lg font-bold">{tt('Tablet koppelen')}</h2>
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        {uitlegVoor}
        <em>{tt('Dit is de tablet van de persoon')}</em>
        {uitlegNa}
      </p>

      {tablet ? (
        <div className="mt-5 rounded-2xl bg-surface-soft p-4">
          <p className="font-semibold">{tt('Er is een tablet gekoppeld.')}</p>
          <p className="mt-1 text-sm text-ink-soft">
            {tt('Kwijt, stuk of weggegeven? Ontkoppel hem hier. Elk toestel dat als {naam} aangemeld is, wordt afgemeld.', { naam: personName })}
          </p>
          {isBeheerder ? (
            <button
              onClick={() => {
                if (confirm(tt('De tablet van {naam} ontkoppelen? Daarna toont hij niets meer tot je hem opnieuw koppelt.', { naam: personName })))
                  ontkoppel.mutate(tablet.profile_id)
              }}
              disabled={ontkoppel.isPending}
              className="mt-3 flex min-h-touch w-full items-center justify-center rounded-pill border-[1.5px] border-line-strong bg-surface px-5 font-semibold disabled:opacity-60"
            >
              {ontkoppel.isPending ? tt('Bezig…') : tt('Tablet ontkoppelen')}
            </button>
          ) : (
            <p className="mt-2 text-sm text-ink-soft">{tt('Alleen de familiebeheerder kan de tablet ontkoppelen.')}</p>
          )}
        </div>
      ) : ontkoppel.isSuccess ? (
        <p className="mt-5 text-sm font-semibold text-accent-ink">
          {tt('Ontkoppeld. Het staat in het zorglogboek.')}
        </p>
      ) : null}

      {ontkoppel.error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {ontkoppel.error instanceof Error ? ontkoppel.error.message : tt('Ontkoppelen lukte niet.')}
        </p>
      ) : null}

      {code && !verlopen ? (
        <div className="mt-5 rounded-2xl bg-accent-soft p-5 text-center">
          <p className="font-mono text-4xl font-bold tracking-[0.2em] text-accent-ink">
            {code.code.slice(0, 4)} {code.code.slice(4)}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            {tt('Nog {tijd} geldig', { tijd: `${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, '0')}` })}
          </p>
        </div>
      ) : null}

      <button
        onClick={() => maak.mutate()}
        disabled={maak.isPending}
        className="mt-5 flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
      >
        {maak.isPending ? tt('Bezig…') : code ? tt('Nieuwe code') : tt('Code maken')}
      </button>

      {maak.error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {maak.error instanceof Error ? maak.error.message : tt('Code maken lukte niet.')}
        </p>
      ) : null}
    </section>
  )
}
