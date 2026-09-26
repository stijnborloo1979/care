import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { vraagHulp } from '../../services/calls'

/**
 * "Ik heb hulp nodig" — familie meteen laten weten.
 *
 * Dit is geen noodnummer en mag er nooit voor doorgaan. Het staat er omdat
 * een toestel zonder telefoon niet kan bellen, en omdat iemand die op Help
 * drukt wél iets moet kunnen doen dat écht gebeurt.
 *
 * Daarom is hij bewust niet rood en staat hij onder het 112-blok. Rood en
 * bovenaan zou hem tot noodknop maken, en dat is hij niet. Wat hij wel
 * doet, zegt hij letterlijk: familie krijgt een bericht.
 *
 * Na het drukken verdwijnt de knop niet. Wie ongerust is, drukt nog eens;
 * de wachttijd van twee minuten zit in de database, niet hier. Op het
 * scherm staat alleen wat er gebeurd is.
 */
export default function HulpKnop({ householdId }: { householdId: string }) {
  const [gevraagd, setGevraagd] = useState(false)

  const vraag = useMutation({
    mutationFn: () => vraagHulp(householdId),
    onSuccess: () => setGevraagd(true),
  })

  return (
    <div>
      <button
        onClick={() => vraag.mutate()}
        disabled={vraag.isPending}
        className="flex min-h-[5rem] w-full items-center gap-4 rounded-card border-[1.5px] border-accent bg-accent-soft px-5 text-left text-xl font-bold shadow-card disabled:opacity-60"
      >
        <span className="text-3xl" aria-hidden="true">
          🔔
        </span>
        {vraag.isPending ? 'Bezig…' : 'Laat mijn familie weten dat ik hulp nodig heb'}
      </button>

      {gevraagd ? (
        <p aria-live="polite" className="mt-2 text-lg font-semibold text-ok">
          Je familie heeft een bericht gekregen.
        </p>
      ) : null}

      {vraag.isError ? (
        <p role="alert" className="mt-2 text-lg font-semibold text-alert">
          Dat lukte nu niet. Probeer het nog eens.
        </p>
      ) : null}
    </div>
  )
}
