import { useQuery } from '@tanstack/react-query'
import { Volume2 } from 'lucide-react'
import StoragePhoto from '../../components/StoragePhoto'
import Avatar from '../../components/Avatar'
import { getPeople } from '../../services/people'
import { FOTO_BUCKET, bezoekZin, recenteBezoeken, voorDeTablet } from '../../services/bezoek'
import { spreek } from '../voice/useSpeech'
import { t } from '../../lib/i18n'

/**
 * "Wie was er hier?" op het scherm van de persoon. Staat er alleen als er
 * vandaag of gisteren iemand was: dan is het het eerste wat ze ziet onder
 * "nu". Eén grote foto en één zin; de rest kort eronder.
 */
export default function BezoekOpTablet({ householdId, timezone }: { householdId: string; timezone: string }) {
  const bezoeken = useQuery({
    queryKey: ['bezoeken', householdId],
    queryFn: () => recenteBezoeken(householdId, 2),
    enabled: !!householdId,
    // Een tablet krijgt geen focus: zo verschijnt een nieuw bezoek vanzelf.
    refetchInterval: 5 * 60_000,
    retry: false,
  })
  const mensen = useQuery({
    queryKey: ['people', householdId],
    queryFn: () => getPeople(householdId),
    enabled: !!householdId,
    staleTime: 5 * 60_000,
  })

  const lijst = voorDeTablet(bezoeken.data ?? [], timezone)
  if (lijst.length === 0) return null
  const [laatste, ...rest] = lijst
  const kaart = mensen.data?.find((p) => p.id === laatste.visitor_card)
  const zin = bezoekZin(laatste, timezone)

  return (
    <section aria-labelledby="bezoek-titel" className="mt-4">
      <h2 id="bezoek-titel" className="sr-only">
        {t('bezoek.titel')}
      </h2>
      <div className="overflow-hidden rounded-card bg-surface shadow-card">
        {laatste.photo_path ? (
          <StoragePhoto
            path={laatste.photo_path}
            bucket={FOTO_BUCKET}
            alt={zin}
            className="aspect-[4/3] w-full sm:aspect-[16/9]"
          />
        ) : null}
        <div className="flex items-start gap-4 p-5">
          {!laatste.photo_path ? (
            <Avatar name={laatste.visitor_name} photoPath={kaart?.photo_path ?? null} color={kaart?.color ?? null} size="m" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-2xl font-bold leading-snug">{zin}</p>
            {laatste.note ? <p className="mt-1 text-lg text-ink-soft">{laatste.note}</p> : null}
            {rest.length > 0 ? (
              <ul className="mt-3 space-y-1 text-lg text-ink-soft">
                {rest.slice(0, 3).map((b) => (
                  <li key={b.id}>{bezoekZin(b, timezone)}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <button
            onClick={() => spreek([zin, laatste.note, ...rest.slice(0, 3).map((b) => bezoekZin(b, timezone))].filter(Boolean).join(' '))}
            aria-label={t('bezoek.voorlezen')}
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink"
          >
            <Volume2 size={22} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  )
}
