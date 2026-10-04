import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FlaskConical, Sparkles } from 'lucide-react'
import { useOrganisatie } from './useOrganisatie'
import { demoRol, isDemo, maakDemo, wisDemo } from '../../services/importeren'
import { Fout, knop, knopKlein } from './ui'
import { tt } from '../../lib/uiTaal'

/** Een demo-woonzorgcentrum maken (of openen als het er al is) en erheen gaan. */
export function useDemoStart() {
  const queryClient = useQueryClient()
  const { kies } = useOrganisatie()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: maakDemo,
    onSuccess: async (id) => {
      await queryClient.refetchQueries({ queryKey: ['organisaties'], type: 'all' })
      kies(id)
      navigate('/zorg', { replace: true })
    },
  })
}

/** Knop: "Probeer met een demo-woonzorgcentrum". */
export function DemoKnop({ groot = false, onKlaar }: { groot?: boolean; onKlaar?: () => void }) {
  const start = useDemoStart()
  return (
    <>
      <button
        onClick={() => start.mutate(undefined, { onSuccess: () => onKlaar?.() })}
        disabled={start.isPending}
        className={groot ? `${knop} w-full text-lg` : 'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-semibold hover:bg-surface-soft'}
      >
        <Sparkles size={groot ? 20 : 16} strokeWidth={1.75} aria-hidden="true" />
        {start.isPending ? tt('Demo wordt klaargezet…') : tt('Demo-woonzorgcentrum openen')}
      </button>
      <Fout fout={start.error} />
    </>
  )
}

/**
 * Bovenaan elk scherm van een demo: wat dit is, wisselen tussen
 * coördinator en beheerder, en de demo opruimen.
 */
export function DemoBalk() {
  const { org, alle, kies } = useOrganisatie()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const orgId = org?.org_id ?? ''
  const demo = useQuery({ queryKey: ['zorg', 'is-demo', orgId], queryFn: () => isDemo(orgId), enabled: !!orgId, staleTime: Infinity })
  const [bezig, setBezig] = useState(false)
  const rol = useMutation({
    mutationFn: (r: 'org_admin' | 'coordinator') => demoRol(orgId, r),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['organisaties'], type: 'all' })
      queryClient.invalidateQueries({ queryKey: ['zorg'] })
    },
  })
  const wis = useMutation({
    mutationFn: () => wisDemo(orgId),
    onSuccess: async () => {
      const ander = alle.find((o) => o.org_id !== orgId)
      if (ander) kies(ander.org_id)
      await queryClient.refetchQueries({ queryKey: ['organisaties'], type: 'all' })
      queryClient.removeQueries({ queryKey: ['zorg'] })
      navigate(ander ? '/zorg' : '/', { replace: true })
    },
  })
  if (!org || !demo.data) return null

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border-[1.5px] border-dashed border-accent bg-accent-soft px-4 py-3 print:hidden">
      <span className="flex min-w-0 flex-1 items-center gap-2 font-semibold text-accent-ink">
        <FlaskConical size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
        {tt('Demo met verzonnen bewoners. Probeer gerust alles uit.')}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-soft">{tt('Bekijk als')}</span>
        {(['coordinator', 'org_admin'] as const).map((r) => (
          <button
            key={r}
            onClick={() => org.rol !== r && rol.mutate(r)}
            disabled={rol.isPending}
            aria-pressed={org.rol === r}
            className={`${knopKlein} ${org.rol === r ? '!border-accent-ink bg-accent-ink !text-white hover:bg-accent-ink' : ''}`}
          >
            {r === 'coordinator' ? tt('Coördinator') : tt('Beheerder')}
          </button>
        ))}
        <button
          onClick={() => {
            if (!bezig && confirm(tt('De demo en alle verzonnen bewoners wissen?'))) {
              setBezig(true)
              wis.mutate()
            }
          }}
          disabled={wis.isPending}
          className="px-2 text-sm font-semibold text-ink-soft underline underline-offset-4"
        >
          {tt('Demo wissen')}
        </button>
      </span>
      <Fout fout={rol.error ?? wis.error} />
    </div>
  )
}
