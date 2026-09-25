import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { setRapportKeuze, WEEKDAGEN, type DagritmeRij, type UurRij, type WeekRij } from '../../services/analyse'
import { locale } from '../../lib/i18n'
import { BLOKKEN, nietOpgenomen } from './blokken'
import { useAnalyse } from './useAnalyse'

const PERIODES = [
  { dagen: 30, label: '30 dagen' },
  { dagen: 90, label: '3 maanden' },
  { dagen: 365, label: '1 jaar' },
]

/**
 * Het analysescherm.
 *
 * Twee dingen tegelijk: familie kan het hele jaar door kijken hoe het
 * gaat, en wat hier aangevinkt staat, komt op het verslag voor de dokter.
 * Zo is het verslag geen apart product maar een afdruk van wat hier al
 * staat.
 *
 * Drie regels die het bruikbaar houden in plaats van indrukwekkend:
 *
 *   - Nooit één getal zonder de spreiding of de dekking erbij.
 *   - Beschrijven, nooit oordelen. Geen score, geen "achteruitgang".
 *   - Wat niet beschikbaar is, staat er grijs bij met de reden. Een blok
 *     stilletjes weglaten laat het scherm stuk lijken.
 *
 * En één regel die op het verslag zelf terechtkomt: daar staat wat er
 * weggelaten is. Anders cureert familie zonder het te beseffen wat de
 * arts ziet, en weet de arts niet wat hij mist.
 */
export default function Analyse() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const voornaam = household?.person_name.split(' ')[0] ?? 'de persoon'
  const [dagen, setDagen] = useState(90)
  const queryClient = useQueryClient()

  const a = useAnalyse(hh, dagen)

  const [blokken, setBlokken] = useState<string[]>([])
  useEffect(() => {
    if (a.keuze) setBlokken(a.keuze.blokken)
  }, [a.keuze])

  const bewaar = useMutation({
    mutationFn: (nieuw: string[]) => setRapportKeuze(hh, { blokken: nieuw, dagen }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['rapportkeuze', hh] }),
  })

  function wissel(id: string) {
    const nieuw = blokken.includes(id) ? blokken.filter((b) => b !== id) : [...blokken, id]
    setBlokken(nieuw)
    bewaar.mutate(nieuw)
  }

  const inhoud: Record<string, React.ReactNode> = {
    medicatie: <Medicatie a={a} voornaam={voornaam} />,
    dagritme: <Dagritme rijen={a.dagritme} />,
    weekpatroon: <Weekpatroon rijen={a.week} />,
    nacht: (
      <>
        <Nacht rijen={a.nacht} />
        <p className="mt-2 text-sm text-ink-faint">
          Dit telt alleen wat er in de app gebeurde. Iemand kan wakker liggen zonder het scherm aan
          te raken, dus dit is geen slaapmeting.
        </p>
      </>
    ),
    schema: (
      <ul className="space-y-1 text-sm">
        {a.wijzigingen.slice(0, 12).map((w) => (
          <li key={w.id} className="flex flex-wrap gap-x-2">
            <span className="w-28 shrink-0 text-ink-faint">{datum(w.changed_at)}</span>
            <span className="font-semibold">{w.medication_name}</span>
            <span className="text-ink-soft">
              {w.veld === 'status' ? (w.nieuw ?? '') : `${w.veld}: ${w.oud ?? '—'} → ${w.nieuw ?? '—'}`}
            </span>
          </li>
        ))}
      </ul>
    ),
    notities: (
      <ul className="space-y-2 text-sm">
        {a.notities.slice(0, 10).map((n) => (
          <li key={n.id} className="flex flex-wrap gap-x-3">
            <span className="w-28 shrink-0 text-ink-faint">{datum(n.occurred_at)}</span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{n.title}</span>
              {n.note ? <span className="text-ink-soft"> — {n.note}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    ),
  }

  const legeTekst: Record<string, string> = {
    medicatie: 'Er staan in deze periode geen medicatiemomenten.',
    dagritme: 'Er is in deze periode niets afgevinkt, dus hierover valt niets te zeggen.',
    weekpatroon: 'Nog te weinig gegevens om per weekdag iets te tonen.',
    nacht: "Er is 's nachts niets geregistreerd in deze periode.",
    schema: 'Het schema is in deze periode niet gewijzigd.',
    notities: 'Er staan geen notities in het zorglogboek voor deze periode.',
  }

  const weg = nietOpgenomen(blokken, a.leeg)

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analyse</h1>
          <p className="mt-1 max-w-[60ch] text-ink-soft">
            Wat er in de app gebeurde, over een langere periode. Wat je hier aanvinkt, komt op het
            verslag voor de dokter.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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

          <Link
            to={`/verslag?dagen=${dagen}`}
            className="flex min-h-touch items-center rounded-pill bg-accent-ink px-5 font-bold text-white"
          >
            Verslag maken
          </Link>
        </div>
      </header>

      {/* De vaste kern: geen vinkje, want zonder deze twee is de rest niet
          te lezen. */}
      <section className="rounded-card border-[1.5px] border-accent bg-accent-soft p-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-accent-ink">
          Staat altijd op het verslag
        </h2>

        {a.dekking ? (
          <p className="mt-2 text-lg">
            <strong>
              {a.dekking.dagen_gebruik} van {a.dekking.dagen_periode} dagen
            </strong>{' '}
            werd de app gebruikt. Alle cijfers hieronder gaan over die dagen, niet over de hele
            periode.
          </p>
        ) : (
          <p className="mt-2 text-ink-soft">Bezig met laden…</p>
        )}

        {a.stabiel.length > 0 ? (
          <div className="mt-3">
            <p className="font-semibold">Wat gelijk bleef</p>
            <ul className="mt-1 list-disc pl-5 text-ink-soft">
              {a.stabiel.map((z) => (
                <li key={z}>{z}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {BLOKKEN.map((b) => (
        <Blok
          key={b.id}
          id={b.id}
          titel={b.titel}
          onder={b.onder}
          aan={blokken.includes(b.id)}
          onWissel={wissel}
          leeg={!!a.leeg[b.id]}
          legeTekst={legeTekst[b.id]}
        >
          {inhoud[b.id]}
        </Blok>
      ))}

      {/* Wat er wegvalt, staat ook hier al: dan weet familie vóór het
          afdrukken wat de arts niet zal zien. */}
      {weg.bewustWeg.length > 0 ? (
        <p className="text-sm text-ink-soft">
          Niet op het verslag: {weg.bewustWeg.join(', ')}. Dat staat ook op het blad zelf, zodat de
          arts weet wat hij niet ziet.
        </p>
      ) : null}

      {/* Wat er niet is, staat er met de reden bij. Weglaten zou het
          scherm stuk doen lijken, en verbergt dat er een keuze achter zit. */}
      <section className="rounded-card border border-dashed border-line-strong p-5">
        <h2 className="font-bold text-ink-soft">Nog niet beschikbaar</h2>
        <ul className="mt-2 space-y-2 text-sm text-ink-soft">
          <li>
            <strong>Hoe vaak dezelfde vraag terugkwam.</strong> Vragen aan de spraakassistent worden
            nergens bewaard. Dat zou een nieuwe registratie vragen, en meteen een gevoelige: je legt
            dan vast wat {voornaam} vroeg. Dat hoort zichtbaar te zijn voor haar en uit te zetten.
          </li>
          <li>
            <strong>Slaap en schermtijd.</strong> De app registreert niet wanneer het scherm aan
            stond, alleen wat er gedaan werd. Een echte meting vraagt de tablet zelf of een sensor.
          </li>
        </ul>
      </section>
    </div>
  )
}

function datum(iso: string) {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long' }).format(new Date(iso))
}

/** Eén blok, met het vinkje dat bepaalt of het op het verslag komt. */
function Blok({
  id,
  titel,
  onder,
  aan,
  onWissel,
  leeg,
  legeTekst,
  children,
}: {
  id: string
  titel: string
  onder: string
  aan: boolean
  onWissel: (id: string) => void
  leeg: boolean
  legeTekst: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-card bg-surface p-5 shadow-card sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-[16rem] flex-1">
          <h2 className="text-lg font-bold">{titel}</h2>
          <p className="mt-1 text-sm text-ink-soft">{onder}</p>
        </div>

        <label className="flex items-center gap-2.5 text-sm font-semibold">
          <input
            type="checkbox"
            checked={aan}
            disabled={leeg}
            onChange={() => onWissel(id)}
            className="h-5 w-5 accent-[var(--accent-ink)]"
          />
          Op het verslag
        </label>
      </header>

      <div className="mt-4">{leeg ? <p className="text-ink-soft">{legeTekst}</p> : children}</div>
    </section>
  )
}

function Medicatie({ a, voornaam }: { a: ReturnType<typeof useAnalyse>; voornaam: string }) {
  if (!a.totaal) return null

  return (
    <>
      <p className="text-3xl font-extrabold tabular-nums">
        {Math.round((a.totaal.bevestigd / Math.max(1, a.totaal.momenten)) * 100)} %
        <span className="ml-2 text-base font-semibold text-ink-soft">
          {a.totaal.bevestigd} van {a.totaal.momenten}, over {a.totaal.dagen} dagen
        </span>
      </p>

      <ul className="mt-3 space-y-2">
        {a.perTijdstip.map((r) => {
          const pct = Math.round((r.bevestigd / Math.max(1, r.momenten)) * 100)
          const zelfPct = Math.round((r.zelf / Math.max(1, r.momenten)) * 100)
          return (
            <li key={r.tijdstip} className="flex items-center gap-3">
              <span className="w-14 shrink-0 tabular-nums font-semibold">{r.tijdstip}</span>
              <span className="flex h-3 flex-1 overflow-hidden rounded-pill bg-surface-deep">
                <span className="bg-accent-ink" style={{ width: `${zelfPct}%` }} />
                <span className="bg-accent" style={{ width: `${Math.max(0, pct - zelfPct)}%` }} />
              </span>
              <span className="w-32 shrink-0 text-right text-sm text-ink-soft tabular-nums">
                {pct} % · {r.zelf} zelf
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-sm text-ink-faint">
        Donker is wat {voornaam} zelf bevestigde, lichter wat iemand anders deed. Bevestigd is niet
        hetzelfde als ingenomen.
      </p>
    </>
  )
}

function Dagritme({ rijen }: { rijen: DagritmeRij[] }) {
  const maand = (d: string) =>
    new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(d))

  // Alles op dezelfde schaal, van 5 tot 13 uur, zodat de balken
  // vergelijkbaar zijn tussen maanden.
  const VAN = 5 * 60
  const TOT = 13 * 60
  const naarPct = (tijd: string) => {
    const [u, m] = tijd.split(':').map(Number)
    return Math.max(0, Math.min(100, ((u * 60 + m - VAN) / (TOT - VAN)) * 100))
  }

  return (
    <div className="space-y-3">
      {rijen.map((r) => {
        const start = naarPct(r.vroegste)
        const eind = naarPct(r.laatste)
        return (
          <div key={r.maand}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">{maand(r.maand)}</span>
              <span className="text-ink-soft tabular-nums">
                {r.vroegste} – {r.laatste} · mediaan {r.mediaan} · {r.dagen} dagen
              </span>
            </div>
            <div className="relative mt-1 h-6 rounded-pill bg-surface-deep">
              <span
                className="absolute inset-y-0 rounded-pill bg-accent"
                style={{ left: `${start}%`, width: `${Math.max(2, eind - start)}%` }}
              />
              <span
                className="absolute inset-y-0 w-0.5 bg-accent-ink"
                style={{ left: `${naarPct(r.mediaan)}%` }}
              />
            </div>
          </div>
        )
      })}
      <p className="text-sm text-ink-faint">
        De balk loopt van de vroegste tot de laatste start; het streepje is de mediaan. Schaal 5 tot
        13 uur. Wordt de balk breder, dan loopt het dagritme meer uiteen.
      </p>
    </div>
  )
}

function Weekpatroon({ rijen }: { rijen: WeekRij[] }) {
  return (
    <div className="grid grid-cols-7 gap-2">
      {rijen.map((r) => {
        const pct = r.med_momenten > 0 ? Math.round((r.med_bevestigd / r.med_momenten) * 100) : null
        const zelf = r.med_bevestigd > 0 ? Math.round((r.med_zelf / r.med_bevestigd) * 100) : 0
        return (
          <div key={r.weekdag} className="rounded-2xl border border-line bg-surface-soft p-2 text-center">
            <p className="text-xs font-bold text-ink-faint">{WEEKDAGEN[r.weekdag - 1].slice(0, 2)}</p>
            <p className="mt-1 text-lg font-extrabold tabular-nums">{pct === null ? '—' : `${pct}%`}</p>
            <div className="mx-auto mt-1 h-16 w-3 overflow-hidden rounded-pill bg-surface-deep">
              <div className="flex h-full w-full flex-col justify-end">
                <span className="bg-accent" style={{ height: `${(pct ?? 0) - (((pct ?? 0) * zelf) / 100)}%` }} />
                <span className="bg-accent-ink" style={{ height: `${((pct ?? 0) * zelf) / 100}%` }} />
              </div>
            </div>
            <p className="mt-1 text-xs text-ink-faint">{r.dagen}d</p>
          </div>
        )
      })}
    </div>
  )
}

function Nacht({ rijen }: { rijen: UurRij[] }) {
  const max = Math.max(1, ...rijen.map((r) => r.aantal))
  return (
    <div className="flex items-end gap-3">
      {rijen.map((r) => (
        <div key={r.uur} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-sm font-bold tabular-nums">{r.aantal}</span>
          <span
            className="w-full rounded-t bg-accent"
            style={{ height: `${Math.max(4, (r.aantal / max) * 72)}px` }}
          />
          <span className="text-xs text-ink-soft tabular-nums">{r.uur}u</span>
          <span className="text-xs text-ink-faint">{r.dagen}d</span>
        </div>
      ))}
    </div>
  )
}
