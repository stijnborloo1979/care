import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Radio as RadioIcon, Search, X } from 'lucide-react'
import {
  MAX_ZENDERS,
  addZender,
  deleteZender,
  herschik,
  zoekZenders,
  type Zoekresultaat,
} from '../../services/radio'
import { useZenders } from './useZenders'
import { useRadio } from './radioStore'

/**
 * Zenders kiezen. Hoogstens vier: meer keuze is voor de persoon niet
 * meer maar minder. De bovenste is de favoriet die bij één tik speelt.
 */
export default function ManageRadio({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient()
  const { data: zenders } = useZenders(householdId)
  const [zoek, setZoek] = useState('')
  const [land, setLand] = useState('BE')
  const [resultaten, setResultaten] = useState<Zoekresultaat[] | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const { speel, stop, speelt } = useRadio()

  const ververs = () => queryClient.invalidateQueries({ queryKey: ['radio', householdId] })

  async function zoeken(e: React.FormEvent) {
    e.preventDefault()
    setBezig(true)
    setFout(null)
    try {
      setResultaten(await zoekZenders(zoek.trim(), land))
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Zoeken lukte niet.')
    } finally {
      setBezig(false)
    }
  }

  const voegToe = useMutation({
    mutationFn: (r: Zoekresultaat) => addZender(householdId, r, zenders?.length ?? 0),
    onSuccess: ververs,
    onError: (e) => setFout(e instanceof Error ? e.message : 'Toevoegen lukte niet.'),
  })

  const wis = useMutation({ mutationFn: deleteZender, onSuccess: ververs })

  const verplaats = useMutation({
    mutationFn: async ({ i, richting }: { i: number; richting: -1 | 1 }) => {
      const lijst = [...(zenders ?? [])]
      const j = i + richting
      ;[lijst[i], lijst[j]] = [lijst[j], lijst[i]]
      await herschik(lijst)
    },
    onSuccess: ververs,
  })

  const vol = (zenders?.length ?? 0) >= MAX_ZENDERS

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <RadioIcon size={20} strokeWidth={1.75} aria-hidden="true" />
        Radio
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Hoogstens {MAX_ZENDERS} zenders. De bovenste speelt bij één tik op het Vandaag-scherm.
      </p>

      <ul className="mt-4 space-y-2">
        {(zenders ?? []).map((z, i) => (
          <li key={z.id} className="flex items-center gap-3 rounded-2xl bg-surface-soft px-3 py-2">
            {z.favicon ? (
              <img src={z.favicon} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <RadioIcon size={22} strokeWidth={1.75} className="text-ink-faint" />
            )}
            <span className="min-w-0 flex-1 truncate font-semibold">
              {z.name}
              {i === 0 ? <span className="ml-2 text-xs font-bold text-accent-ink">favoriet</span> : null}
            </span>
            <button
              onClick={() => verplaats.mutate({ i, richting: -1 })}
              disabled={i === 0}
              aria-label="Hoger"
              className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30"
            >
              <ArrowUp size={18} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => verplaats.mutate({ i, richting: 1 })}
              disabled={i === (zenders?.length ?? 0) - 1}
              aria-label="Lager"
              className="grid h-9 w-9 place-items-center rounded-full disabled:opacity-30"
            >
              <ArrowDown size={18} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => wis.mutate(z.id)}
              aria-label={`${z.name} verwijderen`}
              className="grid h-9 w-9 place-items-center rounded-full text-ink-faint"
            >
              <X size={18} strokeWidth={1.75} />
            </button>
          </li>
        ))}
      </ul>

      {!vol ? (
        <form onSubmit={zoeken} className="mt-4 flex flex-wrap gap-2">
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Radio 2, Nostalgie, Klara…"
            className="min-h-touch min-w-[min(12rem,100%)] flex-1 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
          <select
            value={land}
            onChange={(e) => setLand(e.target.value)}
            aria-label="Land"
            className="min-h-touch rounded-2xl border-[1.5px] border-line-strong bg-surface px-3"
          >
            <option value="BE">België</option>
            <option value="NL">Nederland</option>
            <option value="FR">Frankrijk</option>
            <option value="">Overal</option>
          </select>
          <button
            type="submit"
            disabled={bezig || !zoek.trim()}
            className="flex min-h-touch items-center gap-2 rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-50"
          >
            <Search size={18} strokeWidth={1.75} />
            {bezig ? 'Zoeken…' : 'Zoek'}
          </button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-ink-faint">
          Vier zenders is genoeg. Verwijder er een om een andere te kiezen.
        </p>
      )}

      {resultaten && !vol ? (
        <ul className="mt-4 space-y-2">
          {resultaten.length === 0 ? (
            <li className="text-sm text-ink-soft">
              Niets gevonden dat in de app kan spelen. Probeer een andere naam of kies "Overal".
            </li>
          ) : null}
          {resultaten.map((r) => (
            <li key={r.url} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.naam}</span>
                <span className="text-xs text-ink-faint">
                  {r.land}
                  {r.bitrate ? ` · ${r.bitrate} kbps` : ''}
                </span>
              </span>
              {/* Eerst even luisteren: niet elke stream in de databank werkt echt. */}
              <button
                onClick={() =>
                  speelt ? stop() : speel({ id: `test-${r.url}`, name: r.naam, stream_url: r.url })
                }
                className="shrink-0 rounded-pill border border-line px-3 py-1 text-sm font-semibold"
              >
                {speelt ? 'Stop' : 'Luister'}
              </button>
              <button
                onClick={() => voegToe.mutate(r)}
                className="shrink-0 rounded-pill bg-accent-ink px-3 py-1 text-sm font-semibold text-white"
              >
                Kies
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {fout ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {fout}
        </p>
      ) : null}
    </section>
  )
}
