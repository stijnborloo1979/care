import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { beeindigVerblijf, type EindReden } from './zorgApi'
import { Fout, knop, knopRustig } from './ui'

const REDENEN: [EindReden, string][] = [
  ['verhuisd', 'Verhuisd'],
  ['overleden', 'Overleden'],
  ['andere', 'Andere reden'],
]

/**
 * Een verblijf afsluiten (71). Bewust twee stappen: eerst de knop, dan de
 * reden en een uitleg van wat er gebeurt. Niets van de familie wordt gewist.
 */
export default function VerblijfBeeindigen({ orgId, hh, naam }: { orgId: string; hh: string; naam: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reden, setReden] = useState<EindReden | null>(null)
  const sluit = useMutation({
    mutationFn: () => beeindigVerblijf(hh, reden!),
    onSuccess: () => {
      setOpen(false)
      for (const k of ['alle-bewoners', 'toewijzingen', 'mijn-bewoners'])
        queryClient.invalidateQueries({ queryKey: ['zorg', k, orgId] })
    },
  })

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-sm font-semibold text-ink-soft underline underline-offset-4">
        Verblijf beëindigen
      </button>
    )
  }

  return (
    <div className="mt-3 w-full rounded-2xl border border-line bg-surface-soft p-4">
      <p className="font-semibold">Het verblijf van {naam} beëindigen</p>
      <p className="mt-1 text-sm text-ink-soft">
        Het zorgteam verliest meteen de toegang en alle toewijzingen stoppen. De familie krijgt een melding en houdt al
        haar gegevens. Komt {naam} terug, dan koppelt de familie opnieuw met de koppelcode.
      </p>
      <fieldset className="mt-3">
        <legend className="text-sm font-semibold">Reden</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {REDENEN.map(([r, t]) => (
            <label
              key={r}
              className={`flex min-h-[2.5rem] cursor-pointer items-center gap-2 rounded-pill border px-4 text-sm font-semibold ${
                reden === r ? 'border-accent-ink bg-accent-soft text-accent-ink' : 'border-line bg-surface'
              }`}
            >
              <input type="radio" name={`reden-${hh}`} value={r} checked={reden === r} onChange={() => setReden(r)} className="sr-only" />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => sluit.mutate()} disabled={!reden || sluit.isPending} className={knop}>
          {sluit.isPending ? 'Bezig…' : 'Verblijf beëindigen'}
        </button>
        <button onClick={() => setOpen(false)} className={knopRustig}>
          Annuleren
        </button>
      </div>
      <Fout fout={sluit.error} />
    </div>
  )
}
