import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Car } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { actueel, meldUitstap, naarLokaleTijd, toestand, uitLokaleTijd, uitstapStap, uitstappen, vanTot, type Uitstap } from '../../services/uitstap'
import { foutTekst } from '../zorg/ui'

const WOORD: Record<ReturnType<typeof toestand>, string> = {
  gepland: 'gepland',
  weg: 'vertrokken',
  'te-laat': 'nog niet terug',
  terug: 'terug',
  geannuleerd: 'geannuleerd',
}

/**
 * Uitstap (80). De familie meldt vooraf "Els neemt mama mee van 14 tot 17
 * uur"; het team duidt vertrokken en terug aan. Zelfde kaart in het
 * familiedashboard en in het dossier van het zorgteam.
 */
export default function UitstapKaart({
  householdId,
  personName,
  timezone,
  vorm,
}: {
  householdId: string
  personName: string
  timezone: string
  vorm: 'familie' | 'zorgteam'
}) {
  const queryClient = useQueryClient()
  const sleutel = ['uitstappen', householdId]
  const lijst = useQuery({ queryKey: sleutel, queryFn: () => uitstappen(householdId), enabled: !!householdId, refetchInterval: 5 * 60_000, retry: false })
  const [open, setOpen] = useState(false)
  const ververs = () => {
    queryClient.invalidateQueries({ queryKey: sleutel })
    queryClient.invalidateQueries({ queryKey: ['uitstappen-team'] })
  }
  const stap = useMutation({ mutationFn: (p: { id: string; stap: 'weg' | 'terug' | 'geannuleerd' }) => uitstapStap(p.id, p.stap), onSuccess: ververs })

  const nu = new Date()
  const lopend = (lijst.data ?? []).filter((u) => actueel(u, nu, timezone))

  return (
    <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby={`uitstap-${vorm}`}>
      <h2 id={`uitstap-${vorm}`} className="flex items-center gap-2 text-lg font-bold">
        <Car size={20} strokeWidth={1.75} aria-hidden="true" /> Uitstap
      </h2>
      <p className="mt-1 text-ink-soft">
        {vorm === 'familie'
          ? `Neem je ${personName} mee? Meld het hier, dan weet het zorgteam waar ${personName} is en zegt de tablet wie er komt.`
          : `Wie ${personName} meeneemt, en wanneer ze terug is.`}
      </p>

      {lopend.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {lopend.map((u) => (
            <Rij key={u.id} u={u} tz={timezone} nu={nu} bezig={stap.isPending} onStap={(s) => stap.mutate({ id: u.id, stap: s })} />
          ))}
        </ul>
      ) : null}
      {stap.error ? <p className="mt-2 text-sm text-alert">{foutTekst(stap.error)}</p> : null}

      {open ? (
        <Melden householdId={householdId} tz={timezone} onKlaar={() => { setOpen(false); ververs() }} onStop={() => setOpen(false)} />
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="mt-4 inline-flex min-h-touch items-center rounded-pill bg-accent-ink px-5 font-semibold text-white"
        >
          Uitstap melden
        </button>
      )}
    </section>
  )
}

function Rij({ u, tz, nu, bezig, onStap }: { u: Uitstap; tz: string; nu: Date; bezig: boolean; onStap: (s: 'weg' | 'terug' | 'geannuleerd') => void }) {
  const tst = toestand(u, nu)
  return (
    <li className={`rounded-2xl px-4 py-3 ${tst === 'te-laat' ? 'bg-alert-soft ring-1 ring-alert' : 'bg-surface-soft'}`}>
      <p className="font-semibold">
        Met {u.met_wie} · {vanTot(u, tz, nu)}
      </p>
      {u.notitie ? <p className="text-ink-soft">{u.notitie}</p> : null}
      <p className={`text-sm ${tst === 'te-laat' ? 'font-semibold text-alert' : 'text-ink-faint'}`}>{WOORD[tst]}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {u.status === 'gepland' ? (
          <>
            <button disabled={bezig} onClick={() => onStap('weg')} className="min-h-[2.5rem] rounded-pill border-[1.5px] border-line-strong px-4 text-sm font-semibold">
              Vertrokken
            </button>
            <button
              disabled={bezig}
              onClick={() => { if (confirm('Deze uitstap annuleren?')) onStap('geannuleerd') }}
              className="min-h-[2.5rem] rounded-pill px-3 text-sm font-semibold text-ink-soft underline underline-offset-4"
            >
              Annuleren
            </button>
          </>
        ) : null}
        {u.status === 'weg' ? (
          <button disabled={bezig} onClick={() => onStap('terug')} className="min-h-[2.5rem] rounded-pill bg-accent-ink px-4 text-sm font-semibold text-white">
            Is terug
          </button>
        ) : null}
      </div>
    </li>
  )
}

function Melden({ householdId, tz, onKlaar, onStop }: { householdId: string; tz: string; onKlaar: () => void; onStop: () => void }) {
  const { session } = useAuth()
  const ik = session?.user.id ?? ''
  // Het volgende hele uur; tijden in de tijdzone van de bewoner.
  const begin = new Date(Math.ceil((Date.now() + 30 * 60_000) / 3600_000) * 3600_000)
  const [metWie, setMetWie] = useState('')
  const [vertrek, setVertrek] = useState(naarLokaleTijd(begin, tz))
  const [terug, setTerug] = useState(naarLokaleTijd(new Date(begin.getTime() + 3 * 3600_000), tz))
  const [notitie, setNotitie] = useState('')
  const [fout, setFout] = useState<string | null>(null)

  const bewaar = useMutation({
    mutationFn: () => meldUitstap({ hh: householdId, metWie, vertrek: uitLokaleTijd(vertrek, tz), terug: uitLokaleTijd(terug, tz), notitie, auteur: ik }),
    onSuccess: onKlaar,
    onError: (e) => setFout(foutTekst(e)),
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (uitLokaleTijd(terug, tz) <= uitLokaleTijd(vertrek, tz)) return setFout('Terug moet na het vertrek liggen.')
        setFout(null)
        bewaar.mutate()
      }}
      className="mt-4 grid gap-3 sm:grid-cols-2"
    >
      <label className="sm:col-span-2">
        <span className="text-sm font-semibold text-ink-soft">Met wie</span>
        <input required maxLength={80} value={metWie} onChange={(e) => setMetWie(e.target.value)} placeholder="Els" className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4" />
      </label>
      <label>
        <span className="text-sm font-semibold text-ink-soft">Vertrek</span>
        <input required type="datetime-local" value={vertrek} onChange={(e) => setVertrek(e.target.value)} className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4" />
      </label>
      <label>
        <span className="text-sm font-semibold text-ink-soft">Terug</span>
        <input required type="datetime-local" value={terug} onChange={(e) => setTerug(e.target.value)} className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4" />
      </label>
      <label className="sm:col-span-2">
        <span className="text-sm font-semibold text-ink-soft">Waar naartoe (mag leeg)</span>
        <input maxLength={300} value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Naar de markt en daarna bij ons eten" className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4" />
      </label>
      {fout ? <p className="text-sm text-alert sm:col-span-2">{fout}</p> : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={bewaar.isPending} className="min-h-touch rounded-pill bg-accent-ink px-5 font-semibold text-white">
          {bewaar.isPending ? 'Bezig…' : 'Melden'}
        </button>
        <button type="button" onClick={onStop} className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold">
          Annuleren
        </button>
      </div>
    </form>
  )
}
