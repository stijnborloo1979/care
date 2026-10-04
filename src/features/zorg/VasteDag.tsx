import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { afdelingen as haalAfdelingen } from './zorgApi'
import { useAuth } from '../auth/AuthProvider'
import { mijnLeidAfdelingen } from '../../services/nieuws'
import {
  dagenTekst,
  nieuwVastMoment,
  uurKort,
  vasteDag,
  wisVastMoment,
  WEEKDAGEN,
  zetVastMomentActief,
  type VastMoment,
} from '../../services/afdelingsdag'
import { Fout, Kaart, Laden, Leeg, knop, knopKlein, label, veld } from './ui'

const SOORTEN: { id: VastMoment['soort']; naam: string; emoji: string }[] = [
  { id: 'maaltijd', naam: 'Maaltijd', emoji: '🍽️' },
  { id: 'rust', naam: 'Rust', emoji: '🛋️' },
  { id: 'activiteit', naam: 'Activiteit', emoji: '🎵' },
  { id: 'verzorging', naam: 'Verzorging', emoji: '🛁' },
  { id: 'andere', naam: 'Andere', emoji: '📌' },
]

/**
 * De vaste dag van een afdeling (78): ontbijt, middagmaal, rust, koffie.
 * Eén keer ingevuld, elke dag op de tablet van elke bewoner van die
 * afdeling, en in de app van haar familie.
 */
export default function VasteDag({ orgId, magPlannen, beheert }: { orgId: string; magPlannen: boolean; beheert: boolean }) {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const ik = session?.user.id ?? ''
  // Een team lead plant alleen voor zijn eigen afdeling(en) (78).
  const leid = useQuery({ queryKey: ['zorg', 'leid-afdelingen', ik], queryFn: () => mijnLeidAfdelingen(ik), enabled: !!ik && magPlannen && !beheert })
  const magHier = (dep: string | null) => beheert || (!!dep && (leid.data ?? []).includes(dep))
  const sleutel = ['zorg', 'vaste-dag', orgId]
  const lijst = useQuery({ queryKey: sleutel, queryFn: () => vasteDag(orgId), enabled: !!orgId })
  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId), enabled: !!orgId })
  const namen = Object.fromEntries((afd.data ?? []).map((a) => [a.id, a.name]))
  const ververs = () => {
    queryClient.invalidateQueries({ queryKey: sleutel })
    queryClient.invalidateQueries({ queryKey: ['dag-van-huis'] })
  }
  const actief = useMutation({ mutationFn: (p: { id: string; actief: boolean }) => zetVastMomentActief(p.id, p.actief), onSuccess: ververs })
  const wis = useMutation({ mutationFn: (id: string) => wisVastMoment(id), onSuccess: ververs })

  // Per afdeling, het hele huis eerst.
  const groepen = new Map<string, VastMoment[]>()
  for (const m of lijst.data ?? []) {
    const k = m.department_id ?? ''
    groepen.set(k, [...(groepen.get(k) ?? []), m])
  }
  const volgorde = [...groepen.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : (namen[a] ?? '').localeCompare(namen[b] ?? '')))

  return (
    <Kaart titel="De vaste dag">
      <p className="text-ink-soft">
        Wat elke dag terugkomt. Het staat vanzelf op de tablet van elke bewoner van die afdeling, en bij haar familie.
      </p>
      {lijst.isLoading ? <Laden /> : null}
      <Fout fout={lijst.error ?? actief.error ?? wis.error} />
      {lijst.data && lijst.data.length === 0 ? <Leeg>Nog geen vaste dag ingevuld.</Leeg> : null}

      <div className="mt-3 space-y-4">
        {volgorde.map((k) => (
          <div key={k || 'huis'}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-ink-faint">
              {k ? `Afdeling ${namen[k] ?? '…'}` : 'Het hele woonzorgcentrum'}
            </h3>
            <ul className="mt-1.5 space-y-1.5">
              {(groepen.get(k) ?? []).map((m) => (
                <li
                  key={m.id}
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-surface-soft px-3 py-2 ${m.actief ? '' : 'opacity-60'}`}
                >
                  <span className="w-full shrink-0 whitespace-nowrap font-bold tabular-nums text-ink-soft sm:w-[7.5rem]">
                    {uurKort(m.begint)}
                    {m.eindigt ? `–${uurKort(m.eindigt)}` : ''}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">
                      <span aria-hidden="true">{m.emoji || SOORTEN.find((s) => s.id === m.soort)?.emoji} </span>
                      {m.titel}
                    </span>
                    <span className="block text-sm text-ink-soft">
                      {dagenTekst(m.dagen)}
                      {m.actief ? '' : ' · staat uit'}
                    </span>
                  </span>
                  {magPlannen && magHier(m.department_id) ? (
                    <span className="flex gap-1">
                      <button
                        onClick={() => actief.mutate({ id: m.id, actief: !m.actief })}
                        aria-pressed={m.actief}
                        className={knopKlein}
                      >
                        {m.actief ? 'Zet uit' : 'Zet aan'}
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`"${m.titel}" wissen?`)) wis.mutate(m.id)
                        }}
                        aria-label={`${m.titel} wissen`}
                        className={knopKlein}
                      >
                        <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {magPlannen && (beheert || (leid.data ?? []).length > 0) ? (
        <NieuwMoment
          orgId={orgId}
          aanIedereen={beheert}
          afdelingen={(afd.data ?? []).filter((a) => magHier(a.id))}
          onKlaar={ververs}
        />
      ) : null}
    </Kaart>
  )
}

function NieuwMoment({
  orgId,
  aanIedereen,
  afdelingen,
  onKlaar,
}: {
  orgId: string
  aanIedereen: boolean
  afdelingen: { id: string; name: string }[]
  onKlaar: () => void
}) {
  const [titel, setTitel] = useState('')
  const [soort, setSoort] = useState<VastMoment['soort']>('maaltijd')
  const [begint, setBegint] = useState('12:00')
  const [eindigt, setEindigt] = useState('')
  const [afdeling, setAfdeling] = useState('')
  const [dagen, setDagen] = useState<number[]>([1, 2, 3, 4, 5, 6, 7])
  const doel = aanIedereen ? afdeling : afdeling || afdelingen[0]?.id || ''

  const bewaar = useMutation({
    mutationFn: () =>
      nieuwVastMoment({
        org_id: orgId,
        department_id: doel || null,
        titel,
        soort,
        emoji: null,
        begint,
        eindigt: eindigt || null,
        dagen,
      }),
    onSuccess: () => {
      setTitel('')
      setEindigt('')
      onKlaar()
    },
  })

  const wissel = (nr: number) =>
    setDagen((d) => (d.includes(nr) ? (d.length > 1 ? d.filter((x) => x !== nr) : d) : [...d, nr].sort()))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        bewaar.mutate()
      }}
      className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-2"
    >
      <h3 className="text-base font-bold sm:col-span-2">Iets toevoegen</h3>
      <label className="sm:col-span-2">
        <span className={label}>Wat</span>
        <input required maxLength={80} value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Middagmaal" className={veld} />
      </label>
      <label>
        <span className={label}>Soort</span>
        <select value={soort} onChange={(e) => setSoort(e.target.value as VastMoment['soort'])} className={veld}>
          {SOORTEN.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.naam}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>Voor</span>
        <select value={doel} onChange={(e) => setAfdeling(e.target.value)} className={veld}>
          {aanIedereen ? <option value="">Het hele woonzorgcentrum</option> : null}
          {afdelingen.map((a) => (
            <option key={a.id} value={a.id}>
              Afdeling {a.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className={label}>Van</span>
        <input required type="time" value={begint} onChange={(e) => setBegint(e.target.value)} className={veld} />
      </label>
      <label>
        <span className={label}>Tot (mag leeg)</span>
        <input type="time" value={eindigt} onChange={(e) => setEindigt(e.target.value)} className={veld} />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className={label}>Op welke dagen</legend>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {WEEKDAGEN.map((w) => (
            <button
              key={w.nr}
              type="button"
              onClick={() => wissel(w.nr)}
              aria-pressed={dagen.includes(w.nr)}
              className={`min-h-[2.75rem] min-w-[2.75rem] rounded-pill border-[1.5px] px-3 font-semibold ${
                dagen.includes(w.nr) ? 'border-accent-ink bg-accent-soft text-accent-ink' : 'border-line-strong text-ink-soft'
              }`}
            >
              {w.kort}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="sm:col-span-2">
        <button type="submit" disabled={bewaar.isPending} className={`${knop} w-full sm:w-auto`}>
          {bewaar.isPending ? 'Bezig…' : 'Toevoegen aan de vaste dag'}
        </button>
        <Fout fout={bewaar.error} />
      </div>
    </form>
  )
}
