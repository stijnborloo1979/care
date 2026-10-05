import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, History, MapPin, Mic, TriangleAlert } from 'lucide-react'
import {
  getInzages,
  getNamen,
  getNoodtoegangen,
  getOnderwerpen,
  noodStatus,
  perDag,
  stopNoodtoegang,
  watZin,
  wie,
  type InzageSoort,
} from '../../services/inzage'
import { tt, uiLocale } from '../../lib/uiTaal'

const ICOON: Record<InzageSoort, typeof FileText> = {
  document: FileText,
  life_story: Mic,
  location_point: MapPin,
}

const uur = (iso: string) =>
  new Date(iso).toLocaleTimeString(uiLocale(), { hour: '2-digit', minute: '2-digit' })

/**
 * Kunnen zien wat er gebeurde, niet alleen wat er beloofd wordt. De
 * familiebeheerder ziet wie een document opende, een opname beluisterde
 * of de locatie bekeek, en elke noodtoegang van een woonzorgcentrum.
 * Wat de persoon zelf bekijkt, staat hier niet.
 */
export default function WieBekeek({
  hh,
  voornaam,
  isBeheerder,
  ikBenHet,
}: {
  hh: string
  voornaam: string
  isBeheerder: boolean
  ikBenHet: boolean
}) {
  const queryClient = useQueryClient()

  const nood = useQuery({
    queryKey: ['noodtoegang', hh],
    enabled: !!hh && (isBeheerder || ikBenHet),
    queryFn: () => getNoodtoegangen(hh),
    refetchInterval: 60_000,
  })

  const log = useQuery({
    queryKey: ['inzages', hh],
    enabled: !!hh && isBeheerder,
    queryFn: async () => {
      const inzages = await getInzages(hh)
      const [namen, onderwerpen] = await Promise.all([
        getNamen(inzages.map((i) => i.actor_id ?? '')),
        getOnderwerpen(inzages),
      ])
      return { inzages, namen, onderwerpen }
    },
  })

  const stop = useMutation({
    mutationFn: stopNoodtoegang,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['noodtoegang', hh] }),
  })

  if (!isBeheerder && !ikBenHet) return null

  const noodRijen = nood.data ?? []

  return (
    <>
      {noodRijen.length > 0 ? (
        <section className="space-y-3" aria-labelledby="nood-titel">
          <h2 id="nood-titel" className="flex items-center gap-2 text-lg font-bold">
            <TriangleAlert size={20} strokeWidth={1.75} aria-hidden="true" />
            {tt('Noodtoegang')}
          </h2>
          <p className="text-sm text-ink-soft">
            {tt('Een teamverantwoordelijke van het woonzorgcentrum kan in een noodgeval 4 uur meekijken: naam, voorkeuren, agenda, logboek en contactpersonen. Geen dagboek, documenten of locatie.')}
          </p>
          <ul className="space-y-2">
            {noodRijen.map((n) => {
              const status = noodStatus(n)
              const loopt = status === 'loopt'
              return (
                <li
                  key={n.id}
                  className={`rounded-card bg-surface p-5 shadow-card ${loopt ? 'ring-2 ring-warn' : ''}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {loopt
                          ? tt('Loopt nog tot {uur}', { uur: uur(n.expires_at) })
                          : status === 'gestopt'
                            ? tt('Gestopt')
                            : tt('Afgelopen')}
                        <span className="font-normal text-ink-soft">
                          {' · '}
                          {tt('gestart {wanneer}', {
                            wanneer: new Date(n.started_at).toLocaleString(uiLocale(), {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            }),
                          })}
                        </span>
                      </p>
                      <p className="mt-1 break-words">„{n.reason}”</p>
                      {isBeheerder ? (
                        <p className="mt-1 text-sm text-ink-faint">
                          {n.inzages === 0
                            ? tt('Nog niets ingekeken.')
                            : n.inzages === 1
                              ? tt('1 keer ingekeken.')
                              : tt('{n} keer ingekeken.', { n: n.inzages })}
                        </p>
                      ) : null}
                    </div>
                    {loopt && isBeheerder ? (
                      <button
                        onClick={() => {
                          if (confirm(tt('Deze noodtoegang nu stoppen?'))) stop.mutate(n.id)
                        }}
                        disabled={stop.isPending}
                        className="min-h-touch w-full shrink-0 rounded-pill border-[1.5px] border-line-strong bg-surface px-5 font-semibold disabled:opacity-60 sm:w-auto"
                      >
                        {tt('Nu stoppen')}
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          {stop.error ? (
            <p role="alert" className="text-sm text-alert">
              {stop.error instanceof Error ? stop.error.message : tt('Stoppen lukte niet.')}
            </p>
          ) : null}
        </section>
      ) : null}

      {isBeheerder ? (
        <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby="bekeek-titel">
          <h2 id="bekeek-titel" className="flex items-center gap-2 text-lg font-bold">
            <History size={20} strokeWidth={1.75} aria-hidden="true" />
            {tt('Wie bekeek wat')}
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {tt('De laatste 30 dagen: wie een document opende, een opname beluisterde of de locatie bekeek. Wat {naam} zelf bekijkt, staat hier niet. Alleen beheerders zien dit.', { naam: voornaam })}
          </p>

          {log.isLoading ? <p className="mt-4 text-ink-soft">{tt('Bezig met laden…')}</p> : null}
          {log.error ? (
            <p role="alert" className="mt-4 text-sm text-alert">
              {tt('Dit overzicht kon niet geladen worden.')}
            </p>
          ) : null}
          {log.data && log.data.inzages.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-surface-soft px-4 py-3 text-ink-soft">
              {tt('Niemand bekeek de laatste 30 dagen documenten, opnames of de locatie.')}
            </p>
          ) : null}

          {log.data
            ? perDag(log.data.inzages).map(([dag, rijen]) => (
                <div key={dag} className="mt-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
                    {dag}
                  </h3>
                  <ul className="mt-2 space-y-1.5">
                    {rijen.map((i) => {
                      const Ic = ICOON[i.soort]
                      return (
                        <li
                          key={i.id}
                          className="flex items-start gap-3 rounded-2xl bg-surface-soft px-4 py-3"
                        >
                          <Ic size={18} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-ink-soft" />
                          <span className="min-w-0 flex-1 break-words [hyphens:auto]">
                            <strong>{wie(i, log.data.namen)}</strong>{' '}
                            {watZin(i, log.data.onderwerpen)}
                          </span>
                          <time dateTime={i.at} className="shrink-0 text-sm text-ink-faint">
                            {uur(i.at)}
                          </time>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))
            : null}
        </section>
      ) : null}
    </>
  )
}
