import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { usePeople } from '../people/usePeople'
import { useNotes } from '../notes/useNotes'
import { getRoutines } from '../../services/routines'
import { getMedicijnen, tijdenVan } from '../../services/medication'
import { getStories } from '../../services/stories'
import { getProfiel } from '../../services/profiel'
import { locale } from '../../lib/i18n'

/**
 * "Dit ben ik" — één blad dat meegaat naar het ziekenhuis of het
 * woonzorgcentrum.
 *
 * Wie daar aankomt, is voor het personeel op dag één een naam op een
 * lijst. Ze weten niet wie haar dochter is, dat ze rond vier uur onrustig
 * wordt, of dat muziek haar kalmeert. Dat staat hier, en het staat er in
 * de ik-vorm: dit gaat over een mens, niet over een dossier.
 *
 * Alles komt uit wat de app al weet. Familie vult alleen de drie dingen
 * aan die nergens anders stonden.
 *
 * Wat hier bewust NIET op staat, is een medicatielijst met doseringen.
 * Een blad dat familie thuis bijhoudt, hoort niet gebruikt te worden om
 * medicatie toe te dienen; daarvoor is het schema van de huisarts of
 * apotheek er. Wat er wel op staat zijn de tijdstippen — dat ze gewend is
 * om acht uur iets te krijgen, is zorgcontext en geen voorschrift.
 */
export default function DitBenIk() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const naam = household?.person_name ?? ''
  const voornaam = naam.split(' ')[0] || naam

  const aan = { enabled: !!hh }
  const { data: profiel } = useQuery({ ...aan, queryKey: ['profiel', hh], queryFn: () => getProfiel(hh) })
  const { data: mensen } = usePeople(hh)
  const { data: weetjes } = useNotes(hh)
  const { data: routines } = useQuery({ ...aan, queryKey: ['routines', hh], queryFn: () => getRoutines(hh) })
  const { data: meds } = useQuery({ ...aan, queryKey: ['medicijnen', hh], queryFn: () => getMedicijnen(hh) })
  const { data: verhalen } = useQuery({ ...aan, queryKey: ['stories', hh], queryFn: () => getStories(hh) })

  const familie = (mensen ?? []).filter((p) => p.kind === 'family' && p.name)
  const zorg = (mensen ?? []).filter((p) => p.kind === 'care' || p.kind === 'contact')
  const voorkeuren = (weetjes ?? []).filter((n) => n.category === 'voorkeuren')
  const actieveMeds = (meds ?? []).filter((m) => m.active)

  // De momenten van de dag, samengevoegd uit alle routines: het personeel
  // heeft aan "om 7:30 sta ik op" meer dan aan de naam van een routine.
  const dagdelen = (routines ?? [])
    .filter((r) => r.active)
    .flatMap((r) => r.routine_step ?? [])
    .sort((a, b) => a.at_time.localeCompare(b.at_time))

  // Eén of twee zinnen uit het levensverhaal. Niet alles: dit blad is geen
  // biografie, het is een handreiking.
  const stukjes = (verhalen ?? []).filter((v) => v.body && v.body.trim().length > 0).slice(0, 3)

  const vandaag = new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  const aanspreken = profiel?.noemNaam?.trim() || voornaam

  return (
    <div className="ditbenik min-h-screen bg-bg">
      <div className="niet-printen sticky top-0 z-10 border-b border-line bg-surface px-5 py-3">
        <div className="mx-auto flex max-w-[48rem] flex-wrap items-center gap-3">
          <Link to="/familie/wie" className="font-semibold underline underline-offset-4">
            ‹ Terug
          </Link>
          <button
            onClick={() => window.print()}
            className="ml-auto min-h-touch rounded-pill bg-accent-ink px-5 font-bold text-white"
          >
            Afdrukken of opslaan als PDF
          </button>
        </div>
      </div>

      <main className="mx-auto max-w-[48rem] px-6 py-10">
        <header className="border-b-2 border-ink pb-4">
          <p className="text-sm font-bold uppercase tracking-[0.2em]">Dit ben ik</p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight">{naam}</h1>
          <p className="mt-2 text-lg">
            Noem me <strong>{aanspreken}</strong>.
          </p>
        </header>

        {/* Het belangrijkste eerst. Wie dit blad maar half leest, moet dít
            gelezen hebben. */}
        <section className="kader mt-6 border-[1.5px] border-ink p-4">
          <h2 className="kop">Wat je moet weten om mij te helpen</h2>
          <dl className="mt-2 space-y-2">
            <Veld label="Zo praat je best met mij" tekst={profiel?.omgang} />
            <Veld label="Als ik onrustig ben, helpt dit" tekst={profiel?.rust} />
            <Veld label="Hier raak ik van overstuur" tekst={profiel?.vermijden} />
          </dl>
        </section>

        {stukjes.length > 0 ? (
          <section className="heel-houden mt-6">
            <h2 className="kop">Waar ik vandaan kom</h2>
            <div className="mt-2 space-y-2">
              {stukjes.map((v) => (
                <p key={v.id}>{v.body}</p>
              ))}
            </div>
          </section>
        ) : null}

        <section className="heel-houden mt-6">
          <h2 className="kop">Wie bij mij hoort</h2>
          {familie.length === 0 ? (
            <p className="mt-2">Nog niemand ingevuld.</p>
          ) : (
            <ul className="mt-2 list-none space-y-1 p-0">
              {familie.map((p) => (
                <li key={p.id} className="flex flex-wrap gap-x-2">
                  <span className="font-bold">{p.name}</span>
                  <span>— {p.relation}</span>
                  {p.phone ? <span className="tabular-nums">· {p.phone}</span> : null}
                  {p.description ? <span>· {p.description}</span> : null}
                </li>
              ))}
            </ul>
          )}

          {zorg.length > 0 ? (
            <>
              <p className="mt-3 font-semibold">Mijn huisarts en andere contacten</p>
              <ul className="mt-1 list-none space-y-1 p-0">
                {zorg.map((p) => (
                  <li key={p.id} className="flex flex-wrap gap-x-2">
                    <span className="font-bold">{p.name}</span>
                    <span>— {p.relation}</span>
                    {p.phone ? <span className="tabular-nums">· {p.phone}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>

        {dagdelen.length > 0 ? (
          <section className="heel-houden mt-6">
            <h2 className="kop">Hoe mijn dag er thuis uitziet</h2>
            <p className="mt-1 text-[0.95rem]">
              Niet om na te volgen, wel om te weten wat ik gewend ben.
            </p>
            <ul className="mt-2 list-none space-y-1 p-0">
              {dagdelen.map((s) => (
                <li key={s.id} className="flex gap-3">
                  <span className="w-16 shrink-0 font-bold tabular-nums">{s.at_time.slice(0, 5)}</span>
                  <span>{s.title}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {voorkeuren.length > 0 ? (
          <section className="heel-houden mt-6">
            <h2 className="kop">Wat ik graag heb</h2>
            <ul className="mt-2 list-none space-y-1 p-0">
              {voorkeuren.map((n) => (
                <li key={n.id}>
                  <span className="font-bold">{n.title}</span>
                  {n.body ? <span> — {n.body}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {actieveMeds.length > 0 ? (
          <section className="heel-houden mt-6">
            <h2 className="kop">Wanneer ik thuis medicatie krijg</h2>
            {/* Bewust zonder dosering. Zie de uitleg bovenaan dit bestand. */}
            <p className="mt-1 text-[0.95rem]">
              <strong>Dit is geen medicatielijst.</strong> Het zegt alleen op welke momenten ik thuis
              iets kreeg. Vraag het schema met doseringen aan mijn huisarts of apotheek.
            </p>
            <ul className="mt-2 list-none space-y-1 p-0">
              {actieveMeds.map((m) => (
                <li key={m.id} className="flex flex-wrap gap-x-3">
                  <span className="w-28 shrink-0 font-bold tabular-nums">
                    {tijdenVan(m).join(' · ')}
                  </span>
                  <span>{m.name}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {profiel?.vrij?.trim() ? (
          <section className="heel-houden mt-6">
            <h2 className="kop">Nog dit</h2>
            <p className="mt-2 whitespace-pre-wrap">{profiel.vrij}</p>
          </section>
        ) : null}

        <footer className="mt-8 border-t border-line pt-3 text-sm">
          Samengesteld door mijn familie op {vandaag}, via de app Thuis. Geen medisch dossier.
        </footer>
      </main>
    </div>
  )
}

/**
 * Een leeg veld verdwijnt niet, maar zegt dat het leeg is.
 *
 * Juist hier: leest iemand "Als ik onrustig ben, helpt dit" en staat er
 * niets, dan weet hij dat het niemand gevraagd is — in plaats van te denken
 * dat er niets helpt.
 */
function Veld({ label, tekst }: { label: string; tekst?: string }) {
  const schoon = (tekst ?? '').trim()
  return (
    <div>
      <dt className="font-bold">{label}</dt>
      <dd className="m-0 whitespace-pre-wrap">
        {schoon || <span className="text-ink-faint">— niet ingevuld —</span>}
      </dd>
    </div>
  )
}
