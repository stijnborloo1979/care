import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { tt } from '../../lib/uiTaal'
import { KNOP_KLEUREN, KNOP_IDS, schoneKnopKleuren, type KnopId, type KnopKleuren } from './paletten'

/**
 * Per knop van het scherm met grote knoppen een kleur kiezen.
 *
 * Eén rij per knop, met de twaalf vaste kleuren ernaast. Een kleur die bij
 * de knop hoort, staat in het huishouden; "Standaard" haalt hem weg. De
 * database (migratie 89) weigert alles wat niet in de lijst staat.
 *
 * Alleen familie of het WZC ziet dit. De persoon zelf krijgt het scherm
 * nooit te zien.
 */

const KNOP_NAMEN: Record<KnopId, () => string> = {
  nu: () => tt('Wat moet ik nu doen?'),
  vandaag: () => tt('Vandaag'),
  wie: () => tt('Wie komt er?'),
  memory: () => tt('Waar ligt het?'),
  fotos: () => tt("Foto's"),
  radio: () => tt('Radio'),
  help: () => tt('Help'),
}

/*
 * De namen staan als losse tt()-aanroepen, zodat de vertaaltest ze ziet en
 * ze in elke taal een naam hebben. Een dynamische tt(variabele) zou stil
 * de Nederlandse naam tonen.
 */
function kleurNaam(hex: string): string {
  switch (hex) {
    case '#0f5d63': return tt('Petrol')
    case '#1d6b63': return tt('Linde')
    case '#2f6b3a': return tt('Bos')
    case '#1f4e79': return tt('Blauw')
    case '#17568f': return tt('Zee')
    case '#2b3f8f': return tt('Indigo')
    case '#66409a': return tt('Paars')
    case '#7a2f5e': return tt('Pruim')
    case '#9a4a2a': return tt('Roest')
    case '#7a5a12': return tt('Oker')
    case '#5c1f08': return tt('Bruin')
    case '#1f1d1a': return tt('Inkt')
    default: return hex
  }
}

interface Weergave {
  knoppenKleuren?: KnopKleuren
}

export function KnopKleuren({ hh }: { hh: string }) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['weergave', hh],
    enabled: !!hh,
    queryFn: async (): Promise<Weergave | null> => {
      const { data, error } = await supabase.rpc('effective_weergave', { hh })
      if (error) throw error
      return (data as Weergave | null) ?? null
    },
  })

  const huidig: KnopKleuren = schoneKnopKleuren(data?.knoppenKleuren)

  const zet = useMutation({
    mutationFn: async (kleuren: KnopKleuren) => {
      // De functie vervangt het hele object: we sturen de volledige lijst.
      const { error } = await supabase.rpc('set_weergave', {
        hh,
        prefs: { knoppenKleuren: schoneKnopKleuren(kleuren) },
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weergave', hh] })
      qc.invalidateQueries({ queryKey: ['prefs', hh] })
    },
  })

  function kies(id: KnopId, hex: string | null) {
    const nieuw: KnopKleuren = { ...huidig }
    if (hex === null) delete nieuw[id]
    else nieuw[id] = hex
    zet.mutate(nieuw)
  }

  if (isLoading) return null

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        {tt('Kies per knop een kleur. De indeling verandert niet.')}
      </p>

      <ul className="space-y-4">
        {KNOP_IDS.map((id) => {
          const gekozen = huidig[id]
          return (
            <li key={id} className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-base font-semibold text-ink">{KNOP_NAMEN[id]()}</span>
                {gekozen ? (
                  <button
                    type="button"
                    onClick={() => kies(id, null)}
                    disabled={zet.isPending}
                    className="min-h-[2.5rem] rounded-pill px-4 text-sm font-semibold text-accent-ink underline disabled:opacity-60"
                  >
                    {tt('Standaard')}
                  </button>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2" role="group" aria-label={KNOP_NAMEN[id]()}>
                {KNOP_KLEUREN.map((k) => {
                  const actief = gekozen === k.hex
                  return (
                    <button
                      key={k.hex}
                      type="button"
                      onClick={() => kies(id, k.hex)}
                      disabled={zet.isPending}
                      aria-pressed={actief}
                      aria-label={kleurNaam(k.hex)}
                      title={kleurNaam(k.hex)}
                      className={`h-11 w-11 rounded-full border-2 disabled:opacity-60 ${
                        actief ? 'border-ink ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'border-line'
                      }`}
                      style={{ backgroundColor: k.hex }}
                    />
                  )
                })}
              </div>
            </li>
          )
        })}
      </ul>

      {zet.error ? (
        <p role="alert" className="text-sm font-semibold text-alert">
          {tt('Dat lukte nu niet. Probeer het later nog eens.')}
        </p>
      ) : null}
    </div>
  )
}
