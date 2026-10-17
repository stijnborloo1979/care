import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pin, X } from 'lucide-react'
import DictateButton from '../../components/DictateButton'
import { addQuickNote, deleteQuickNote, getQuickNotes } from '../../services/quickNotes'
import { hhmm, localDateKey } from '../../lib/time'
import { spreek } from '../voice/useSpeech'
import { huidigePrefs } from '../settings/useDisplayPrefs'
import { t as vertaal } from '../../lib/i18n'

/**
 * "Onthoud dit" — het geheugen dat de persoon zelf vult. Eén grote kaart
 * om iets te zeggen of te typen. Daaronder de laatste van vandaag en
 * gisteren; ouder is zelden nog waar.
 *
 * Eén primaire actie: de kaart. Geen gestippelde rand, want die lijkt op
 * een lege of uitgeschakelde knop.
 */
export default function OnthoudDit({ householdId, timezone }: { householdId: string; timezone: string }) {
  const [open, setOpen] = useState(false)
  const [tekst, setTekst] = useState('')
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['quicknotes', householdId],
    queryFn: () => getQuickNotes(householdId),
    enabled: !!householdId,
    staleTime: 30_000,
  })

  const bewaar = useMutation({
    mutationFn: (body: string) => addQuickNote(householdId, body),
    onSuccess: async () => {
      setTekst('')
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['quicknotes', householdId] })
      if (huidigePrefs().voice) spreek(vertaal('onthoud.bewaard'))
    },
  })

  const wis = useMutation({
    mutationFn: (id: string) => deleteQuickNote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quicknotes', householdId] }),
  })

  const nu = new Date()
  const vandaag = localDateKey(nu, timezone)
  const gisteren = localDateKey(new Date(nu.getTime() - 24 * 3600_000), timezone)
  const recent = (data ?? [])
    .filter((n) => {
      const d = localDateKey(new Date(n.created_at), timezone)
      return d === vandaag || d === gisteren
    })
    .slice(0, 3)

  if (open) {
    return (
      <section aria-labelledby="onthoud-vraag">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (tekst.trim()) bewaar.mutate(tekst)
          }}
          className="space-y-5 rounded-card bg-surface p-6 shadow-card"
        >
          <h2 id="onthoud-vraag" className="text-2xl font-bold tracking-tight">
            {vertaal('onthoud.vraag')}
          </h2>
          {/* Inspreken is de hoofdweg: je handen zijn vaak vol. */}
          <DictateButton onTekst={(tekst) => setTekst(tekst)} label={vertaal('onthoud.inspreken')} />
          <label htmlFor="onthoud-tekst" className="sr-only">
            {vertaal('onthoud.vraag')}
          </label>
          <textarea
            id="onthoud-tekst"
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            rows={3}
            autoFocus
            placeholder={vertaal('onthoud.voorbeeld')}
            className="w-full rounded-2xl border-[1.5px] border-line-strong bg-bg px-5 py-4 text-xl"
          />
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!tekst.trim() || bewaar.isPending}
              className="min-h-big flex-1 rounded-pill bg-accent-ink px-6 text-xl font-bold text-white transition active:scale-[0.99] disabled:opacity-50"
            >
              {bewaar.isPending ? vertaal('onthoud.bezig') : vertaal('onthoud.titel')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setTekst('')
              }}
              className="min-h-big rounded-pill border-[1.5px] border-line-strong px-6 text-lg font-semibold"
            >
              {vertaal('algemeen.annuleren')}
            </button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <section aria-labelledby="onthoud">
      <h2 id="onthoud" className="sr-only">
        {vertaal('onthoud.titel')}
      </h2>

      <button
        onClick={() => setOpen(true)}
        className="flex min-h-big w-full items-center gap-5 rounded-card bg-surface p-6 text-left shadow-card transition active:scale-[0.99]"
      >
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-ink">
          <Pin size={26} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-2xl font-bold tracking-tight">{vertaal('onthoud.vertelHet')}</span>
          <span className="mt-1 block text-lg text-ink-soft">{vertaal('onthoud.vraag')}</span>
        </span>
      </button>

      {recent.length === 0 ? (
        <p className="mt-6 text-lg text-ink-soft">{vertaal('onthoud.leeg')}</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {recent.map((n) => {
            const d = new Date(n.created_at)
            const dag = localDateKey(d, timezone) === vandaag ? 'vandaag' : 'gisteren'
            return (
              <li key={n.id} className="flex items-center gap-4 rounded-card bg-surface p-5 shadow-card">
                <span className="min-w-0 flex-1">
                  <span className="block text-xl leading-snug">{n.body}</span>
                  <span className="mt-1 block text-base text-ink-soft">
                    {dag} om {hhmm(d, timezone)}
                  </span>
                </span>
                <button
                  onClick={() => wis.mutate(n.id)}
                  aria-label={vertaal('onthoud.magWeg')}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-surface-soft"
                >
                  <X size={22} strokeWidth={1.75} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
