import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { tt } from '../../lib/uiTaal'
import { KIESBARE_TEGELS, schoneTegels, type KiesbareTegel } from './tegels'

/*
 * De namen staan als losse tt()-aanroepen, zodat de vertaaltest ze ziet.
 */
const TEGEL_NAMEN: Record<KiesbareTegel, () => string> = {
  wie: () => tt('Wie komt er?'),
  memory: () => tt('Waar ligt het?'),
  fotos: () => tt("Foto's"),
  radio: () => tt('Radio'),
  medicatie: () => tt('Medicijnen'),
  zoeken: () => tt('Zoeken'),
  praten: () => tt('Praat met mij'),
}

/**
 * Welke keuzetegels op het startscherm staan. Familie of het WZC kiest; de
 * persoon zelf kan het niet wijzigen (set_weergave weigert dat).
 */
export function TegelKeuze({ hh }: { hh: string }) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['tegels', hh],
    enabled: !!hh,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('effective_weergave', { hh })
      if (error) throw error
      return schoneTegels((data as { tegels?: unknown } | null)?.tegels)
    },
  })

  const zet = useMutation({
    mutationFn: async (nieuw: KiesbareTegel[]) => {
      const { error } = await supabase.rpc('set_weergave', { hh, prefs: { tegels: nieuw } })
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tegels', hh] })
      await qc.invalidateQueries({ queryKey: ['weergave', hh] })
      await qc.invalidateQueries({ queryKey: ['prefs', hh] })
    },
  })

  if (isLoading) return null
  // Null betekent: alles zichtbaar.
  const huidig: KiesbareTegel[] = data ?? [...KIESBARE_TEGELS]

  function wissel(id: KiesbareTegel) {
    const aan = huidig.includes(id)
    const nieuw = aan ? huidig.filter((x) => x !== id) : [...huidig, id]
    zet.mutate(KIESBARE_TEGELS.filter((x) => nieuw.includes(x)))
  }

  return (
    <section aria-labelledby="tegels-titel" className="space-y-4 rounded-card bg-surface p-5 shadow-card">
      <h3 id="tegels-titel" className="text-xl font-bold">
        {tt('Welke tegels er op het scherm staan')}
      </h3>
      <p className="text-base text-ink-soft">
        {tt('Vandaag, Help, Iets onthouden en Herinneringen staan altijd op het scherm.')}
      </p>
      <p className="text-base text-ink-soft">{tt('Zorgteam verschijnt zolang er een verblijf loopt.')}</p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {KIESBARE_TEGELS.map((id) => {
          const aan = huidig.includes(id)
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={aan}
                onClick={() => wissel(id)}
                disabled={zet.isPending}
                className={`min-h-touch w-full rounded-pill border-2 px-4 text-left text-base font-semibold ${
                  aan ? 'border-accent bg-accent-soft text-ink' : 'border-line text-ink-soft'
                }`}
              >
                {aan ? '✓ ' : ''}
                {TEGEL_NAMEN[id]()}
              </button>
            </li>
          )
        })}
      </ul>
      {zet.isError ? <p className="text-alert">{tt('Dat lukte nu niet. Probeer het later nog eens.')}</p> : null}
    </section>
  )
}
