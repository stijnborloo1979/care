import { Link, useParams } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { useItems, useRooms } from './useHomeMemory'

/** De plattegrond: elke kamer een grote tegel met hoeveel erin staat. */
export default function RoomGrid() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const { data: rooms, isLoading } = useRooms(hh)
  const { data: items } = useItems(hh)

  if (isLoading) return <p className="text-ink-soft">Bezig met laden…</p>
  if (!rooms || rooms.length === 0) {
    return (
      <div className="rounded-card border-[1.5px] border-dashed border-line-strong bg-surface-soft p-8 text-center text-ink-soft">
        Er zijn nog geen kamers.
        <span className="mt-1 block text-sm">Familie kan ze toevoegen.</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {rooms.map((r) => {
        const aantal = (items ?? []).filter((i) => i.room_id === r.id).length
        return (
          <Link
            key={r.id}
            to={`/memory/${r.id}`}
            className="flex min-h-[7.5rem] flex-col justify-between rounded-card border-[1.5px] border-line-strong bg-surface p-4 shadow-card"
          >
            <span className="text-3xl" aria-hidden="true">
              {r.emoji ?? '🚪'}
            </span>
            <span>
              <span className="block text-lg font-bold">{r.name}</span>
              <span className="text-sm font-semibold text-ink-faint">
                {aantal} {aantal === 1 ? 'ding' : 'dingen'}
              </span>
            </span>
          </Link>
        )
      })}
    </div>
  )
}

/** Alles wat in één kamer staat. */
export function RoomItems() {
  const { roomId = '' } = useParams()
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const { data: rooms } = useRooms(hh)
  const { data: items, isLoading } = useItems(hh)

  const room = (rooms ?? []).find((r) => r.id === roomId)
  const lijst = (items ?? []).filter((i) => i.room_id === roomId)

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <Link to="/memory" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ Alle kamers
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">
        {room ? `${room.emoji ?? ''} ${room.name}` : 'Kamer'}
      </h1>

      {isLoading ? (
        <p className="mt-6 text-ink-soft">Bezig met laden…</p>
      ) : lijst.length === 0 ? (
        <p className="mt-6 text-lg text-ink-soft">Hier staat nog niets in.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {lijst.map((i) => (
            <li key={i.id}>
              <Link
                to={`/memory/ding/${i.id}`}
                className="flex items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card"
              >
                <span className="w-10 text-center text-3xl" aria-hidden="true">
                  {i.emoji ?? '📦'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold">{i.name}</span>
                  <span className="block text-ink-soft">{i.where_text}</span>
                </span>
                <span className="text-xl text-ink-faint" aria-hidden="true">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
