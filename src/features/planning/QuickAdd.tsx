import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import DictateButton from '../../components/DictateButton'
import Icon from '../../components/Icon'
import { quickAdd } from './quickAdd'

/**
 * Eén veld in plaats van een formulier. De app toont eerst wat ze ervan
 * begrepen heeft; pas daarna wordt het opgeslagen. Zo kan ze zich niet
 * stilletjes vergissen in een uur.
 */
export default function QuickAdd({ householdId }: { householdId: string }) {
  const [tekst, setTekst] = useState('')
  const [fout, setFout] = useState<string | null>(null)
  const [gelukt, setGelukt] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const herkend = tekst.trim() ? quickAdd(tekst) : null

  const bewaren = useMutation({
    mutationFn: async () => {
      if (!herkend) throw new Error('Geen tijd herkend')
      const { error } = await supabase.from('agenda_event').insert({
        household_id: householdId,
        starts_at: herkend.startsAt.toISOString(),
        title: herkend.titel,
        kind: 'appt',
        emoji: '📌',
      })
      if (error) throw error
      return herkend
    },
    onSuccess: async (r) => {
      setGelukt(`${r.titel} staat in de planning, ${r.uitleg}.`)
      setTekst('')
      await queryClient.invalidateQueries({ queryKey: ['agenda', householdId] })
      await queryClient.invalidateQueries({ queryKey: ['week', householdId] })
      await queryClient.invalidateQueries({ queryKey: ['summary', householdId] })
    },
    onError: (e) => setFout(e instanceof Error ? e.message : 'Toevoegen lukte niet.'),
  })

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">Snel een afspraak toevoegen</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Typ of spreek het in gewone taal in: <em>donderdag 14u dokter Janssens</em>.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setFout(null)
          setGelukt(null)
          if (!herkend) {
            setFout('Ik haal er geen dag of uur uit. Probeer "morgen 14u dokter".')
            return
          }
          bewaren.mutate()
        }}
        className="mt-4 flex flex-wrap gap-2"
      >
        <input
          value={tekst}
          onChange={(e) => {
            setTekst(e.target.value)
            setFout(null)
            setGelukt(null)
          }}
          placeholder="morgen 10u kapper"
          className="min-h-touch min-w-[12rem] flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
        />
        <DictateButton onTekst={(t) => setTekst(t.replace(/\.$/, ''))} />
        <button
          type="submit"
          disabled={bewaren.isPending}
          className="flex min-h-touch items-center gap-2 rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
        >
          <Icon naam="nieuw" size={18} />
          Toevoegen
        </button>
      </form>

      {herkend ? (
        <p className="mt-3 text-sm text-ink-soft">
          Begrepen als <strong>{herkend.titel}</strong>, {herkend.uitleg}.
        </p>
      ) : null}

      {gelukt ? <p className="mt-3 text-sm font-semibold text-ok">{gelukt}</p> : null}
      {fout ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {fout}
        </p>
      ) : null}
    </section>
  )
}
