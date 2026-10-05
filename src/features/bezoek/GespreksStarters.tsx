import { useQuery } from '@tanstack/react-query'
import { MessagesSquare } from 'lucide-react'
import StoragePhoto from '../../components/StoragePhoto'
import { getPhotos } from '../../services/memories'
import { getVerhalenAlleen } from '../../services/stories'
import { localDateKey } from '../../lib/time'
import { gespreksstarters } from './gespreksstarters'
import { tt } from '../../lib/uiTaal'

/** "Om over te praten": voor wie langsgaat en niet goed weet waarover. */
export default function GespreksStarters({ householdId, personName, timezone }: { householdId: string; personName: string; timezone: string }) {
  const fotos = useQuery({ queryKey: ['photos', householdId], queryFn: () => getPhotos(householdId), enabled: !!householdId, retry: false })
  const verhalen = useQuery({ queryKey: ['verhalen-alleen', householdId], queryFn: () => getVerhalenAlleen(householdId), enabled: !!householdId, retry: false })
  const lijst = gespreksstarters(fotos.data ?? [], verhalen.data ?? [], localDateKey(new Date(), timezone), personName)
  if (lijst.length === 0) return null
  return (
    <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby="praten-kop">
      <h2 id="praten-kop" className="flex items-center gap-2 text-lg font-bold">
        <MessagesSquare size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Om over te praten')}
      </h2>
      <p className="mt-1 text-ink-soft">{tt('Ga je langs? Vandaag twee ideeën. Morgen andere.')}</p>
      <ul className="mt-3 space-y-2">
        {lijst.map((s) => (
          <li key={s.sleutel} className="flex items-center gap-3 rounded-2xl bg-surface-soft p-3">
            {s.foto ? <StoragePhoto path={s.foto} bucket="memories" alt="" className="h-16 w-16 shrink-0 rounded-xl" /> : null}
            <span className="min-w-0">{s.tekst}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
