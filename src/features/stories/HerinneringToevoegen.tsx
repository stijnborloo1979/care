import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { savePhoto, uploadPhoto } from '../../services/memories'
import { tt } from '../../lib/uiTaal'

/**
 * Een herinnering toevoegen: een foto met een korte tekst. De persoon zelf
 * kan dit ook (migratie 96). Verschijnt in het boek bij het hoofdstuk dat
 * past, anders onder "Uit het album".
 */
export default function HerinneringToevoegen({ hh }: { hh: string }) {
  const qc = useQueryClient()
  const [titel, setTitel] = useState('')
  const [verhaal, setVerhaal] = useState('')
  const [bestand, setBestand] = useState<File | null>(null)
  const [klaar, setKlaar] = useState(false)

  const bewaar = useMutation({
    mutationFn: async () => {
      if (!bestand) throw new Error('geen foto')
      const id = await savePhoto({
        householdId: hh,
        year: null,
        title: titel.trim() || tt('Herinnering'),
        story: verhaal.trim(),
      })
      await uploadPhoto(hh, id, bestand)
    },
    onSuccess: async () => {
      setTitel('')
      setVerhaal('')
      setBestand(null)
      setKlaar(true)
      await qc.invalidateQueries({ queryKey: ['photos', hh] })
    },
  })

  return (
    <section className="niet-printen mb-10 space-y-4 rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-2xl font-extrabold">{tt('Voeg een herinnering toe')}</h2>

      <label className="block space-y-2">
        <span className="text-lg font-semibold">{tt('Kies een foto')}</span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            setBestand(e.target.files?.[0] ?? null)
            setKlaar(false)
          }}
          className="block w-full text-lg"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-lg font-semibold">{tt('Geef de herinnering een naam')}</span>
        <input
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          className="min-h-touch w-full rounded-card border-2 border-line bg-bg px-4 text-lg"
        />
      </label>

      <label className="block space-y-2">
        <span className="text-lg font-semibold">{tt('Wat herinner je je?')}</span>
        <textarea
          value={verhaal}
          onChange={(e) => setVerhaal(e.target.value)}
          rows={3}
          className="w-full rounded-card border-2 border-line bg-bg px-4 py-3 text-lg"
        />
      </label>

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={() => bewaar.mutate()}
          disabled={!bestand || bewaar.isPending}
          className="min-h-big rounded-pill bg-accent px-8 text-xl font-bold text-accent-ink disabled:opacity-50"
        >
          {tt('Bewaar herinnering')}
        </button>
        {klaar ? <p className="text-lg font-semibold text-ink-soft">{tt('Herinnering bewaard.')}</p> : null}
        {bewaar.isError ? <p className="text-lg text-alert">{tt('Dat lukte nu niet. Probeer het later nog eens.')}</p> : null}
      </div>
    </section>
  )
}
