import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CreditCard } from 'lucide-react'
import { STATUS, careRaming, euro, mijnAbonnement, publiekePrijzen } from './prijzen'
import { tt, uiLocale } from '../../lib/uiTaal'

/**
 * Jouw abonnement, voor de beheerder. Zolang er niets afgedwongen wordt,
 * zegt dit vooral eerlijk dat: je gebruikt alles, en je betaalt niets.
 * Voor een woonzorgcentrum: wat het zou kosten bij het huidige aantal bewoners.
 */
export default function JouwAbonnement({ soort, id, bewoners }: { soort: 'household_id' | 'org_id'; id: string; bewoners?: number }) {
  const abo = useQuery({ queryKey: ['abonnement', soort, id], queryFn: () => mijnAbonnement(soort, id), enabled: !!id, retry: false })
  const prijzen = useQuery({ queryKey: ['publieke-prijzen'], queryFn: publiekePrijzen, staleTime: 10 * 60_000, retry: false })
  const care = (prijzen.data ?? []).find((p) => p.id === 'care')
  const plan = (prijzen.data ?? []).find((p) => p.id === abo.data?.plan_id)

  return (
    <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby="abo-kop">
      <h2 id="abo-kop" className="flex items-center gap-2 text-lg font-bold">
        <CreditCard size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Jouw abonnement')}
      </h2>
      {abo.data ? (
        <p className="mt-2">
          <strong>{plan?.naam ?? abo.data.plan_id}</strong> · {STATUS[abo.data.status] ?? abo.data.status}
          {abo.data.trial_ends_at ? `, ${tt('tot {datum}', { datum: new Date(abo.data.trial_ends_at).toLocaleDateString(uiLocale()) })}` : ''}
        </p>
      ) : (
        <p className="mt-2 text-ink-soft">
          {tt('Je gebruikt alles van LifeAngle, en er wordt nog niets aangerekend.')}
        </p>
      )}
      {soort === 'org_id' && care && bewoners !== undefined && care.prijs_maand_cent ? (
        <p className="mt-2 text-ink-soft">
          {bewoners === 1
            ? tt('Met {n} bewoner zou Care {bedrag} per maand kosten', { n: bewoners, bedrag: euro(careRaming(care, bewoners)) })
            : tt('Met {n} bewoners zou Care {bedrag} per maand kosten', { n: bewoners, bedrag: euro(careRaming(care, bewoners)) })}
          {care.btw_inbegrepen ? '' : ` ${tt('(excl. btw)')}`}.
        </p>
      ) : null}
      <Link to="/prijzen" className="mt-3 inline-block font-semibold text-accent-ink underline underline-offset-4">
        {tt('Bekijk de prijzen')}
      </Link>
    </section>
  )
}
