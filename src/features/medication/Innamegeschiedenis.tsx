import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useHousehold } from '../household/useHousehold'
import {
  getInnameGeschiedenis,
  getSamenvatting,
  getSchemaWijzigingen,
  periode,
  type InnameMoment,
  type SamenvattingRij,
  type SchemaWijziging,
} from '../../services/medicationHistory'
import { hhmm } from '../../lib/time'
import { locale } from '../../lib/i18n'

const PERIODES = [
  { dagen: 30, label: '30 dagen' },
  { dagen: 90, label: '3 maanden' },
  { dagen: 365, label: '1 jaar' },
]

/**
 * Wat er van het schema terechtkwam.
 *
 * Twee dingen maken dit bruikbaar in plaats van indrukwekkend. Per
 * tijdstip in plaats van één percentage: "ochtend 96 %, avond 52 %" wijst
 * naar een probleem, "71 %" niet. En wie bevestigde: blijft het totaal
 * gelijk terwijl het eigen aandeel zakt, dan groeit de afhankelijkheid
 * zonder dat één percentage dat laat zien.
 *
 * Er staat overal bij over hoeveel dagen een cijfer gaat. Een percentage
 * waarvan je dat niet weet, kan je niet gebruiken.
 */
export default function Innamegeschiedenis() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const tz = household?.timezone ?? 'Europe/Brussels'
  const voornaam = household?.person_name.split(' ')[0] ?? 'de persoon'
  const [dagen, setDagen] = useState(30)

  const { van, tot } = useMemo(() => periode(dagen), [dagen])

  const { data: samenvatting, isLoading } = useQuery({
    queryKey: ['med-samenvatting', hh, dagen],
    queryFn: () => getSamenvatting(hh, van, tot),
    enabled: !!hh,
  })

  const { data: geschiedenis } = useQuery({
    queryKey: ['med-geschiedenis', hh, dagen],
    queryFn: () => getInnameGeschiedenis(hh, van, tot),
    enabled: !!hh,
  })

  const { data: wijzigingen } = useQuery({
    queryKey: ['med-wijzigingen', hh, dagen],
    queryFn: () => getSchemaWijzigingen(hh, van),
    enabled: !!hh,
  })

  const rijen = (samenvatting ?? []).filter((r) => r.tijdstip !== 'alles')
  const totaal = (samenvatting ?? []).find((r) => r.tijdstip === 'alles')

  return (
    <section className="space-y-4 rounded-card bg-surface p-6 shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold">Wat er bevestigd werd</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Per moment van de dag, en door wie het bevestigd werd.
          </p>
        </div>

        <div className="flex gap-1 rounded-pill border border-line bg-surface-soft p-1">
          {PERIODES.map((p) => (
            <button
              key={p.dagen}
              onClick={() => setDagen(p.dagen)}
              aria-pressed={dagen === p.dagen}
              className={`min-h-[2.4rem] rounded-pill px-4 text-sm font-semibold ${
                dagen === p.dagen ? 'bg-surface text-ink shadow-card' : 'text-ink-soft'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {isLoading ? <p className="text-ink-soft">Bezig met laden…</p> : null}

      {!isLoading && !totaal ? (
        <p className="text-ink-soft">
          Er zijn in deze periode nog geen medicatiemomenten. Ze verschijnen zodra er een schema
          staat en de nachtelijke job gedraaid heeft.
        </p>
      ) : null}

      {totaal ? (
        <>
          <Blok rij={totaal} voornaam={voornaam} groot />

          {rijen.length > 1 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {rijen.map((r) => (
                <Blok key={r.tijdstip} rij={r} voornaam={voornaam} />
              ))}
            </div>
          ) : null}

          <p className="text-sm text-ink-faint">
            Bevestigd wil zeggen: er is op de knop gedrukt, door {voornaam} zelf of door iemand die
            meezorgt. Het betekent niet dat de medicatie genomen is, en een ontbrekende bevestiging
            betekent niet dat ze overgeslagen werd.
          </p>
        </>
      ) : null}

      {(wijzigingen ?? []).length > 0 ? (
        <Wijzigingen lijst={wijzigingen ?? []} />
      ) : null}

      {(geschiedenis ?? []).length > 0 ? (
        <PerDag lijst={geschiedenis ?? []} tz={tz} voornaam={voornaam} />
      ) : null}
    </section>
  )
}

/** Eén tijdstip: hoeveel bevestigd, en welk deel daarvan door de persoon zelf. */
function Blok({
  rij,
  voornaam,
  groot = false,
}: {
  rij: SamenvattingRij
  voornaam: string
  groot?: boolean
}) {
  const pct = rij.momenten > 0 ? Math.round((rij.bevestigd / rij.momenten) * 100) : 0
  const zelfPct = rij.momenten > 0 ? Math.round((rij.zelf / rij.momenten) * 100) : 0
  const anderPct = Math.max(0, pct - zelfPct)

  return (
    <div className={`rounded-2xl border border-line bg-surface-soft p-4 ${groot ? 'sm:p-5' : ''}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold">{rij.tijdstip === 'alles' ? 'Alle momenten' : rij.tijdstip}</span>
        <span className={`font-extrabold tabular-nums ${groot ? 'text-3xl' : 'text-xl'}`}>
          {pct} %
        </span>
      </div>

      {/* Twee segmenten die in helderheid verschillen, niet alleen in kleur:
          wie kleur slecht onderscheidt, ziet het verschil nog steeds. */}
      <div
        className="mt-3 flex h-3 overflow-hidden rounded-pill bg-surface-deep"
        role="img"
        aria-label={`${rij.bevestigd} van ${rij.momenten} bevestigd, waarvan ${rij.zelf} door ${voornaam} zelf`}
      >
        <span className="bg-accent-ink" style={{ width: `${zelfPct}%` }} />
        <span className="bg-accent" style={{ width: `${anderPct}%` }} />
      </div>

      <p className="mt-2 text-sm text-ink-soft">
        {rij.bevestigd} van {rij.momenten} bevestigd, waarvan{' '}
        <strong className="text-ink">{rij.zelf}</strong> door {voornaam} zelf
      </p>
      <p className="text-sm text-ink-faint">over {rij.dagen} {rij.dagen === 1 ? 'dag' : 'dagen'}</p>
    </div>
  )
}

/**
 * Wijzigingen aan het schema, nieuwste eerst. Zonder deze tijdlijn is een
 * daling niet te duiden: er kan gewoon een middel bijgekomen zijn.
 */
function Wijzigingen({ lijst }: { lijst: SchemaWijziging[] }) {
  const datum = (iso: string) =>
    new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long' }).format(new Date(iso))

  return (
    <details className="rounded-2xl border border-line bg-surface-soft p-4">
      <summary className="cursor-pointer font-bold">
        Wijzigingen aan het schema{' '}
        <span className="font-semibold text-ink-faint">{lijst.length}</span>
      </summary>
      <ul className="mt-3 space-y-2">
        {lijst.map((w) => (
          <li key={w.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="w-28 shrink-0 text-ink-faint">{datum(w.changed_at)}</span>
            <span className="font-semibold">{w.medication_name}</span>
            <span className="text-ink-soft">
              {w.veld === 'status'
                ? (w.nieuw ?? '')
                : `${w.veld}: ${w.oud ?? '—'} → ${w.nieuw ?? '—'}`}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** De momenten zelf, per dag gegroepeerd, nieuwste dag eerst. */
function PerDag({
  lijst,
  tz,
  voornaam,
}: {
  lijst: InnameMoment[]
  tz: string
  voornaam: string
}) {
  const perDag = new Map<string, InnameMoment[]>()
  for (const m of lijst) {
    const dag = new Intl.DateTimeFormat(locale(), {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(new Date(m.due_at))
    perDag.set(dag, [...(perDag.get(dag) ?? []), m])
  }

  const label: Record<string, string> = {
    zelf: voornaam,
    familie: 'familie',
    zorgverlener: 'zorgverlener',
    onbekend: 'iemand',
    open: 'niet bevestigd',
  }

  return (
    <details className="rounded-2xl border border-line bg-surface-soft p-4">
      <summary className="cursor-pointer font-bold">Alle momenten</summary>

      <div className="mt-3 space-y-4">
        {[...perDag.entries()].slice(0, 31).map(([dag, momenten]) => (
          <div key={dag}>
            <p className="text-sm font-bold text-ink-faint">{dag}</p>
            <ul className="mt-1 divide-y divide-line">
              {momenten
                .slice()
                .sort((a, b) => a.due_at.localeCompare(b.due_at))
                .map((m) => (
                  <li key={m.log_id} className="flex flex-wrap items-baseline gap-x-3 py-1.5 text-sm">
                    <span className="w-14 shrink-0 tabular-nums text-ink-soft">
                      {hhmm(new Date(m.due_at), tz)}
                    </span>
                    <span className="min-w-0 flex-1 font-semibold">
                      {m.naam}
                      {m.dosis ? <span className="font-normal text-ink-soft"> — {m.dosis}</span> : null}
                    </span>
                    <span
                      className={`shrink-0 font-semibold ${
                        m.wie === 'open' ? 'text-ink-faint' : 'text-ok'
                      }`}
                    >
                      {label[m.wie] ?? m.wie}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  )
}
