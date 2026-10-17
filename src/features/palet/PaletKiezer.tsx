import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { tt } from '../../lib/uiTaal'
import { PALETTEN, paletNaam, paletVan, isPalet, type PaletId } from './paletten'

/**
 * Het kiezen van een kleurpalet, op twee plekken: voor het huishouden
 * (familie, en het WZC per bewoner) en voor de organisatie (het WZC-palet
 * dat geldt voor alle bewoners).
 *
 * Alleen kleuren. Deze keuze verandert nooit de indeling. Wie het niet
 * mag wijzigen, ziet het scherm niet: de database weigert het ook.
 */

interface KeuzeProps {
  waarde: PaletId | null
  /** Met een erf-keuze (null) krijgt het huishouden het palet van het WZC. */
  erfNaam?: string
  onKies: (palet: PaletId | null) => void
  bezig?: boolean
}

export function PaletKeuzes({ waarde, erfNaam, onKies, bezig }: KeuzeProps) {
  return (
    <div className="flex flex-wrap gap-3">
      {erfNaam !== undefined ? (
        <PaletKnop
          naam={erfNaam}
          kleur={null}
          actief={waarde === null}
          bezig={bezig}
          onKies={() => onKies(null)}
        />
      ) : null}
      {PALETTEN.map((p) => (
        <PaletKnop
          key={p.id}
          naam={paletNaam(p)}
          kleur={p.accent}
          actief={waarde === p.id}
          bezig={bezig}
          onKies={() => onKies(p.id)}
        />
      ))}
    </div>
  )
}

function PaletKnop({
  naam,
  kleur,
  actief,
  bezig,
  onKies,
}: {
  naam: string
  kleur: string | null
  actief: boolean
  bezig?: boolean
  onKies: () => void
}) {
  return (
    <button
      type="button"
      onClick={onKies}
      disabled={bezig}
      aria-pressed={actief}
      className={`flex min-h-[3rem] items-center gap-3 rounded-2xl border-2 px-4 text-base font-semibold text-ink disabled:opacity-60 ${
        actief ? 'border-accent bg-accent-soft' : 'border-line bg-surface'
      }`}
    >
      <span
        aria-hidden="true"
        className="h-6 w-6 rounded-full border border-line"
        style={{ background: kleur ?? 'repeating-linear-gradient(45deg,#bbb 0 4px,#fff 4px 8px)' }}
      />
      {naam}
      {actief ? <span className="sr-only">{tt('(gekozen)')}</span> : null}
    </button>
  )
}

/* ---------------------------------------------------------------------
   Het palet van een huishouden: familie kiest, en het WZC per bewoner.
   --------------------------------------------------------------------- */

interface Weergave {
  indeling: string
  palet: string
  paletEigen: string | null
}

export function HuisPalet({ hh, metWzc = false }: { hh: string; metWzc?: boolean }) {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['weergave', hh],
    enabled: !!hh,
    queryFn: async (): Promise<Weergave | null> => {
      const { data, error } = await supabase.rpc('effective_weergave', { hh })
      if (error) throw error
      return (data as Weergave | null) ?? null
    },
  })

  const zet = useMutation({
    mutationFn: async (palet: PaletId | null) => {
      const { error } = await supabase.rpc('set_weergave', { hh, prefs: { palet } })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weergave', hh] })
      qc.invalidateQueries({ queryKey: ['prefs', hh] })
    },
  })

  const eigen = data?.paletEigen ?? null
  const huidig = isPalet(eigen) ? eigen : null

  return (
    <div className="space-y-3">
      <PaletKeuzes
        waarde={huidig}
        erfNaam={metWzc ? tt('Zoals het woonzorgcentrum') : undefined}
        onKies={(p) => zet.mutate(p)}
        bezig={zet.isPending}
      />
      <p className="text-sm text-ink-soft">
        {huidig === null && metWzc
          ? tt('Nu het palet van het woonzorgcentrum.')
          : tt('Nu: {naam}.', { naam: paletNaam(paletVan(data?.palet)) })}
      </p>
      {zet.error ? (
        <p role="alert" className="text-sm font-semibold text-alert">
          {tt('Dat lukte nu niet. Probeer het later nog eens.')}
        </p>
      ) : null}
    </div>
  )
}

/* ---------------------------------------------------------------------
   Het standaardpalet van het woonzorgcentrum, voor alle bewoners.
   --------------------------------------------------------------------- */

export function WzcPalet({ orgId }: { orgId: string }) {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['org-palet', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.from('organisation').select('palet').eq('id', orgId).maybeSingle()
      if (error) throw error
      return (data as { palet: string | null } | null)?.palet ?? null
    },
  })

  const zet = useMutation({
    mutationFn: async (palet: PaletId | null) => {
      const { error } = await supabase.rpc('set_org_palet', { o: orgId, palet })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-palet', orgId] })
      // Bewoners die het WZC-palet erven, zien het bij hun volgende ophalen.
      qc.invalidateQueries({ queryKey: ['weergave'] })
    },
  })

  const huidig = isPalet(data) ? data : null

  return (
    <div className="space-y-3">
      <PaletKeuzes waarde={huidig} onKies={(p) => zet.mutate(p)} bezig={zet.isPending} />
      <p className="text-sm text-ink-soft">
        {tt('Dit palet geldt voor alle bewoners, tenzij familie of het WZC er per bewoner iets anders voor kiest.')}
      </p>
      {zet.error ? (
        <p role="alert" className="text-sm font-semibold text-alert">
          {tt('Dat lukte nu niet. Probeer het later nog eens.')}
        </p>
      ) : null}
    </div>
  )
}
