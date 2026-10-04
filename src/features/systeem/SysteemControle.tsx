import { useQuery } from '@tanstack/react-query'
import { CircleCheck, TriangleAlert, Wrench } from 'lucide-react'
import { ontbrekend, systeemControle } from './systeem'
import { tt } from '../../lib/uiTaal'

/**
 * Welke updates van de database ontbreken. Voor de beheerder: een vergeten
 * migratie geeft elders een fout zonder uitleg; hier staat welke het is.
 */
export default function SysteemControle() {
  const q = useQuery({ queryKey: ['systeem-controle'], queryFn: systeemControle, staleTime: 60_000, retry: false })
  if (q.isLoading) return null
  const lijst = q.data
  const mist = lijst ? ontbrekend(lijst) : []

  return (
    <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby="systeem-kop">
      <h2 id="systeem-kop" className="flex items-center gap-2 text-lg font-bold">
        <Wrench size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Systeemcontrole')}
      </h2>
      {lijst === null ? (
        <p className="mt-2 text-ink-soft">
          {tt('Draai in Supabase de update')} <code className="rounded bg-surface-soft px-1">76_systeemcontrole.sql</code>;{' '}
          {tt('dan zie je hier welke andere updates nog ontbreken.')}
        </p>
      ) : q.isError ? (
        <p className="mt-2 text-ink-soft">{tt('De controle lukte nu niet. Probeer het later opnieuw.')}</p>
      ) : mist.length === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-ink-soft">
          <CircleCheck size={18} strokeWidth={1.75} className="text-accent-ink" aria-hidden="true" />
          {tt('Alle {n} updates van de database staan erin.', { n: lijst?.length ?? 0 })}
        </p>
      ) : (
        <>
          <p className="mt-2 flex items-start gap-2">
            <TriangleAlert size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-alert" aria-hidden="true" />
            <span>
              {mist.length === 1 ? tt('Eén update ontbreekt.') : tt('{n} updates ontbreken.', { n: mist.length })}{' '}
              {tt('Draai ze in Supabase, in deze volgorde. Tot dan werken deze onderdelen niet of maar half.')}
            </span>
          </p>
          <ul className="mt-3 space-y-1.5">
            {mist.map((c) => (
              <li key={c.migratie} className="flex items-center gap-3 rounded-2xl bg-surface-soft px-4 py-2">
                <span className="w-10 shrink-0 font-bold tabular-nums">{String(c.migratie).padStart(2, '0')}</span>
                <span className="min-w-0">{c.onderdeel}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
