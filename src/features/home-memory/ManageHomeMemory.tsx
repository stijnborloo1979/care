import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import StoragePhoto from '../../components/StoragePhoto'
import FotoKiezer from '../../components/FotoKiezer'
import {
  deleteItem,
  saveItem,
  uploadItemPhoto,
  uploadRoomPhoto,
  uploadStepPhoto,
  type Item,
  type Room,
} from '../../services/homeMemory'
import { useItem, useItems, useRooms } from './useHomeMemory'
import { SJABLONEN } from './sjablonen'
import DictateButton from '../../components/DictateButton'

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
    <section className="rounded-card bg-surface p-6 shadow-card">
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

      {actieveKamer ? (
        <KamerFoto
          householdId={householdId}
          kamer={(rooms ?? []).find((r) => r.id === actieveKamer)}
        />
      ) : null}

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

/**
 * De foto van de kamer zelf. Staat los van de dingen erin: het scherm van
 * de persoon toont hem op de kamerknop, zodat "de berging" een deur wordt
 * die hij herkent in plaats van een woord.
 */
function KamerFoto({ householdId, kamer }: { householdId: string; kamer?: Room }) {
  const queryClient = useQueryClient()
  if (!kamer) return null

  return (
    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface-soft p-3">
      <div className="w-20 flex-none">
        <StoragePhoto path={kamer.photo_path} emoji={kamer.emoji} alt={kamer.name} />
      </div>
      <div>
        <p className="font-semibold">Foto van {kamer.name}</p>
        <FotoKiezer
          className="mt-1 block"
          label={kamer.photo_path ? 'Andere foto' : 'Foto kiezen'}
          onKies={async (bestand) => {
            await uploadRoomPhoto(householdId, kamer.id, bestand)
            await queryClient.invalidateQueries({ queryKey: ['rooms', householdId] })
          }}
        />
      </div>
    </div>
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

  function neemSjabloon(naam: string) {
    const t = SJABLONEN.find((x) => x.naam === naam)
    if (!t) return
    setName(t.naam)
    setEmoji(t.emoji)
    // Wat er al ingevuld is blijft staan: een sjabloon vult aan, het
    // overschrijft geen werk dat iemand net heeft gedaan.
    setWhere((v) => v || t.waar)
    setSteps((v) => v || t.stappen.join('\n'))
  }

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
      {!itemId ? (
        <div>
          <span className="text-sm font-semibold text-ink-soft">
            Begin met een sjabloon, of typ het zelf
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {SJABLONEN.map((t) => (
              <button
                key={t.naam}
                type="button"
                onClick={() => neemSjabloon(t.naam)}
                className="min-h-[2.4rem] rounded-pill border border-line bg-surface-soft px-3 text-sm font-semibold text-ink-soft"
              >
                {t.emoji} {t.naam}
              </button>
            ))}
          </div>
        </div>
      ) : null}

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

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink-soft">Waar ligt of staat het?</span>
          <DictateButton onTekst={(t) => setWhere(t)} />
        </div>
        <input
          value={where}
          onChange={(e) => setWhere(e.target.value)}
          placeholder="Op het aanrecht, rechts van de gootsteen."
          className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
        />
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink-soft">Stappen, één per lijn</span>
          {/* Elke ingesproken zin wordt een eigen stap. */}
          <DictateButton
            label="Stap inspreken"
            onTekst={(t) => setSteps((v) => (v ? v + '\n' + t : t))}
          />
        </div>
        <textarea
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          rows={4}
          placeholder={'Doe de deur open.\nDruk op de knop links.'}
          className="mt-1 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Korte zinnen, één handeling per lijn. Ze worden als losse kaarten getoond.
        </span>
      </div>

      {(bestaand?.item_step ?? []).length > 0 ? (
        <div>
          <span className="text-sm font-semibold text-ink-soft">Foto bij een stap</span>
          <ul className="mt-2 space-y-2">
            {(bestaand?.item_step ?? []).map((stap) => (
              <li
                key={stap.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-2"
              >
                <div className="w-16 flex-none">
                  <StoragePhoto path={stap.photo_path} emoji="📷" alt={stap.body} />
                </div>
                <span className="min-w-[8rem] flex-1 text-sm">{stap.body}</span>
                <FotoKiezer
                  label={stap.photo_path ? 'Andere foto' : 'Foto'}
                  onKies={async (bestand) => {
                    await uploadStepPhoto(householdId, stap.id, bestand)
                    if (itemId) await queryClient.invalidateQueries({ queryKey: ['item', itemId] })
                  }}
                />
              </li>
            ))}
          </ul>
          <span className="mt-1 block text-xs text-ink-faint">
            Een foto hoort bij de tekst van die stap. Herschrijf je de zin, dan hoort de foto er
            niet meer bij en kies je een nieuwe.
          </span>
        </div>
      ) : null}

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
