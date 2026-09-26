import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '../../components/Icon'
import { getPushStatus, stuurTestmelding } from './pushStatus'

/**
 * Waarom komt die melding niet aan?
 *
 * Push valt op drie plaatsen stil, en alle drie zonder een spoor. Wie dat
 * niet weet, zoekt zich blind — en concludeert dat de app niet werkt.
 *
 * Dit blok zegt per stap wat er aan de hand is, in de volgorde waarin je
 * ze moet oplossen. Geen groene vinkjes voor de sier: alleen wat er nog in
 * de weg staat krijgt aandacht.
 */
export default function PushNakijken({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient()
  const [verstuurd, setVerstuurd] = useState(false)

  const { data } = useQuery({
    queryKey: ['push-status', householdId],
    queryFn: () => getPushStatus(householdId),
    enabled: !!householdId,
  })

  const test = useMutation({
    mutationFn: () => stuurTestmelding(householdId),
    onSuccess: () => {
      setVerstuurd(true)
      queryClient.invalidateQueries({ queryKey: ['push-status', householdId] })
    },
  })

  if (!data) return null

  const problemen: string[] = []
  if (!data.eigen_toestel) {
    problemen.push(
      'Dit toestel staat er niet bij. Toestemming geldt per toestel én per account: aanzetten op de tablet doet niets voor je telefoon. Zet het hierboven aan op het toestel waarop je de melding wil krijgen.',
    )
  }
  if (!data.niveau_ok) {
    problemen.push(
      'Meldingen worden alleen verstuurd wanneer de ondersteuning op "ondersteund" staat. Dat kan je aanpassen bij Wie ziet wat.',
    )
  }
  // Wachtende meldingen terwijl er toestellen klaarstaan: dan is er niemand
  // die ze verstuurt.
  if (data.wachtend > 0 && data.toestellen > 0 && data.niveau_ok) {
    problemen.push(
      `Er wachten ${data.wachtend} meldingen die niet verstuurd raken. De taak die dat doet (push-notify) draait niet. Zet pg_cron aan in Supabase, bij Database → Extensions.`,
    )
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-surface-soft p-4">
      <p className="font-semibold">
        {data.toestellen === 0
          ? 'Nog geen enkel toestel krijgt meldingen'
          : `${data.toestellen} ${data.toestellen === 1 ? 'toestel krijgt' : 'toestellen krijgen'} meldingen`}
      </p>

      {problemen.length > 0 ? (
        <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
          {problemen.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 flex items-center gap-2 text-sm text-ink-soft">
          <Icon naam="gedaan" size={16} />
          Alles staat klaar.
        </p>
      )}

      <button
        onClick={() => test.mutate()}
        disabled={test.isPending}
        className="mt-3 min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold disabled:opacity-60"
      >
        {test.isPending ? 'Bezig…' : 'Stuur een testmelding'}
      </button>

      {verstuurd ? (
        <p aria-live="polite" className="mt-2 text-sm text-ink-soft">
          Verstuurd. Komt er binnen een minuut niets aan op je telefoon, dan staat hierboven
          waarschijnlijk al waarom — of blokkeert je telefoon meldingen voor deze app.
        </p>
      ) : null}

      {test.isError ? (
        <p role="alert" className="mt-2 text-sm text-alert">
          Dat lukte niet. Draaide <code>34_push_nakijken.sql</code> al?
        </p>
      ) : null}
    </div>
  )
}
