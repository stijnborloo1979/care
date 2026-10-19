import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganisatie } from './useOrganisatie'
import { maakZorgTaak, zetZorgTaakAfgevinkt, zorgTaken } from './zorgApi'
import { Fout, Kaart, Kop, Laden, Leeg, knop, label, veld } from './ui'
import { tt } from '../../lib/uiTaal'

/**
 * Taken van één afdeling. Medewerkers op de afdeling zien ze en vinken ze
 * af; coördinator en beheerder maken ze aan. De persoon en de familie zien
 * deze taken niet.
 */
export default function AfdelingTaken() {
  const { org, beheert } = useOrganisatie()
  const queryClient = useQueryClient()
  const afdelingen = org?.afdelingen ?? []
  const [gekozen, setGekozen] = useState<string | null>(null)
  const afdeling = afdelingen.find((a) => a.id === gekozen) ?? afdelingen[0] ?? null
  const [titel, setTitel] = useState('')
  const [notitie, setNotitie] = useState('')

  const taken = useQuery({
    queryKey: ['zorg', 'taken', afdeling?.id],
    enabled: !!org && !!afdeling,
    queryFn: () => zorgTaken(org!.org_id, afdeling!.id),
  })
  const ververs = () => queryClient.invalidateQueries({ queryKey: ['zorg', 'taken', afdeling?.id] })

  const maak = useMutation({
    mutationFn: () => maakZorgTaak(org!.org_id, afdeling!.id, titel, notitie),
    onSuccess: () => {
      setTitel('')
      setNotitie('')
      ververs()
    },
  })
  const vink = useMutation({
    mutationFn: ({ id, aan }: { id: string; aan: boolean }) => zetZorgTaakAfgevinkt(id, aan),
    onSuccess: ververs,
  })

  if (!org || !afdeling) return <Laden />
  const open = (taken.data ?? []).filter((t) => !t.done_at)
  const klaar = (taken.data ?? []).filter((t) => t.done_at)

  return (
    <div className="space-y-6">
      <Kop titel={tt('Taken')} uitleg={tt('Wat er op deze afdeling gedaan moet worden.')} />

      {afdelingen.length > 1 ? (
        <label className="block max-w-xs">
          <span className={label}>{tt('Afdeling')}</span>
          <select value={afdeling.id} onChange={(e) => setGekozen(e.target.value)} className={veld}>
            {afdelingen.map((a) => (
              <option key={a.id} value={a.id}>{a.naam}</option>
            ))}
          </select>
        </label>
      ) : null}

      {beheert ? (
        <Kaart titel={tt('Nieuwe taak')}>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (titel.trim()) maak.mutate()
            }}
            className="grid gap-3"
          >
            <label>
              <span className={label}>{tt('Wat moet er gebeuren?')}</span>
              <input required maxLength={200} value={titel} onChange={(e) => setTitel(e.target.value)} className={veld} />
            </label>
            <label>
              <span className={label}>{tt('Notitie (optioneel)')}</span>
              <textarea maxLength={2000} value={notitie} onChange={(e) => setNotitie(e.target.value)} className={veld} rows={2} />
            </label>
            <div>
              <button type="submit" disabled={!titel.trim() || maak.isPending} className={knop}>
                {tt('Taak toevoegen')}
              </button>
            </div>
          </form>
          <Fout fout={maak.error} />
        </Kaart>
      ) : null}

      <Kaart titel={tt('Open')}>
        {taken.isLoading ? <Laden /> : null}
        {taken.data && open.length === 0 ? <Leeg>{tt('Geen open taken.')}</Leeg> : null}
        <ul className="space-y-2">
          {open.map((t) => (
            <li key={t.id}>
              <label className="flex min-h-touch cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 accent-accent-ink"
                  checked={false}
                  disabled={vink.isPending}
                  onChange={() => vink.mutate({ id: t.id, aan: true })}
                />
                <span>
                  <span className="block font-semibold">{t.title}</span>
                  {t.note ? <span className="block text-sm text-ink-soft">{t.note}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Fout fout={vink.error} />
      </Kaart>

      {klaar.length > 0 ? (
        <Kaart titel={tt('Afgevinkt')}>
          <ul className="space-y-2 text-ink-soft">
            {klaar.map((t) => (
              <li key={t.id} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-accent-ink"
                  checked
                  disabled={vink.isPending}
                  onChange={() => vink.mutate({ id: t.id, aan: false })}
                  aria-label={tt('Weer open zetten: {taak}', { taak: t.title })}
                />
                <span className="line-through">{t.title}</span>
              </li>
            ))}
          </ul>
        </Kaart>
      ) : null}
    </div>
  )
}
