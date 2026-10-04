import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Glasses, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import StoragePhoto from '../../components/StoragePhoto'
import FotoKiezer from '../../components/FotoKiezer'
import {
  emojiVan,
  markeerGevonden,
  meldKwijt,
  nieuweBezitting,
  sindsTekst,
  spullen,
  SOORTEN,
  uploadSpulFoto,
  wisBezitting,
  type Bezitting,
} from '../../services/spullen'
import { foutTekst } from '../zorg/ui'

/**
 * De spullen van de bewoner (81): bril, gebit, hoorapparaat, gemerkte
 * kleding. Hoe ze eruitzien en waar ze horen. Kwijt melden zet ze op de
 * lijst van de hele afdeling. Foto's plaatst de familie; het team kan ze
 * bekijken.
 */
export default function SpullenKaart({
  householdId,
  personName,
  vorm,
}: {
  householdId: string
  personName: string
  vorm: 'familie' | 'zorgteam'
}) {
  const queryClient = useQueryClient()
  const sleutel = ['spullen', householdId]
  const lijst = useQuery({ queryKey: sleutel, queryFn: () => spullen(householdId), enabled: !!householdId, retry: false })
  const [open, setOpen] = useState(false)
  const [alles, setAlles] = useState(false)
  const ververs = () => {
    queryClient.invalidateQueries({ queryKey: sleutel })
    queryClient.invalidateQueries({ queryKey: ['kwijt-op-afdeling'] })
  }
  const kwijt = useMutation({ mutationFn: meldKwijt, onSuccess: ververs })
  const gevonden = useMutation({ mutationFn: markeerGevonden, onSuccess: ververs })
  const wis = useMutation({ mutationFn: wisBezitting, onSuccess: ververs })

  const data = lijst.data ?? []
  // Wat kwijt is eerst; daarna de rest.
  const gesorteerd = [...data].sort((a, b) => Number(!!b.kwijt_sinds) - Number(!!a.kwijt_sinds))
  const getoond = alles ? gesorteerd : gesorteerd.slice(0, 4)
  const aantalKwijt = data.filter((b) => b.kwijt_sinds).length
  const fout = kwijt.error ?? gevonden.error ?? wis.error

  return (
    <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby={`spullen-${vorm}`}>
      <h2 id={`spullen-${vorm}`} className="flex items-center gap-2 text-lg font-bold">
        <Glasses size={20} strokeWidth={1.75} aria-hidden="true" /> Spullen van {personName}
        {aantalKwijt > 0 ? (
          <span className="rounded-pill bg-alert px-2.5 py-0.5 text-xs font-bold text-white">{aantalKwijt} kwijt</span>
        ) : null}
      </h2>
      {data.length === 0 && !lijst.isLoading ? (
        <p className="mt-1 text-ink-soft">
          Bril, gebit, hoorapparaat, gemerkte kleding: met een foto en waar het hoort. Raakt iets kwijt, dan zoekt de hele
          afdeling mee.
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {getoond.map((b) => (
          <Rij
            key={b.id}
            b={b}
            magFoto={vorm === 'familie'}
            magWissen={vorm === 'familie'}
            onFoto={async (f) => { await uploadSpulFoto(householdId, b.id, f); ververs() }}
            onKwijt={() => kwijt.mutate(b.id)}
            onGevonden={() => gevonden.mutate(b.id)}
            onWis={() => { if (confirm(`"${b.naam}" wissen?`)) wis.mutate(b) }}
          />
        ))}
      </ul>
      {data.length > 4 ? (
        <button onClick={() => setAlles(!alles)} aria-expanded={alles} className="mt-2 text-sm font-semibold text-accent-ink underline underline-offset-4">
          {alles ? 'Minder tonen' : `Alle ${data.length} spullen`}
        </button>
      ) : null}
      {fout ? <p className="mt-2 text-sm text-alert">{foutTekst(fout)}</p> : null}

      {open ? (
        <Nieuw householdId={householdId} onKlaar={() => { setOpen(false); ververs() }} onStop={() => setOpen(false)} />
      ) : (
        <button onClick={() => setOpen(true)} className="mt-4 inline-flex min-h-touch items-center rounded-pill border-[1.5px] border-line-strong px-5 font-semibold">
          Iets toevoegen
        </button>
      )}
    </section>
  )
}

function Rij({
  b,
  magFoto,
  magWissen,
  onFoto,
  onKwijt,
  onGevonden,
  onWis,
}: {
  b: Bezitting
  magFoto: boolean
  /** Foto's beheert de familie; wissen dus ook, anders blijft de foto achter. */
  magWissen: boolean
  onFoto: (f: File) => Promise<unknown>
  onKwijt: () => void
  onGevonden: () => void
  onWis: () => void
}) {
  return (
    <li className={`flex flex-wrap items-start gap-3 rounded-2xl p-3 ${b.kwijt_sinds ? 'bg-alert-soft ring-1 ring-alert' : 'bg-surface-soft'}`}>
      <StoragePhoto path={b.foto_path} emoji={emojiVan(b.soort)} alt={b.naam} className="h-16 w-16 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{b.naam}</p>
        {b.kenmerk ? <p className="text-sm text-ink-soft">{b.kenmerk}</p> : null}
        {b.waar ? <p className="text-sm text-ink-soft">Hoort: {b.waar}</p> : null}
        {b.kwijt_sinds ? <p className="text-sm font-semibold text-alert">Kwijt · {sindsTekst(b.kwijt_sinds)}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {b.kwijt_sinds ? (
            <button onClick={onGevonden} className="min-h-[2.5rem] rounded-pill bg-accent-ink px-4 text-sm font-semibold text-white">
              Gevonden
            </button>
          ) : (
            <button onClick={onKwijt} className="min-h-[2.5rem] rounded-pill border-[1.5px] border-line-strong px-4 text-sm font-semibold">
              Kwijt
            </button>
          )}
          {magFoto ? <FotoKiezer label={b.foto_path ? 'Andere foto' : 'Foto'} onKies={onFoto} /> : null}
          {magWissen ? (
            <button onClick={onWis} aria-label={`${b.naam} wissen`} className="min-h-[2.5rem] rounded-pill px-3 text-ink-faint">
              <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function Nieuw({ householdId, onKlaar, onStop }: { householdId: string; onKlaar: () => void; onStop: () => void }) {
  const { session } = useAuth()
  const [naam, setNaam] = useState('')
  const [soort, setSoort] = useState<Bezitting['soort']>('bril')
  const [kenmerk, setKenmerk] = useState('')
  const [waar, setWaar] = useState('')
  const bewaar = useMutation({
    mutationFn: () => nieuweBezitting({ hh: householdId, naam, soort, kenmerk, waar, auteur: session?.user.id ?? '' }),
    onSuccess: onKlaar,
  })
  const veld = 'mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4'

  return (
    <form onSubmit={(e) => { e.preventDefault(); bewaar.mutate() }} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label>
        <span className="text-sm font-semibold text-ink-soft">Wat</span>
        <input required maxLength={80} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Leesbril" className={veld} />
      </label>
      <label>
        <span className="text-sm font-semibold text-ink-soft">Soort</span>
        <select value={soort} onChange={(e) => setSoort(e.target.value as Bezitting['soort'])} className={veld}>
          {SOORTEN.map((s) => (
            <option key={s.id} value={s.id}>
              {s.emoji} {s.naam}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className="text-sm font-semibold text-ink-soft">Herkenbaar aan (mag leeg)</span>
        <input maxLength={200} value={kenmerk} onChange={(e) => setKenmerk(e.target.value)} placeholder="Rood montuur, naam binnenin" className={veld} />
      </label>
      <label className="sm:col-span-2">
        <span className="text-sm font-semibold text-ink-soft">Waar het hoort (mag leeg)</span>
        <input maxLength={200} value={waar} onChange={(e) => setWaar(e.target.value)} placeholder="Op het nachtkastje" className={veld} />
      </label>
      {bewaar.error ? <p className="text-sm text-alert sm:col-span-2">{foutTekst(bewaar.error)}</p> : null}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <button type="submit" disabled={bewaar.isPending} className="min-h-touch rounded-pill bg-accent-ink px-5 font-semibold text-white">
          {bewaar.isPending ? 'Bezig…' : 'Bewaren'}
        </button>
        <button type="button" onClick={onStop} className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold">
          Annuleren
        </button>
      </div>
    </form>
  )
}
