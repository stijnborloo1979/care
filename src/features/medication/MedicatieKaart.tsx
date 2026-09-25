import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import StoragePhoto from '../../components/StoragePhoto'
import Icon from '../../components/Icon'
import { hhmm } from '../../lib/time'
import { getMedsToday, type MedMoment } from '../../services/medsToday'

/**
 * Medicatie op het scherm van de persoon.
 *
 * Familie vult een schema in, de dokter kijkt naar wat bevestigd werd, de
 * spraakassistent kan erover antwoorden — maar zij zag het nergens. Wie
 * niet praat tegen de tablet, kon zijn eigen medicatie niet bevestigen.
 *
 * Eén moment tegelijk: het eerstvolgende dat nog moet. Een lijst van vier
 * momenten is een lijst om te lezen, en dat is precies wat dit scherm niet
 * vraagt. Wat al genomen is, staat er als één rustige regel onder — dat is
 * het antwoord op "heb ik ze al genomen?".
 *
 * De foto van de verpakking staat er groot bij. Een doosje herkennen is
 * makkelijker dan een naam lezen, zeker een naam als "rivastigmine".
 */
export default function MedicatieKaart({
  householdId,
  timezone,
}: {
  householdId: string
  timezone: string
}) {
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['meds-today', householdId],
    queryFn: () => getMedsToday(householdId, timezone),
    enabled: !!householdId,
    staleTime: 60_000,
  })

  // De mutatie hangt aan de client, niet aan dit component: zo gaat een
  // bevestiging die offline gegeven werd alsnog de deur uit, ook nadat de
  // tablet opnieuw opgestart is.
  const bevestig = useMutation<unknown, Error, { id: string; taken: boolean; householdId: string }>({
    mutationKey: ['confirmMedication'],
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['meds-today', householdId] }),
  })

  const momenten = data ?? []
  if (momenten.length === 0) return null

  const open = momenten.filter((m) => !m.taken_at)
  const genomen = momenten.filter((m) => m.taken_at)
  const nu = open[0]

  return (
    <section aria-labelledby="medicatie" className="rounded-card bg-surface p-5 shadow-card">
      <h2 id="medicatie" className="text-base font-bold text-ink-faint">
        Medicatie
      </h2>

      {nu ? (
        <Moment
          m={nu}
          timezone={timezone}
          bezig={bevestig.isPending}
          onGenomen={() => bevestig.mutate({ id: nu.id, taken: true, householdId })}
        />
      ) : (
        <p className="mt-2 flex items-center gap-2 text-xl font-bold">
          <Icon naam="gedaan" size={24} />
          Alles genomen voor vandaag.
        </p>
      )}

      {/* Wat al gebeurd is, klein en zonder knop: het antwoord op "heb ik
          ze al genomen?", niet iets om nog eens te doen. */}
      {genomen.length > 0 ? (
        <ul className="mt-4 list-none space-y-1 border-t border-line pt-3 p-0">
          {genomen.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-ink-soft">
              <Icon naam="gedaan" size={18} />
              <span>
                {m.naam} — genomen om {hhmm(new Date(m.taken_at as string), timezone)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {open.length > 1 ? (
        <p className="mt-3 text-ink-faint">
          Daarna nog {open.length - 1} {open.length - 1 === 1 ? 'moment' : 'momenten'} vandaag.
        </p>
      ) : null}
    </section>
  )
}

function Moment({
  m,
  timezone,
  bezig,
  onGenomen,
}: {
  m: MedMoment
  timezone: string
  bezig: boolean
  onGenomen: () => void
}) {
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-4">
        {m.foto ? (
          <span className="w-32 shrink-0">
            {/* Heel de doos, niet bijgesneden: de kleur en de vorm zijn
                waar je hem aan herkent. */}
            <StoragePhoto bucket="home-memory" path={m.foto} emoji="💊" alt={m.naam} passend />
          </span>
        ) : (
          <span aria-hidden="true" className="text-5xl">
            💊
          </span>
        )}

        <div className="min-w-0 flex-1">
          <p className="text-2xl font-extrabold leading-tight tracking-tight">{m.naam}</p>
          {m.dosis ? <p className="mt-1 text-lg">{m.dosis}</p> : null}
          <p className="mt-1 text-lg text-ink-soft">
            om {hhmm(new Date(m.due_at), timezone)}
          </p>
        </div>
      </div>

      {m.instructie ? <p className="mt-3 text-lg text-ink-soft">{m.instructie}</p> : null}

      <button
        onClick={onGenomen}
        disabled={bezig}
        className="mt-4 flex min-h-[3.4rem] w-full items-center justify-center gap-2 rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white shadow-lift disabled:opacity-60"
      >
        <Icon naam="gedaan" size={20} />
        {bezig ? 'Bezig…' : 'Genomen'}
      </button>
    </div>
  )
}
