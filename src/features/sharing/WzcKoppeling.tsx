import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { CATEGORIEEN, koppelMetWzc, mijnWzc, ontkoppelWzc, zorgnotities } from '../zorg/zorgApi'

/**
 * Een woonzorgcentrum koppelen gebeurt altijd door de familie, met een
 * code die het WZC geeft. Nooit andersom.
 */
export default function WzcKoppeling({ hh, voornaam, isBeheerder }: { hh: string; voornaam: string; isBeheerder: boolean }) {
  const queryClient = useQueryClient()
  const wzc = useQuery({ queryKey: ['wzc', hh], enabled: !!hh, queryFn: () => mijnWzc(hh) })
  const notities = useQuery({
    queryKey: ['wzc-notities', hh],
    enabled: !!hh && !!wzc.data,
    queryFn: () => zorgnotities(hh),
  })
  const [code, setCode] = useState('')
  const ververs = () => {
    queryClient.invalidateQueries({ queryKey: ['wzc', hh] })
    queryClient.invalidateQueries({ queryKey: ['households'] })
  }
  const koppel = useMutation({ mutationFn: () => koppelMetWzc(hh, code), onSuccess: () => { setCode(''); ververs() } })
  const ontkoppel = useMutation({ mutationFn: () => ontkoppelWzc(hh), onSuccess: ververs })

  // Zonder migratie 60 is er geen koppeling te tonen of te maken.
  if (wzc.isLoading) return null
  if (!wzc.data && !isBeheerder) return null

  return (
    <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby="wzc-titel">
      <h2 id="wzc-titel" className="flex items-center gap-2 text-lg font-bold">
        <Building2 size={20} strokeWidth={1.75} aria-hidden="true" />
        Woonzorgcentrum
      </h2>

      {wzc.data ? (
        <>
          <p className="mt-2 text-lg font-semibold">{wzc.data.naam}</p>
          <p className="text-ink-soft">
            {[wzc.data.afdeling ? `Afdeling ${wzc.data.afdeling}` : null, wzc.data.kamer ? `kamer ${wzc.data.kamer}` : null]
              .filter(Boolean)
              .join(' · ') || 'Afdeling en kamer zijn nog niet ingevuld.'}
          </p>
          <p className="mt-3 text-sm text-ink-soft">
            Alleen de medewerkers die {voornaam} volgen, zien de agenda en de contactpersonen en schrijven zorgnotities.
            Wat zij voor de familie bedoelen, staat hieronder. De directie of beheerder van het woonzorgcentrum ziet geen
            persoonlijke gegevens. Dagboek, documenten en locatie blijven bij de familie.
          </p>
          {(notities.data ?? []).length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">Van het zorgteam</h3>
              <ul className="mt-2 space-y-2">
                {(notities.data ?? []).slice(0, 8).map((n) => (
                  <li key={n.id} className="rounded-2xl bg-surface-soft px-4 py-3">
                    <p className="text-sm text-ink-soft">
                      {new Date(n.created_at).toLocaleString('nl-BE', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {' · '}
                      {CATEGORIEEN.find((c) => c.waarde === n.category)?.label ?? ''}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words">{n.body}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {isBeheerder ? (
            <button
              onClick={() => {
                if (confirm(`De koppeling met ${wzc.data!.naam} stoppen? De medewerkers verliezen meteen hun toegang.`))
                  ontkoppel.mutate()
              }}
              disabled={ontkoppel.isPending}
              className="mt-4 rounded-pill border border-line px-4 py-2 text-sm font-semibold text-ink-soft"
            >
              Koppeling stoppen
            </button>
          ) : null}
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (code.trim()) koppel.mutate()
          }}
          className="mt-2"
        >
          <p className="text-ink-soft">
            Gaat {voornaam} in een woonzorgcentrum wonen dat LifeAngle gebruikt? Vraag er de koppelcode en vul die hier in.
            Het team dat {voornaam} volgt, ziet dan de agenda en de contactpersonen, en schrijft zorgnotities.
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="min-w-[10rem] flex-1">
              <span className="text-sm font-semibold text-ink-soft">Koppelcode</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD 2345"
                autoCapitalize="characters"
                autoComplete="off"
                className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 font-mono text-lg tracking-widest"
              />
            </label>
            <button
              type="submit"
              disabled={!code.trim() || koppel.isPending}
              className="min-h-touch rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
            >
              {koppel.isPending ? 'Bezig…' : 'Koppelen'}
            </button>
          </div>
          {koppel.error ? (
            <p role="alert" className="mt-3 text-sm text-alert">
              {koppel.error instanceof Error ? koppel.error.message : 'Koppelen lukte niet.'}
            </p>
          ) : null}
        </form>
      )}
      {koppel.data ? <p className="mt-3 text-sm font-semibold text-accent-ink">Gekoppeld met {koppel.data}.</p> : null}
      {ontkoppel.error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {ontkoppel.error instanceof Error ? ontkoppel.error.message : 'Dat lukte niet.'}
        </p>
      ) : null}
    </section>
  )
}
