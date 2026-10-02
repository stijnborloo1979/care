import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, CheckCheck, HeartHandshake, Volume2 } from 'lucide-react'
import DictateButton from '../../components/DictateButton'
import { spreek } from '../voice/useSpeech'
import { hhmm } from '../../lib/time'
import { berichtenVan, draden, lopendVerblijf, stuurAanZorgteam } from './bewonerBerichten'
import { foutTekst } from './ui'

/**
 * Op de tablet van de bewoner, alleen als hij in een woonzorgcentrum
 * verblijft: iets vragen aan zijn zorgteam. Inspreken is de hoofdweg.
 * Daaronder zijn laatste vragen, of ze gezien zijn, en het antwoord.
 */
export default function ZorgteamKaart({ householdId, timezone }: { householdId: string; timezone: string }) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [tekst, setTekst] = useState('')
  const [verstuurd, setVerstuurd] = useState(false)

  const verblijf = useQuery({
    queryKey: ['lopend-verblijf', householdId],
    queryFn: () => lopendVerblijf(householdId),
    staleTime: 10 * 60_000,
    retry: false,
  })
  const berichten = useQuery({
    queryKey: ['bewoner-berichten', householdId],
    enabled: !!verblijf.data,
    queryFn: () => berichtenVan(householdId, 20),
    // Een tablet krijgt geen focus: zo verschijnt een antwoord vanzelf.
    refetchInterval: 60_000,
  })
  const stuur = useMutation({
    mutationFn: () => stuurAanZorgteam(householdId, tekst),
    onSuccess: () => {
      setTekst('')
      setOpen(false)
      setVerstuurd(true)
      queryClient.invalidateQueries({ queryKey: ['bewoner-berichten', householdId] })
    },
  })

  if (!verblijf.data) return null
  const lijst = draden(berichten.data ?? []).slice(0, 3)

  return (
    <section aria-labelledby="zorgteam" className="space-y-3">
      <h2 id="zorgteam" className="text-base font-bold text-ink-faint">
        Het zorgteam
      </h2>

      {verstuurd && !open ? (
        <p role="status" className="flex items-center gap-2 rounded-card bg-accent-soft p-4 text-lg font-semibold text-accent-ink">
          <Check size={22} strokeWidth={2} aria-hidden="true" />
          Verstuurd. Het zorgteam ziet je bericht.
        </p>
      ) : null}

      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (tekst.trim()) stuur.mutate()
          }}
          className="rounded-card bg-surface p-4 shadow-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="zorgteam-tekst" className="text-lg font-semibold">
              Wat wil je vragen?
            </label>
            <DictateButton onTekst={(t) => setTekst(t)} label="Inspreken" />
          </div>
          <textarea
            id="zorgteam-tekst"
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            rows={3}
            autoFocus
            maxLength={1000}
            placeholder="Mag ik een extra deken?"
            className="mt-2 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3 text-lg"
          />
          {stuur.error ? (
            <p role="alert" className="mt-2 text-alert">
              {foutTekst(stuur.error)}
            </p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={!tekst.trim() || stuur.isPending}
              className="flex min-h-touch flex-1 items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white disabled:opacity-50"
            >
              {stuur.isPending ? 'Bezig…' : 'Versturen'}
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
          onClick={() => {
            setOpen(true)
            setVerstuurd(false)
          }}
          className="flex min-h-big w-full items-center justify-center gap-3 rounded-card border-[1.5px] border-line bg-surface px-4 text-xl font-bold shadow-card"
        >
          <HeartHandshake size={28} strokeWidth={1.75} aria-hidden="true" />
          Iets vragen aan het zorgteam
        </button>
      )}

      {lijst.length > 0 ? (
        <ul className="space-y-2">
          {lijst.map(({ vraag, antwoorden }) => (
            <li key={vraag.id} className="rounded-card bg-surface p-4 shadow-card">
              <p className="text-lg">{vraag.body}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-soft">
                {vraag.gezien_at ? (
                  <>
                    <CheckCheck size={16} strokeWidth={2} className="text-accent-ink" aria-hidden="true" />
                    Gezien door het zorgteam
                  </>
                ) : (
                  <>
                    <Check size={16} strokeWidth={2} aria-hidden="true" />
                    Verstuurd om {hhmm(new Date(vraag.created_at), timezone)}
                  </>
                )}
              </p>
              {antwoorden.map((a) => (
                <div key={a.id} className="mt-3 flex items-start gap-3 rounded-2xl bg-accent-soft p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-accent-ink">Het zorgteam</span>
                    <span className="block text-lg">{a.body}</span>
                  </span>
                  <button
                    onClick={() => spreek(a.body)}
                    aria-label="Antwoord voorlezen"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface text-accent-ink"
                  >
                    <Volume2 size={20} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                </div>
              ))}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
