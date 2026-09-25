import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import StoragePhoto from '../../components/StoragePhoto'
import { locale } from '../../lib/i18n'
import { deleteMessage, getPersonInbox, toonNaam, type InboxMessage } from './messages'

/**
 * Wat er nu op het scherm van de persoon staat, en een knop om het weg te
 * halen.
 *
 * Familie mocht al verwijderen wat ze zelf stuurde, maar nergens stond een
 * knop — en de Berichten-pagina liet niet eens zien wát er stond. Je kon
 * het dus niet weghalen omdat je het niet zag. Dat is het eigenlijke gat;
 * de knop is maar de helft ervan.
 *
 * Alleen wat er nú staat, niet alles ooit. Een bericht vervalt na twee
 * dagen vanzelf, en deze lijst gaat over één vraag: is dit wat ik haar wil
 * laten zien?
 */
export default function OpHaarScherm({ householdId, naam }: { householdId: string; naam: string }) {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['inbox', householdId],
    queryFn: () => getPersonInbox(householdId),
    enabled: !!householdId,
  })

  const weg = useMutation({
    mutationFn: (m: InboxMessage) => deleteMessage(m),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['inbox', householdId] }),
  })

  const berichten = data ?? []

  return (
    <section className="rounded-card bg-surface p-5 shadow-card sm:p-6">
      <h2 className="text-lg font-bold">Staat nu op haar scherm</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Alles verdwijnt na twee dagen vanzelf. Wil je het eerder weg, dan kan dat hier.
      </p>

      {isLoading ? (
        <p className="mt-4 text-ink-soft">Bezig met laden…</p>
      ) : berichten.length === 0 ? (
        <p className="mt-4 text-ink-soft">
          Er staat nu niets. Wat je stuurt, verschijnt hier meteen.
        </p>
      ) : (
        <ul className="mt-4 list-none space-y-3 p-0">
          {berichten.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface-soft p-3"
            >
              <span className="w-24 shrink-0">
                {m.photo_path ? (
                  <StoragePhoto bucket="messages" path={m.photo_path} alt="" passend />
                ) : (
                  <span className="grid aspect-[4/3] w-full place-items-center rounded-card bg-surface-deep text-2xl">
                    {m.audio_path ? '🎤' : '💬'}
                  </span>
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {m.photo_path ? 'Foto' : m.audio_path ? 'Ingesproken bericht' : 'Bericht'} van{' '}
                  {toonNaam(m.author_name)}
                </span>
                {m.body ? <span className="block text-ink-soft">{m.body}</span> : null}
                <span className="block text-sm text-ink-faint">
                  {new Intl.DateTimeFormat(locale(), {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  }).format(new Date(m.created_at))}
                  {/* Of ze het al bekeken heeft: dat scheelt een telefoontje. */}
                  {m.seen_by_person ? ` · ${naam} heeft het gezien` : ' · nog niet bekeken'}
                </span>
              </span>

              <button
                onClick={() => {
                  if (confirm('Dit bericht weghalen? Het verdwijnt meteen van haar scherm.')) {
                    weg.mutate(m)
                  }
                }}
                disabled={weg.isPending}
                className="min-h-touch shrink-0 rounded-pill border-[1.5px] border-alert/50 px-4 font-semibold text-alert disabled:opacity-60"
              >
                Weghalen
              </button>
            </li>
          ))}
        </ul>
      )}

      {weg.isError ? (
        <p role="alert" className="mt-3 text-alert">
          Dat lukte niet. Je kan alleen weghalen wat je zelf stuurde; de beheerder kan alles
          weghalen.
        </p>
      ) : null}
    </section>
  )
}
