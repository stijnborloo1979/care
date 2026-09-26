import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { getProfiel, LEEG, setProfiel, type Profiel } from '../../services/profiel'

const VELDEN: { sleutel: keyof Profiel; label: string; onder: string; voorbeeld: string }[] = [
  {
    sleutel: 'noemNaam',
    label: 'Hoe wil ze aangesproken worden?',
    onder: 'Niet iedereen heet voor iedereen hetzelfde.',
    voorbeeld: 'Marieke',
  },
  {
    sleutel: 'omgang',
    label: 'Zo praat je best met haar',
    onder: 'Wat jij vanzelf doet, weet een verpleegkundige op dag één niet.',
    voorbeeld: 'Traag praten, één vraag tegelijk. Ga links staan, daar hoort ze beter.',
  },
  {
    sleutel: 'rust',
    label: 'Als ze onrustig is, helpt dit',
    onder: 'Het belangrijkste veld van het hele blad.',
    voorbeeld: 'Muziek van vroeger opzetten. Even mee naar buiten. Niet tegenspreken.',
  },
  {
    sleutel: 'vermijden',
    label: 'Hier raakt ze van overstuur',
    onder: 'Even belangrijk, en vaak moeilijker op te schrijven.',
    voorbeeld: 'Veel mensen tegelijk. Als iemand zegt dat ze zich vergist.',
  },
  {
    sleutel: 'vrij',
    label: 'Nog iets dat ze moeten weten',
    onder: 'Wat hier niet in de vakjes past.',
    voorbeeld: 'Ze slaapt met het licht aan. Haar bril ligt altijd links naast het bed.',
  },
]

/**
 * De drie dingen die nergens anders in de app staan, plus een vrij veld.
 *
 * De rest van "Dit ben ik" komt uit wat er al is — familie, voorkeuren,
 * routines, het levensverhaal. Dit zijn de vragen die niemand stelt tot het
 * te laat is, en dan staat er iemand aan een bed die ze niet kan
 * beantwoorden.
 *
 * Eén veld tegelijk opslaan, bij het verlaten van het vakje. Zo kan familie
 * het in stukjes invullen, want in één keer doet niemand dit.
 */
export default function ProfielVelden() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const voornaam = household?.person_name.split(' ')[0] ?? 'zij'
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['profiel', hh],
    queryFn: () => getProfiel(hh),
    enabled: !!hh,
  })

  const [waarden, setWaarden] = useState<Profiel>(LEEG)
  useEffect(() => {
    if (data) setWaarden(data)
  }, [data])

  const bewaar = useMutation({
    mutationFn: (deel: Partial<Profiel>) => setProfiel(hh, deel),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profiel', hh] }),
  })

  const ingevuld = VELDEN.filter((v) => (waarden[v.sleutel] ?? '').trim()).length

  return (
    <section className="rounded-card bg-surface p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Dit ben ik</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-ink-soft">
            Eén blad dat meegaat naar het ziekenhuis of het woonzorgcentrum. Daar is {voornaam} op
            dag één een naam op een lijst; dit maakt er een mens van. De rest — familie,
            voorkeuren, haar dagindeling — haalt het blad uit wat hier al staat.
          </p>
        </div>

        <Link
          to="/dit-ben-ik"
          className="flex min-h-touch items-center rounded-pill bg-accent-ink px-5 font-bold text-white"
        >
          Bekijken en afdrukken
        </Link>
      </header>

      <div className="mt-5 space-y-5">
        {VELDEN.map((v) => (
          <label key={v.sleutel} className="block">
            <span className="font-semibold">{v.label}</span>
            <span className="block text-sm text-ink-soft">{v.onder}</span>
            <textarea
              value={waarden[v.sleutel] ?? ''}
              onChange={(e) => setWaarden({ ...waarden, [v.sleutel]: e.target.value })}
              onBlur={() => {
                const nu = (waarden[v.sleutel] ?? '').trim()
                if (nu !== (data?.[v.sleutel] ?? '').trim()) bewaar.mutate({ [v.sleutel]: nu })
              }}
              rows={v.sleutel === 'noemNaam' ? 1 : 2}
              placeholder={v.voorbeeld}
              className="mt-2 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
            />
          </label>
        ))}
      </div>

      <p aria-live="polite" className="mt-3 text-sm text-ink-soft">
        {bewaar.isPending
          ? 'Bezig met opslaan…'
          : bewaar.isError
            ? 'Niet opgeslagen — probeer opnieuw.'
            : `${ingevuld} van ${VELDEN.length} ingevuld. Het slaat vanzelf op.`}
      </p>
    </section>
  )
}
