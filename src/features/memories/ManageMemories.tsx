import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import StoragePhoto from '../../components/StoragePhoto'
import { deletePhoto, savePhoto, uploadPhoto, type MemoryPhoto } from '../../services/memories'
import { usePhotos } from './usePhotos'

/**
 * Het verhaal bij de foto is belangrijker dan de foto zelf: dat is wat
 * wordt voorgelezen en waarover de persoon kan praten.
 */
export default function ManageMemories({ householdId }: { householdId: string }) {
  const { data: photos } = usePhotos(householdId)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 className="text-lg font-bold">Herinneringen</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Foto&rsquo;s met een jaartal en het verhaal erbij.
      </p>

      <ul className="mt-4 space-y-2">
        {(photos ?? []).map((p) => (
          <li key={p.id} className="rounded-2xl border border-line bg-surface-soft p-3">
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0">
                <StoragePhoto path={p.photo_path} bucket="memories" emoji="📷" alt={p.title} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {p.year ? `${p.year} — ` : ''}
                  {p.title}
                </span>
                <span className="block truncate text-sm text-ink-soft">{p.story}</span>
              </span>
              <button
                onClick={() => setOpen(open === p.id ? null : p.id)}
                className="min-h-[2.4rem] shrink-0 rounded-pill border-[1.5px] border-line-strong px-3 text-sm font-semibold"
              >
                {open === p.id ? 'Sluiten' : 'Wijzigen'}
              </button>
            </div>
            {open === p.id ? (
              <PhotoEditor householdId={householdId} photo={p} onDone={() => setOpen(null)} />
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-4">
        {open === 'nieuw' ? (
          <PhotoEditor householdId={householdId} onDone={() => setOpen(null)} />
        ) : (
          <button
            onClick={() => setOpen('nieuw')}
            className="flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white"
          >
            + Herinnering toevoegen
          </button>
        )}
      </div>
    </section>
  )
}

function PhotoEditor({
  householdId,
  photo,
  onDone,
}: {
  householdId: string
  photo?: MemoryPhoto
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [year, setYear] = useState(photo?.year ? String(photo.year) : '')
  const [title, setTitle] = useState(photo?.title ?? '')
  const [story, setStory] = useState(photo?.story ?? '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ververs = () => queryClient.invalidateQueries({ queryKey: ['photos', householdId] })

  const opslaan = useMutation({
    mutationFn: () =>
      savePhoto({
        householdId,
        id: photo?.id,
        year: year.trim() ? Number(year.trim()) : null,
        title: title.trim(),
        story: story.trim(),
      }),
    onSuccess: async () => {
      await ververs()
      onDone()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Opslaan lukte niet.'),
  })

  const verwijder = useMutation({
    mutationFn: () => deletePhoto(photo!.id),
    onSuccess: async () => {
      await ververs()
      onDone()
    },
  })

  async function kiesFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !photo) return
    setUploading(true)
    try {
      await uploadPhoto(householdId, photo.id, file)
      await ververs()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uploaden lukte niet.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        opslaan.mutate()
      }}
      className="mt-3 space-y-3 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap gap-3">
        <label className="w-28">
          <span className="text-sm font-semibold text-ink-soft">Jaar</span>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            inputMode="numeric"
            placeholder="1993"
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
        <label className="min-w-[10rem] flex-1">
          <span className="text-sm font-semibold text-ink-soft">Titel</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Vakantie in Spanje"
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-ink-soft">Het verhaal erbij</span>
        <textarea
          value={story}
          onChange={(e) => setStory(e.target.value)}
          rows={3}
          placeholder="Twee weken aan zee, met het hele gezin in de gele auto."
          className="mt-1 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Dit wordt voorgelezen in de rustige modus.
        </span>
      </label>

      {photo ? (
        <div className="flex flex-wrap items-center gap-2">
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
            type="button"
            onClick={() => {
              if (confirm(`"${photo.title}" verwijderen?`)) verwijder.mutate()
            }}
            className="min-h-[2.4rem] rounded-pill border-[1.5px] border-alert px-4 text-sm font-semibold text-alert"
          >
            Verwijderen
          </button>
        </div>
      ) : (
        <p className="text-xs text-ink-faint">De foto kan je kiezen zodra de herinnering bewaard is.</p>
      )}

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
