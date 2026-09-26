import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CATEGORIEEN,
  addDocument,
  deleteDocument,
  getDocuments,
  openDocument,
  type DocCategory,
  type DocumentRow,
} from '../../services/documents'
import { useHousehold } from '../household/useHousehold'

export default function Documents() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['documents', hh],
    queryFn: () => getDocuments(hh),
    enabled: !!hh,
  })

  const [name, setName] = useState('')
  const [category, setCategory] = useState<DocCategory>('belangrijk')
  const [file, setFile] = useState<File | null>(null)
  const [zoek, setZoek] = useState('')
  const [error, setError] = useState<string | null>(null)

  const voegToe = useMutation({
    mutationFn: () => addDocument({ householdId: hh, category, name: name.trim(), file }),
    onSuccess: async () => {
      setName('')
      setFile(null)
      await queryClient.invalidateQueries({ queryKey: ['documents', hh] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Toevoegen lukte niet.'),
  })

  const verwijder = useMutation({
    mutationFn: (doc: DocumentRow) => deleteDocument(doc),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['documents', hh] }),
  })

  async function open(doc: DocumentRow) {
    if (!doc.storage_path) return
    const url = await openDocument(doc.storage_path)
    window.open(url, '_blank', 'noopener')
  }

  const lijst = (data ?? []).filter((d) =>
    zoek ? d.name.toLowerCase().includes(zoek.toLowerCase()) : true,
  )

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Documenten</h1>
        <p className="mt-1 text-ink-soft">
          Alleen zichtbaar voor familie. Niet voor zorgverleners, en niet op het scherm van de
          persoon.
        </p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          voegToe.mutate()
        }}
        className="rounded-card bg-surface p-6 shadow-card"
      >
        <div className="flex flex-wrap gap-3">
          <label className="min-w-[min(12rem,100%)] flex-1">
            <span className="text-sm font-semibold text-ink-soft">Naam</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hospitalisatieverzekering"
              className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
            />
          </label>
          <label className="min-w-[min(10rem,100%)]">
            <span className="text-sm font-semibold text-ink-soft">Categorie</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DocCategory)}
              className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
            >
              {CATEGORIEEN.map((c) => (
                <option key={c.waarde} value={c.waarde}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block">
          <span className="text-sm font-semibold text-ink-soft">Bestand</span>
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 block w-full text-sm"
          />
        </label>

        <button
          type="submit"
          disabled={voegToe.isPending}
          className="mt-3 flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
        >
          {voegToe.isPending ? 'Bezig…' : 'Document toevoegen'}
        </button>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-alert">
            {error}
          </p>
        ) : null}
      </form>

      <input
        value={zoek}
        onChange={(e) => setZoek(e.target.value)}
        placeholder="Zoeken"
        className="min-h-touch w-full max-w-md rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
      />

      {isLoading ? <p className="text-ink-soft">Bezig met laden…</p> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {CATEGORIEEN.map((c) => {
          const docs = lijst.filter((d) => d.category === c.waarde)
          return (
            <section key={c.waarde} className="rounded-card bg-surface p-6 shadow-card">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{c.label}</h2>
                <span className="rounded-pill border border-line px-3 py-0.5 text-sm font-semibold text-ink-soft">
                  {docs.length}
                </span>
              </div>

              {docs.length === 0 ? (
                <p className="mt-3 text-sm text-ink-soft">Nog niets in deze categorie.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface-soft p-3">
                      <span aria-hidden="true">📄</span>
                      <span className="min-w-0 flex-1 truncate font-semibold">{d.name}</span>
                      {d.storage_path ? (
                        <button
                          onClick={() => open(d)}
                          className="shrink-0 rounded-pill border-[1.5px] border-line-strong px-3 py-1 text-sm font-semibold"
                        >
                          Openen
                        </button>
                      ) : (
                        <span className="shrink-0 text-sm text-ink-faint">geen bestand</span>
                      )}
                      <button
                        onClick={() => {
                          if (confirm(`"${d.name}" verwijderen?`)) verwijder.mutate(d)
                        }}
                        className="shrink-0 rounded-pill border border-alert px-3 py-1 text-sm font-semibold text-alert"
                      >
                        Wissen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </div>

      <p className="text-sm text-ink-faint">
        Links naar documenten zijn vijf minuten geldig en niet deelbaar. Verwijderen wist ook het
        bestand zelf.
      </p>
    </div>
  )
}
