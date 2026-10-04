import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { maakOrganisatie } from './zorgApi'
import { useOrganisatie } from './useOrganisatie'
import { Fout, knop, label, veld } from './ui'
import { tt } from '../../lib/uiTaal'

/**
 * Een woonzorgcentrum registreren. Wie dit doet, wordt er beheerder van.
 * Medewerkers komen er daarna bij op uitnodiging; bewoners via de familie.
 */
export default function NieuweOrganisatie() {
  const { org, isLoading } = useOrganisatie()
  const [naam, setNaam] = useState('')
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const maak = useMutation({
    mutationFn: () => maakOrganisatie(naam),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['organisaties'], type: 'all' })
      navigate('/zorg/beheer', { replace: true })
    },
  })

  if (isLoading) return <p className="p-6 text-ink-soft">{tt('Even geduld…')}</p>
  // Wie al ergens werkt en hier per ongeluk landt, gaat gewoon naar zijn scherm.
  if (org && !maak.isPending) return <Navigate to="/zorg" replace />

  return (
    <main className="mx-auto max-w-[32rem] px-5 py-10">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-ink">
        <Building2 size={28} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-[1.9rem] font-extrabold leading-tight tracking-tight">{tt('Een woonzorgcentrum registreren')}</h1>
      <p className="mt-2 text-lg text-ink-soft">
        {tt('Je wordt beheerder. Daarna nodig je medewerkers uit en krijg je een code voor de familie van je bewoners.')}
      </p>
      <p className="mt-2 text-ink-soft">
        {tt('Werk je in een woonzorgcentrum dat al LifeAngle gebruikt? Dan heb je een uitnodiging nodig van je beheerder.')}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (naam.trim()) maak.mutate()
        }}
        className="mt-6"
      >
        <label className="block">
          <span className={label}>{tt('Naam van het woonzorgcentrum')}</span>
          <input required value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={tt('WZC De Linde')} className={veld} />
        </label>
        <button type="submit" disabled={!naam.trim() || maak.isPending} className={`${knop} mt-4 w-full text-lg`}>
          {maak.isPending ? tt('Bezig…') : tt('Registreren')}
        </button>
        <Fout fout={maak.error} />
      </form>

      <Link to="/" className="mt-6 block text-center font-semibold text-ink-faint underline underline-offset-4">
        {tt('Terug')}
      </Link>
    </main>
  )
}
