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
 * "Onthoud dit" — het geheugen dat de persoon zelf vult. Eén knop,
 * inspreken of typen, en later kan hij het terugvragen: "waar heb ik mijn
 * sleutels gelegd?". Op het scherm blijven alleen de laatste van vandaag
 * en gisteren staan; ouder is zelden nog waar.
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

  return (
    <section aria-labelledby="onthoud">
      <h2 id="onthoud" className="text-base font-bold text-ink-faint">
        {vertaal('onthoud.titel')}
      </h2>

      {recent.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {recent.map((n) => {
            const d = new Date(n.created_at)
            const dag = localDateKey(d, timezone) === vandaag ? 'vandaag' : 'gisteren'
            return (
              <li key={n.id} className="flex items-start gap-3 rounded-card bg-surface p-4 shadow-card">
                <Pin size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-lg">{n.body}</span>
                  <span className="text-sm text-ink-faint">
                    {dag} om {hhmm(d, timezone)}
                  </span>
                </span>
                <button
                  onClick={() => wis.mutate(n.id)}
                  aria-label={vertaal('onthoud.magWeg')}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-surface-soft"
                >
                  <X size={18} strokeWidth={1.75} />
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (tekst.trim()) bewaar.mutate(tekst)
          }}
          className="mt-3 rounded-card bg-surface p-4 shadow-card"
        >
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="onthoud-tekst" className="text-sm font-semibold text-ink-soft">
              Wat wil je onthouden?
            </label>
            {/* Inspreken is hier de hoofdweg: sneller dan typen, en je
                handen zijn vaak net vol met wat je wil wegleggen. */}
            <DictateButton onTekst={(tekst) => setTekst(tekst)} label={vertaal('onthoud.inspreken')} />
          </div>
          <textarea
            id="onthoud-tekst"
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            rows={2}
            autoFocus
            placeholder={vertaal('onthoud.voorbeeld')}
            className="mt-2 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3 text-lg"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={!tekst.trim() || bewaar.isPending}
              className="flex min-h-touch flex-1 items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white disabled:opacity-50"
            >
              {bewaar.isPending ? vertaal('onthoud.bezig') : vertaal('onthoud.titel')}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setTekst('')
              }}
              className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
            >
              Annuleren
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-3 flex min-h-[3.4rem] w-full items-center justify-center gap-2 rounded-pill border-[1.5px] border-dashed border-line-strong text-lg font-semibold text-ink-soft"
        >
          <Pin size={20} strokeWidth={1.75} aria-hidden="true" />
          Iets onthouden
        </button>
      )}
    </section>
  )
}
