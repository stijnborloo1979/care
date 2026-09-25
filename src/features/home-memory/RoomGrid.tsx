import StoragePhoto from '../../components/StoragePhoto'
import { Link, useParams } from 'react-router-dom'
import Skeleton from '../../components/Skeleton'
import { useHousehold } from '../household/useHousehold'
import { useItems, useRooms } from './useHomeMemory'
import { t } from '../../lib/i18n'

/** De plattegrond: elke kamer een grote tegel met hoeveel erin staat. */
export default function RoomGrid() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const { data: rooms, isLoading } = useRooms(hh)
  const { data: items } = useItems(hh)

  if (isLoading)
    return (
      <div className={ROOSTER}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-[13rem]" />
        ))}
      </div>
    )
  if (!rooms || rooms.length === 0) {
    return (
      <div className="rounded-card border-[1.5px] border-dashed border-line-strong bg-surface-soft p-8 text-center text-ink-soft">
        {t('huis.leeg')}
        <span className="mt-1 block text-sm">{t('huis.familieVoegtToe')}</span>
      </div>
    )
  }

  return (
    <div className={ROOSTER}>
      {rooms.map((r) => {
        const aantal = (items ?? []).filter((i) => i.room_id === r.id).length
        return (
          <Link
            key={r.id}
            to={`/memory/${r.id}`}
            className="flex flex-col overflow-hidden rounded-card border-[1.5px] border-line-strong bg-surface shadow-card"
          >
            {/* Een foto van de kamer zegt meer dan de naam.
                Ze vult de hele breedte van de tegel in haar eigen
                verhouding; eerder stond ze in een strook van 64 px hoog,
                waardoor je alleen de middelste band zag — de foto leek
                ingezoomd terwijl hij gewoon afgeknipt was.
                Zonder foto komt het emoji in datzelfde vlak, zodat elke
                tegel even groot is en het rooster rustig blijft. */}
            <StoragePhoto
              path={r.photo_path}
              emoji={r.emoji ?? '🚪'}
              alt={r.name}
              className="rounded-none"
              passend
            />
            <span className="p-4">
              <span className="block text-lg font-bold leading-snug">{r.name}</span>
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

/**
 * Twee kolommen tot een groot scherm, pas daarna drie.
 *
 * Drie kolommen in een kolom van 36rem maakt elke foto zo'n 170 px breed;
 * dan is een kamer niet meer te herkennen, en dat is het enige waar deze
 * tegel voor dient.
 */
const ROOSTER = 'grid grid-cols-2 gap-4 lg:grid-cols-3'

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
        ‹ {t('huis.titel')}
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">
        {room ? `${room.emoji ?? ''} ${room.name}` : t('huis.kamer')}
      </h1>

      {isLoading ? (
        <p className="mt-6 text-ink-soft">{t('watnu.laden')}</p>
      ) : lijst.length === 0 ? (
        <p className="mt-6 text-lg text-ink-soft">{t('huis.leeg')}</p>
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
