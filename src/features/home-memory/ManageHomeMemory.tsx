import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import StoragePhoto from '../../components/StoragePhoto'
import { deleteItem, saveItem, uploadItemPhoto, type Item } from '../../services/homeMemory'
import { useItem, useItems, useRooms } from './useHomeMemory'

interface Props {
  householdId: string
}

/**
 * Het invulwerk is de echte drempel van dit product: niemand typt twaalf
 * handleidingen uit. Daarom is dit formulier zo kort mogelijk — naam,
 * waar het ligt, en de stappen als gewone regels tekst.
 */
export default function ManageHomeMemory({ householdId }: Props) {
  const { data: rooms } = useRooms(householdId)
  const { data: items } = useItems(householdId)
  const [roomId, setRoomId] = useState('')
  const [editing, setEditing] = useState<string | null>(null)

  const actieveKamer = roomId || rooms?.[0]?.id || ''
  const lijst = (items ?? []).filter((i) => i.room_id === actieveKamer)

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 className="text-lg font-bold">Home Memory</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Wat er in huis staat, waar het ligt en hoe het werkt.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {(rooms ?? []).map((r) => (
          <button
            key={r.id}
            onClick={() => {
              setRoomId(r.id)
              setEditing(null)
            }}
            aria-pressed={r.id === actieveKamer}
            className={`min-h-[2.6rem] rounded-pill border px-4 font-semibold ${
              r.id === actieveKamer
                ? 'border-accent bg-accent-soft text-accent-ink'
                : 'border-line bg-surface-soft text-ink-soft'
            }`}
          >
            {r.emoji ?? ''} {r.name}
          </button>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {lijst.map((i) => (
          <ItemRow
            key={i.id}
            item={i}
            householdId={householdId}
            open={editing === i.id}
            onToggle={() => setEditing(editing === i.id ? null : i.id)}
          />
        ))}
        {lijst.length === 0 ? (
          <li className="rounded-2xl border-[1.5px] border-dashed border-line-strong p-4 text-sm text-ink-soft">
            Nog niets in deze kamer. Voeg toe wat Maria het vaakst zoekt of niet meer kan bedienen.
          </li>
        ) : null}
      </ul>

      {actieveKamer ? (
        <div className="mt-4">
          {editing === 'nieuw' ? (
            <ItemForm
              householdId={householdId}
              roomId={actieveKamer}
              onDone={() => setEditing(null)}
            />
          ) : (
            <button
              onClick={() => setEditing('nieuw')}
              className="flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white"
            >
              + Ding toevoegen
            </button>
          )}
        </div>
      ) : null}
    </section>
  )
}

function ItemRow({
  item,
  householdId,
  open,
  onToggle,
}: {
  item: Item
  householdId: string
  open: boolean
  onToggle: () => void
}) {
  const queryClient = useQueryClient()
  const [uploading, setUploading] = useState(false)

  const verwijder = useMutation({
    mutationFn: () => deleteItem(item.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['items', householdId] }),
  })

  async function kiesFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadItemPhoto(householdId, item.id, file)
      await queryClient.invalidateQueries({ queryKey: ['items', householdId] })
      await queryClient.invalidateQueries({ queryKey: ['item', item.id] })
    } finally {
      setUploading(false)
    }
  }

  return (
    <li className="rounded-2xl border border-line bg-surface-soft p-3">
      <div className="flex items-center gap-3">
        <span className="w-8 text-center text-2xl" aria-hidden="true">
          {item.emoji ?? '📦'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{item.name}</span>
          <span className="block truncate text-sm text-ink-soft">{item.where_text}</span>
        </span>
        <button
          onClick={onToggle}
          className="min-h-[2.4rem] rounded-pill border-[1.5px] border-line-strong px-3 text-sm font-semibold"
        >
          {open ? 'Sluiten' : 'Wijzigen'}
        </button>
      </div>

      {open ? (
        <div className="mt-3 space-y-3">
          <div className="max-w-[12rem]">
            <StoragePhoto path={item.photo_path} emoji={item.emoji} alt={item.name} />
          </div>

          <div className="flex flex-wrap gap-2">
            <label className="relative min-h-[2.4rem] cursor-pointer overflow-hidden rounded-pill border-[1.5px] border-line-strong px-4 py-1 text-sm font-semibold">
              {uploading ? 'Bezig…' : 'Foto kiezen'}
              <input
                type="file"
                accept="image/*"
                onChange={kiesFoto}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            <button
              onClick={() => {
                if (confirm(`"${item.name}" verwijderen?`)) verwijder.mutate()
              }}
              className="min-h-[2.4rem] rounded-pill border-[1.5px] border-alert px-4 text-sm font-semibold text-alert"
            >
              Verwijderen
            </button>
          </div>

          <ItemForm
            householdId={householdId}
            roomId={item.room_id}
            itemId={item.id}
            onDone={onToggle}
          />
        </div>
      ) : null}
    </li>
  )
}

function ItemForm({
  householdId,
  roomId,
  itemId,
  onDone,
}: {
  householdId: string
  roomId: string
  itemId?: string
  onDone: () => void
}) {
  const { data: bestaand } = useItem(itemId ?? '')
  const queryClient = useQueryClient()

  const [name, setName] = useState(bestaand?.name ?? '')
  const [emoji, setEmoji] = useState(bestaand?.emoji ?? '📦')
  const [where, setWhere] = useState(bestaand?.where_text ?? '')
  const [steps, setSteps] = useState((bestaand?.item_step ?? []).map((s) => s.body).join('\n'))
  const [error, setError] = useState<string | null>(null)

  const opslaan = useMutation({
    mutationFn: () =>
      saveItem({
        householdId,
        roomId,
        itemId,
        name: name.trim(),
        emoji: emoji.trim() || '📦',
        whereText: where.trim(),
        steps: steps.split('\n'),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['items', householdId] })
      if (itemId) await queryClient.invalidateQueries({ queryKey: ['item', itemId] })
      onDone()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Opslaan lukte niet.'),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        opslaan.mutate()
      }}
      className="space-y-3 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex gap-3">
        <label className="w-20">
          <span className="text-sm font-semibold text-ink-soft">Icoon</span>
          <input
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            maxLength={4}
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-3 text-center text-xl"
          />
        </label>
        <label className="flex-1">
          <span className="text-sm font-semibold text-ink-soft">Wat is het?</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Microgolfoven"
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-ink-soft">Waar ligt of staat het?</span>
        <input
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          placeholder="Op het aanrecht, rechts van de gootsteen."
          className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-ink-soft">Stappen, één per lijn</span>
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          rows={4}
          placeholder={'Doe de deur open.\nDruk op de knop links.'}
          className="mt-1 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Korte zinnen, één handeling per lijn. Maria leest ze als losse kaarten.
        </span>
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={opslaan.isPending}
          className="flex min-h-touch flex-1 items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
        >
          {opslaan.isPending ? 'Opslaan…' : 'Opslaan'}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
        >
          Annuleren
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
