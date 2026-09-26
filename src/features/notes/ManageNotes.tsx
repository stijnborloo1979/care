import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CATEGORIEEN, deleteNote, saveNote, type MemoryNote } from '../../services/notes'
import { useNotes } from './useNotes'
import DictateButton from '../../components/DictateButton'

export default function ManageNotes({ householdId }: { householdId: string }) {
  const { data } = useNotes(householdId)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Memory Bank</h1>
        <p className="mt-1 text-ink-soft">
          Korte antwoorden op vragen die terugkomen. De spraakassistent gebruikt precies deze
          weetjes — en niets anders.
        </p>
      </header>

      {open === 'nieuw' ? (
        <NoteEditor householdId={householdId} onDone={() => setOpen(null)} />
      ) : (
        <button
          onClick={() => setOpen('nieuw')}
          className="flex min-h-touch w-full max-w-sm items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white"
        >
          + Weetje toevoegen
        </button>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {CATEGORIEEN.map((c) => {
          const notities = (data ?? []).filter((n) => n.category === c.waarde)
          return (
            <section key={c.waarde} className="rounded-card bg-surface p-6 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">
                  {c.emoji} {c.label}
                </h2>
                <span className="rounded-pill border border-line px-3 py-0.5 text-sm font-semibold text-ink-soft">
                  {notities.length}
                </span>
              </div>

              {notities.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">Nog niets in deze categorie.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {notities.map((n) => (
                    <li key={n.id} className="rounded-2xl border border-line bg-surface-soft p-3">
                      <div className="flex items-start gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{n.title}</span>
                          <span className="block text-sm text-ink-soft">{n.body}</span>
                          {n.tags.length > 0 ? (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {n.tags.map((t) => (
                                <span
                                  key={t}
                                  className="rounded-pill border border-line px-2 py-0.5 text-xs font-semibold text-ink-faint"
                                >
                                  #{t}
                                </span>
                              ))}
                            </span>
                          ) : null}
                        </span>
                        <button
                          onClick={() => setOpen(open === n.id ? null : n.id)}
                          className="min-h-[2.4rem] shrink-0 rounded-pill border-[1.5px] border-line-strong px-3 text-sm font-semibold"
                        >
                          {open === n.id ? 'Sluiten' : 'Wijzigen'}
                        </button>
                      </div>
                      {open === n.id ? (
                        <NoteEditor
                          householdId={householdId}
                          note={n}
                          onDone={() => setOpen(null)}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function NoteEditor({
  householdId,
  note,
  onDone,
}: {
  householdId: string
  note?: MemoryNote
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [category, setCategory] = useState(note?.category ?? 'dingen')
  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [tags, setTags] = useState((note?.tags ?? []).join(', '))
  const [error, setError] = useState<string | null>(null)

  const ververs = () => queryClient.invalidateQueries({ queryKey: ['notes', householdId] })

  const opslaan = useMutation({
    mutationFn: () =>
      saveNote({
        householdId,
        id: note?.id,
        category,
        title: title.trim(),
        body: body.trim(),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      }),
    onSuccess: async () => {
      await ververs()
      onDone()
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Opslaan lukte niet.'),
  })

  const verwijder = useMutation({
    mutationFn: () => deleteNote(note!.id),
    onSuccess: async () => {
      await ververs()
      onDone()
    },
  })

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
        <label className="min-w-[min(9rem,100%)]">
          <span className="text-sm font-semibold text-ink-soft">Categorie</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          >
            {CATEGORIEEN.map((c) => (
              <option key={c.waarde} value={c.waarde}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[min(10rem,100%)] flex-1">
          <span className="text-sm font-semibold text-ink-soft">Waarover gaat het?</span>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Reservehuissleutel"
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink-soft">Het antwoord, in gewone taal</span>
          <DictateButton onTekst={(t) => setBody(t)} />
        </div>
        <textarea
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Bij de buurvrouw, Rita."
          className="mt-1 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Zo kort mogelijk. Dit wordt voorgelezen als antwoord op een vraag.
        </span>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-ink-soft">Labels, gescheiden door komma&rsquo;s</span>
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="huis, dagelijks"
          className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
        />
      </label>

      <div className="flex flex-wrap gap-2">
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
        {note ? (
          <button
            type="button"
            onClick={() => {
              if (confirm(`"${note.title}" verwijderen?`)) verwijder.mutate()
            }}
            className="min-h-touch rounded-pill border-[1.5px] border-alert px-5 font-semibold text-alert"
          >
            Verwijderen
          </button>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
