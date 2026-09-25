import { Link, useSearchParams } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { WEEKDAGEN } from '../../services/analyse'
import { locale } from '../../lib/i18n'
import { BLOKKEN, nietOpgenomen } from './blokken'
import { useAnalyse } from './useAnalyse'

/**
 * Het verslag voor de dokter.
 *
 * Dit rekent niets uit. Het drukt af wat op het analysescherm aangevinkt
 * staat, met dezelfde cijfers uit dezelfde hook. Zou het zijn eigen
 * berekening doen, dan ligt er bij de arts vroeg of laat iets anders dan
 * wat familie zag.
 *
 * Op papier geen balken en geen kleuren: browsers laten achtergronden weg
 * bij het afdrukken, en een arts leest liever een getal met de teller en de
 * noemer erbij. Tabellen dus, zwart op wit.
 *
 * Twee dingen staan er altijd op, ook als familie ze niet zou willen: over
 * hoeveel dagen de cijfers gaan, en wat er weggelaten is. Zonder het eerste
 * is elk percentage misleidend; zonder het tweede cureert familie zonder
 * het te beseffen wat de arts ziet.
 */
export default function Verslag() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const naam = household?.person_name ?? ''
  const voornaam = naam.split(' ')[0] || 'de persoon'

  const [params] = useSearchParams()
  const uitUrl = Number(params.get('dagen'))

  // Voor het eerste renderen weten we de bewaarde periode nog niet; 90 dagen
  // is de standaard en de URL wint als familie een periode koos.
  const a = useAnalyse(hh, Number.isFinite(uitUrl) && uitUrl > 0 ? uitUrl : 90)

  const gekozen = a.keuze?.blokken ?? []
  const meeDoen = BLOKKEN.filter((b) => gekozen.includes(b.id) && !a.leeg[b.id])
  const weg = nietOpgenomen(gekozen, a.leeg)

  const vandaag = new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="verslag min-h-screen bg-bg">
      <div className="niet-printen sticky top-0 z-10 border-b border-line bg-surface px-5 py-3">
        <div className="mx-auto flex max-w-[48rem] flex-wrap items-center gap-3">
          <Link to="/familie/analyse" className="font-semibold underline underline-offset-4">
            ‹ Terug naar analyse
          </Link>
          <span className="text-ink-soft">
            {meeDoen.length} {meeDoen.length === 1 ? 'onderdeel' : 'onderdelen'}
          </span>
          <button
            onClick={() => window.print()}
            className="ml-auto min-h-touch rounded-pill bg-accent-ink px-5 font-bold text-white"
          >
            Afdrukken of opslaan als PDF
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[48rem] px-6 py-10">
        {a.bezig ? <p className="text-ink-soft">Bezig met laden…</p> : null}

        <header className="border-b-2 border-ink pb-4">
          <h1 className="text-3xl font-extrabold tracking-tight">Verslag — {naam}</h1>
          <p className="mt-2 text-ink-soft">
            Periode {datum(a.van)} tot {datum(a.tot)} · afgedrukt op {vandaag}
          </p>
          <p className="text-ink-soft">
            Samengesteld door familie via de app Thuis. Geen medisch document.
          </p>
        </header>

        {/* Dit blok gaat vóór de cijfers, niet erna. Wie de kop leest en
            doorbladert, moet de beperking al gezien hebben. */}
        <section className="kader mt-6 border-[1.5px] border-line-strong p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider">Wat deze cijfers wel en niet zijn</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[0.95rem]">
            <li>
              <strong>Bevestigd is niet ingenomen.</strong> De app legt vast dat er op een knop
              gedrukt is, door wie en wanneer. Niet of het middel geslikt werd.
            </li>
            <li>
              Alles komt uit het gebruik van de app. Wat buiten de app gebeurde, staat er niet in.
            </li>
            <li>
              De app stelt geen diagnose en meet niets medisch. Er staan hier tellingen en
              tijdstippen, geen score en geen conclusie.
            </li>
          </ul>
        </section>

        {a.dekking ? (
          <section className="mt-6">
            <h2 className="kop">Over hoeveel dagen dit gaat</h2>
            <p className="mt-1">
              De app werd gebruikt op <strong>{a.dekking.dagen_gebruik} van de{' '}
              {a.dekking.dagen_periode} dagen</strong> in deze periode
              {a.dekking.eerste_dag ? (
                <>
                  , van {datum(a.dekking.eerste_dag)} tot {datum(a.dekking.laatste_dag ?? a.tot)}
                </>
              ) : null}
              . Alle percentages hieronder gaan over die dagen.
            </p>

            {a.stabiel.length > 0 ? (
              <>
                <p className="mt-3 font-semibold">Wat gelijk bleef</p>
                <ul className="mt-1 list-disc pl-5">
                  {a.stabiel.map((z) => (
                    <li key={z}>{z}</li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>
        ) : null}

        {meeDoen.map((b) => (
          <section key={b.id} className="heel-houden mt-7">
            <h2 className="kop">{b.opPapier}</h2>
            <div className="mt-2">
              {b.id === 'medicatie' ? <Medicatie a={a} voornaam={voornaam} /> : null}
              {b.id === 'dagritme' ? <Dagritme a={a} /> : null}
              {b.id === 'weekpatroon' ? <Weekpatroon a={a} /> : null}
              {b.id === 'nacht' ? <Nacht a={a} /> : null}
              {b.id === 'schema' ? <Schema a={a} /> : null}
              {b.id === 'notities' ? <Notities a={a} /> : null}
            </div>
          </section>
        ))}

        {!a.bezig && meeDoen.length === 0 ? (
          <p className="mt-7 text-ink-soft">
            Er staat nog niets aangevinkt. Kies op het analysescherm wat er op het verslag moet
            komen.
          </p>
        ) : null}

        {/* De belangrijkste regel van het blad. */}
        <section className="heel-houden mt-7 border-t-[1.5px] border-ink pt-4">
          <h2 className="kop">Wat er niet op dit verslag staat</h2>
          {weg.bewustWeg.length > 0 ? (
            <p className="mt-1">
              <strong>Weggelaten door familie:</strong> {weg.bewustWeg.join(', ')}. Deze gegevens
              bestaan wel in de app.
            </p>
          ) : null}
          {weg.geenGegevens.length > 0 ? (
            <p className="mt-1">
              <strong>Geen gegevens over:</strong> {weg.geenGegevens.join(', ')}. Hierover is in deze
              periode niets vastgelegd.
            </p>
          ) : null}
          {weg.bewustWeg.length === 0 && weg.geenGegevens.length === 0 ? (
            <p className="mt-1">Alles wat de app over deze periode heeft, staat hierboven.</p>
          ) : null}
          <p className="mt-2">
            De app registreert geen slaap, geen schermtijd en niet wat {voornaam} aan de
            spraakassistent vroeg.
          </p>
        </section>

        <footer className="mt-8 border-t border-line pt-3 text-sm text-ink-soft">
          Thuis — een digitaal geheugen voor het dagelijkse leven. Dit verslag vervangt geen
          professionele zorg.
        </footer>
      </main>
    </div>
  )
}

function datum(iso: string) {
  return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(
    new Date(iso),
  )
}

function pct(deel: number, totaal: number) {
  return totaal > 0 ? `${Math.round((deel / totaal) * 100)} %` : '—'
}

/** Eén tabelopmaak voor het hele blad: een arts scant kolommen, geen kaartjes. */
function Tabel({ koppen, rijen }: { koppen: string[]; rijen: (string | number)[][] }) {
  return (
    <table className="w-full border-collapse text-[0.95rem]">
      <thead>
        <tr>
          {koppen.map((k, i) => (
            <th
              key={k}
              className={`border-b border-ink-faint py-1 font-bold ${i === 0 ? 'text-left' : 'text-right'}`}
            >
              {k}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rijen.map((r, n) => (
          <tr key={n}>
            {r.map((c, i) => (
              <td
                key={i}
                className={`border-b border-line py-1 tabular-nums ${
                  i === 0 ? 'text-left font-semibold' : 'text-right'
                }`}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

type A = ReturnType<typeof useAnalyse>

function Medicatie({ a, voornaam }: { a: A; voornaam: string }) {
  if (!a.totaal) return null

  return (
    <>
      <p className="mb-2">
        In totaal <strong>{a.totaal.bevestigd} van {a.totaal.momenten} momenten</strong> bevestigd (
        {pct(a.totaal.bevestigd, a.totaal.momenten)}), waarvan {a.totaal.zelf} door {voornaam} zelf.
        Over {a.totaal.dagen} dagen.
      </p>

      <Tabel
        koppen={['Tijdstip', 'Momenten', 'Bevestigd', 'Aandeel', 'Waarvan zelf', 'Dagen']}
        rijen={a.perTijdstip.map((r) => [
          r.tijdstip,
          r.momenten,
          r.bevestigd,
          pct(r.bevestigd, r.momenten),
          r.zelf,
          r.dagen,
        ])}
      />

      <p className="mt-2 text-[0.9rem]">
        "Waarvan zelf" is het aantal momenten dat {voornaam} zelf bevestigde; de rest werd door
        familie of een zorgverlener bevestigd. Een gelijkblijvend totaal kan dus een verschuiving
        verbergen.
      </p>
    </>
  )
}

function Dagritme({ a }: { a: A }) {
  const maand = (d: string) =>
    new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric' }).format(new Date(d))

  return (
    <>
      <p className="mb-2">
        Het tijdstip van de eerste afgevinkte activiteit van de dag. Het verschil tussen de vroegste
        en de laatste zegt meer dan de mediaan.
      </p>

      <Tabel
        koppen={['Maand', 'Dagen', 'Vroegste', 'Mediaan', 'Laatste', 'Spreiding']}
        rijen={a.dagritme.map((r) => [
          maand(r.maand),
          r.dagen,
          r.vroegste,
          r.mediaan,
          r.laatste,
          `${r.spreiding} min`,
        ])}
      />
    </>
  )
}

function Weekpatroon({ a }: { a: A }) {
  return (
    <>
      <p className="mb-2">
        Per dag van de week. Belangrijk bij het lezen: valt een hoog cijfer samen met de dag waarop
        er bezoek is, dan meet het bezoek en geen zelfstandigheid.
      </p>

      <Tabel
        koppen={['Dag', 'Momenten', 'Bevestigd', 'Aandeel', 'Zelf', 'Agenda gedaan', 'Dagen']}
        rijen={a.week.map((r) => [
          WEEKDAGEN[r.weekdag - 1],
          r.med_momenten,
          r.med_bevestigd,
          pct(r.med_bevestigd, r.med_momenten),
          r.med_zelf,
          `${r.agenda_gedaan} / ${r.agenda_items}`,
          r.dagen,
        ])}
      />
    </>
  )
}

function Nacht({ a }: { a: A }) {
  return (
    <>
      <p className="mb-2">
        Handelingen in de app door de persoon zelf tussen 1 en 6 uur: {a.nachtTotaal} in deze
        periode. <strong>Dit is geen slaapmeting</strong> — iemand kan wakker liggen zonder het
        scherm aan te raken, dus dit telt eerder te weinig dan te veel.
      </p>

      <Tabel
        koppen={['Uur', 'Handelingen', 'Aantal dagen']}
        rijen={a.nacht.map((r) => [`${r.uur}:00`, r.aantal, r.dagen])}
      />
    </>
  )
}

function Schema({ a }: { a: A }) {
  return (
    <>
      <p className="mb-2">
        Wijzigingen aan het medicatieschema in deze periode. Een daling in de cijfers hierboven
        betekent iets anders als er kort daarvoor een middel bijkwam of wegging.
      </p>

      <ul className="space-y-1">
        {a.wijzigingen.map((w) => (
          <li key={w.id} className="flex flex-wrap gap-x-2">
            <span className="w-36 shrink-0">{datum(w.changed_at)}</span>
            <span className="font-semibold">{w.medication_name}</span>
            <span>
              {w.veld === 'status'
                ? (w.nieuw ?? '')
                : `${w.veld}: ${w.oud ?? '—'} → ${w.nieuw ?? '—'}`}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

function Notities({ a }: { a: A }) {
  const bron: Record<string, string> = {
    family: 'familie',
    caregiver: 'zorgverlener',
    person: 'zelf',
    system: 'app',
  }

  return (
    <>
      <p className="mb-2">In de woorden van familie en zorgverleners.</p>

      <ul className="space-y-1.5">
        {a.notities.map((n) => (
          <li key={n.id} className="heel-houden flex flex-wrap gap-x-2">
            <span className="w-36 shrink-0">{datum(n.occurred_at)}</span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">{n.title}</span>
              {n.note ? <span> — {n.note}</span> : null}
              <span className="text-ink-soft"> ({bron[n.source] ?? n.source})</span>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
