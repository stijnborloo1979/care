import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { toonNaam } from '../messages/messages'

/**
 * Je eigen naam.
 *
 * Wie zich aanmeldt zonder naam op te geven, krijgt zijn e-mailadres als
 * naam. Dan staat er "Foto van borloo.stijn@telenet.be" op het scherm van
 * iemand met geheugenproblemen — en dat zegt haar niets.
 *
 * toonNaam() maakt daar bij het tonen al iets leesbaars van, maar dat
 * blijft een gok. Hier kan je het gewoon zeggen. Zet er wat zij zou
 * zeggen: "Stijn" of "papa", niet je volledige naam.
 *
 * Het geldt vanaf het volgende bericht: wat je al stuurde, draagt de naam
 * die er toen bij hoorde.
 */
export default function JouwNaam() {
  const { session } = useAuth()
  const id = session?.user.id ?? ''
  const queryClient = useQueryClient()

  const { data } = useQuery({
    queryKey: ['mijn-profiel', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profile')
        .select('full_name')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data as { full_name: string | null } | null)?.full_name ?? ''
    },
  })

  const [naam, setNaam] = useState('')
  const [bewaardNaam, setBewaardNaam] = useState<string | null>(null)

  useEffect(() => {
    if (data !== undefined) setNaam(data)
  }, [data])

  const bewaar = useMutation({
    mutationFn: async (nieuw: string) => {
      const { error } = await supabase.from('profile').update({ full_name: nieuw }).eq('id', id)
      if (error) throw error
      return nieuw
    },
    onSuccess: (nieuw) => {
      setBewaardNaam(nieuw)
      queryClient.invalidateQueries({ queryKey: ['mijn-profiel', id] })
    },
  })

  // Een e-mailadres is geen naam; dan tonen we het veld leeg met de
  // benadering als voorbeeld, in plaats van het adres alvast in te vullen.
  const isAdres = naam.includes('@')
  const waarde = isAdres ? '' : naam

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">Jouw naam</h2>
      <p className="mt-1 max-w-[60ch] text-ink-soft">
        Zo staat het bij een bericht of een foto die je stuurt. Zet wat zij zou zeggen — "Els" of
        "mama" — en niet je volledige naam.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const schoon = waarde.trim()
          if (schoon) bewaar.mutate(schoon)
        }}
        className="mt-4 flex flex-wrap items-end gap-3"
      >
        <label className="min-w-[14rem] flex-1">
          <span className="text-sm font-semibold text-ink-soft">Naam</span>
          <input
            value={waarde}
            onChange={(e) => setNaam(e.target.value)}
            placeholder={isAdres ? toonNaam(naam) : 'Els'}
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>

        <button
          type="submit"
          disabled={bewaar.isPending || !waarde.trim()}
          className="min-h-touch rounded-pill bg-accent-ink px-6 font-semibold text-white disabled:opacity-60"
        >
          {bewaar.isPending ? 'Opslaan…' : 'Opslaan'}
        </button>
      </form>

      {isAdres ? (
        <p className="mt-2 text-sm text-ink-soft">
          Er staat nu je e-mailadres. De app toont voorlopig "{toonNaam(naam)}".
        </p>
      ) : null}

      {bewaardNaam ? (
        <p aria-live="polite" className="mt-2 text-sm font-semibold text-ok">
          Opgeslagen. Het geldt vanaf je volgende bericht.
        </p>
      ) : null}

      {bewaar.isError ? (
        <p role="alert" className="mt-2 text-sm text-alert">
          Dat lukte niet. Probeer het straks nog eens.
        </p>
      ) : null}
    </section>
  )
}
