import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useOrganisatie } from './useOrganisatie'
import { huidigeDienst, registreerSpraakVraag, spraakAan, zorgTaken } from './zorgApi'
import { antwoordDienst, antwoordOpenTaken } from './spraakAntwoord'
import { Fout, knopRustig } from './ui'
import { tt } from '../../lib/uiTaal'

/**
 * Vaste vragen, zonder spraak en zonder taalmodel. Alleen zichtbaar als
 * de organisatie én de medewerker het hebben aangezet. Er wordt alleen
 * vastgelegd welk soort vraag is gesteld.
 */
export default function SpraakVraag() {
  const { org } = useOrganisatie()
  const [antwoord, setAntwoord] = useState<string | null>(null)
  const aan = useQuery({ queryKey: ['zorg', 'spraak-aan', org?.org_id], enabled: !!org, queryFn: () => spraakAan(org!.org_id) })
  const afdeling = org?.afdelingen?.[0]?.id
  const taken = useQuery({
    queryKey: ['zorg', 'spraak-taken', afdeling],
    enabled: !!org && !!afdeling,
    queryFn: () => zorgTaken(org!.org_id, afdeling!),
  })

  const vraag = useMutation({
    mutationFn: async (soort: 'tijd_dienst' | 'open_taken') => {
      const mag = await registreerSpraakVraag(org!.org_id, soort)
      if (!mag) return tt('Deze vraag staat uit.')
      if (soort === 'tijd_dienst') return antwoordDienst(huidigeDienst())
      return antwoordOpenTaken(taken.data ?? [])
    },
    onSuccess: setAntwoord,
  })

  if (!org || !aan.data) return null
  return (
    <section className="rounded-card bg-surface p-5 shadow-card" aria-label={tt('Vraag stellen')}>
      <p className="font-bold">{tt('Vraag stellen')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => vraag.mutate('tijd_dienst')} disabled={vraag.isPending} className={knopRustig}>
          {tt('Welke dienst is het nu?')}
        </button>
        {afdeling ? (
          <button onClick={() => vraag.mutate('open_taken')} disabled={vraag.isPending} className={knopRustig}>
            {tt('Welke taken zijn er open?')}
          </button>
        ) : null}
      </div>
      {antwoord ? <p role="status" className="mt-3 text-ink-soft">{antwoord}</p> : null}
      <Fout fout={vraag.error} />
    </section>
  )
}
