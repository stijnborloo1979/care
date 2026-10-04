import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { useOrganisatie } from './useOrganisatie'
import { medewerkers, nogWisbaar, stuurTeambericht, teamberichten, wisTeambericht } from './zorgApi'
import { Fout, Kop, Laden, Leeg, uur } from './ui'
import { tt, uiLocale } from '../../lib/uiTaal'

const dagLabel = (iso: string) => {
  const d = new Date(iso)
  const vandaag = new Date()
  if (d.toDateString() === vandaag.toDateString()) return tt('Vandaag')
  const gisteren = new Date(vandaag)
  gisteren.setDate(gisteren.getDate() - 1)
  if (d.toDateString() === gisteren.toDateString()) return tt('Gisteren')
  return d.toLocaleDateString(uiLocale(), { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * Korte berichten tussen collega's van één afdeling. Geen dossier: wat
 * over een bewoner blijvend belangrijk is, hoort in een zorgnotitie.
 */
export default function Team() {
  const { org } = useOrganisatie()
  const { session } = useAuth()
  const ik = session?.user.id ?? ''
  const queryClient = useQueryClient()
  const afdelingen = org?.afdelingen ?? []
  const [gekozen, setGekozen] = useState<string | null>(null)
  const afdeling = afdelingen.find((a) => a.id === gekozen) ?? afdelingen[0] ?? null
  const sleutel = ['zorg', 'team', afdeling?.id]

  const lijst = useQuery({
    queryKey: sleutel,
    enabled: !!afdeling,
    queryFn: () => teamberichten(afdeling!.id),
    refetchInterval: 60_000,
  })
  const team = useQuery({ queryKey: ['zorg', 'medewerkers', org?.org_id], enabled: !!org, queryFn: () => medewerkers(org!.org_id) })
  const namen = Object.fromEntries((team.data ?? []).map((m) => [m.profile_id, m.naam]))

  // Live: een nieuw bericht van een collega komt meteen binnen.
  useEffect(() => {
    if (!afdeling) return
    const kanaal = supabase
      .channel(`team:${afdeling.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'team_message', filter: `department_id=eq.${afdeling.id}` },
        () => queryClient.invalidateQueries({ queryKey: ['zorg', 'team', afdeling.id] }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(kanaal)
    }
  }, [afdeling, queryClient])

  const [tekst, setTekst] = useState('')
  const stuur = useMutation({
    mutationFn: () => stuurTeambericht(afdeling!.id, tekst, ik),
    onSuccess: () => {
      setTekst('')
      queryClient.invalidateQueries({ queryKey: sleutel })
    },
  })
  const wis = useMutation({ mutationFn: wisTeambericht, onSuccess: () => queryClient.invalidateQueries({ queryKey: sleutel }) })

  const einde = useRef<HTMLDivElement>(null)
  useEffect(() => {
    einde.current?.scrollIntoView({ block: 'end' })
  }, [lijst.data?.length])

  if (!org) return null
  if (afdelingen.length === 0) {
    return (
      <div className="space-y-6">
        <Kop titel={tt('Team')} />
        <Leeg>{tt('Je staat nog op geen afdeling. De beheerder van {org} zet je op een afdeling.', { org: org.naam })}</Leeg>
      </div>
    )
  }

  let vorigeDag = ''
  return (
    <div className="space-y-4">
      <Kop titel={tt('Team')} uitleg={tt('Korte berichten voor je afdeling. Wat over een bewoner blijvend belangrijk is, schrijf je in een zorgnotitie.')} />

      {afdelingen.length > 1 ? (
        <div role="tablist" aria-label={tt('Afdeling')} className="flex flex-wrap gap-2">
          {afdelingen.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={a.id === afdeling?.id}
              onClick={() => setGekozen(a.id)}
              className={`min-h-touch rounded-pill px-4 font-semibold ${
                a.id === afdeling?.id ? 'bg-accent-ink text-white' : 'border-[1.5px] border-line-strong bg-surface'
              }`}
            >
              {a.naam}
            </button>
          ))}
        </div>
      ) : null}

      <section className="rounded-card bg-surface p-4 shadow-card sm:p-5" aria-label={tt('Berichten van {afdeling}', { afdeling: afdeling?.naam ?? '' })}>
        {lijst.isLoading ? <Laden /> : null}
        <Fout fout={lijst.error} />
        {lijst.data && lijst.data.length === 0 ? <Leeg>{tt('Nog geen berichten op {afdeling}.', { afdeling: afdeling?.naam ?? '' })}</Leeg> : null}
        <ol className="space-y-2" aria-live="polite">
          {(lijst.data ?? []).map((b) => {
            const dag = dagLabel(b.created_at)
            const nieuweDag = dag !== vorigeDag
            vorigeDag = dag
            const vanMij = b.author_id === ik
            return (
              <li key={b.id}>
                {nieuweDag ? (
                  <p className="my-3 text-center text-xs font-semibold uppercase tracking-wide text-ink-faint">{dag}</p>
                ) : null}
                <div className={`flex ${vanMij ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
                      vanMij ? 'bg-accent-soft text-ink' : 'bg-surface-soft'
                    }`}
                  >
                    {!vanMij ? (
                      <p className="text-sm font-semibold text-accent-ink">{(b.author_id && namen[b.author_id]) || tt('Een collega')}</p>
                    ) : null}
                    <p className="whitespace-pre-wrap break-words">{b.body}</p>
                    <p className="mt-0.5 flex items-center justify-end gap-2 text-xs text-ink-faint">
                      {vanMij && nogWisbaar(b.created_at) ? (
                        <button onClick={() => wis.mutate(b.id)} className="font-semibold underline underline-offset-2">
                          {tt('wissen')}
                        </button>
                      ) : null}
                      <time dateTime={b.created_at}>{uur(b.created_at)}</time>
                    </p>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
        <div ref={einde} />
      </section>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (tekst.trim()) stuur.mutate()
        }}
        className="sticky bottom-20 flex items-end gap-2 rounded-card bg-surface p-3 shadow-lift lg:bottom-4"
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">{tt('Bericht aan {afdeling}', { afdeling: afdeling?.naam ?? '' })}</span>
          <textarea
            rows={1}
            maxLength={2000}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (tekst.trim()) stuur.mutate()
              }
            }}
            placeholder={afdeling?.naam ? tt('Bericht aan {afdeling}', { afdeling: afdeling.naam }) : tt('Bericht aan je afdeling')}
            className="block max-h-40 min-h-touch w-full resize-none rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3"
          />
        </label>
        <button
          type="submit"
          disabled={!tekst.trim() || stuur.isPending}
          aria-label={tt('Versturen')}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-ink text-white disabled:opacity-50"
        >
          <Send size={20} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </form>
      <Fout fout={stuur.error ?? wis.error} />
    </div>
  )
}
