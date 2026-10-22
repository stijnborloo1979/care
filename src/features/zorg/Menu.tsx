import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganisatie } from './useOrganisatie'
import { menuBevestig, menuBewaarDag, menuVan, type MenuRij } from './menuApi'
import { datumVandaag, leesMenuBestand, maandagVan, weekDagen, type MenuDag } from './menuPuur'
import { Fout, Kaart, Kop, Laden, knop, knopKlein, knopRustig, label, tekstvak, veld } from './ui'
import { tt } from '../../lib/uiTaal'

/**
 * Het weekmenu van het woonzorgcentrum (108). Iedere medewerker vult in;
 * het menu wordt pas zichtbaar op de tablets na bevestiging door een
 * coördinator of de beheerder. Allergenen vult alleen de beheerder of een
 * coördinator in.
 */

const datumNl = (iso: string) => {
  const [j, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, d)).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
}

const verschuif = (maandag: string, weken: number) => {
  const [j, m, d] = maandag.split('-').map(Number)
  return new Date(Date.UTC(j, m - 1, d + weken * 7)).toISOString().slice(0, 10)
}

export default function Menu() {
  const { org, beheert } = useOrganisatie()
  const orgId = org?.org_id ?? ''
  const qc = useQueryClient()
  const [maandag, setMaandag] = useState(() => maandagVan(datumVandaag(new Date())))
  const dagen = weekDagen(maandag)
  const sleutel = ['zorg', 'menu', orgId, maandag]
  const rijen = useQuery({ queryKey: sleutel, queryFn: () => menuVan(orgId, dagen[0], dagen[6]), enabled: !!orgId })
  const ververs = () => qc.invalidateQueries({ queryKey: ['zorg', 'menu'] })

  const opslaan = useMutation({
    mutationFn: (dag: MenuDag) =>
      menuBewaarDag({ org: orgId, dag, bestaand: (rijen.data ?? []).find((r) => r.datum === dag.datum), magAllergenen: beheert }),
    onSuccess: ververs,
  })
  const bevestig = useMutation({ mutationFn: () => menuBevestig(orgId, dagen[0], dagen[6]), onSuccess: ververs })

  if (!org) return null
  const perDatum = new Map((rijen.data ?? []).map((r) => [r.datum, r]))

  return (
    <div className="space-y-6">
      <Kop
        titel={tt('Menu van de week')}
        uitleg={tt('Iedereen vult in. Het menu komt pas op de tablets na bevestiging door een coördinator.')}
      />

      <div className="flex flex-wrap items-center gap-3">
        <button className={knopRustig} onClick={() => setMaandag(verschuif(maandag, -1))}>{tt('Vorige week')}</button>
        <button className={knopRustig} onClick={() => setMaandag(maandagVan(datumVandaag(new Date())))}>{tt('Deze week')}</button>
        <button className={knopRustig} onClick={() => setMaandag(verschuif(maandag, 1))}>{tt('Volgende week')}</button>
        {beheert ? (
          <button className={knop} disabled={bevestig.isPending} onClick={() => bevestig.mutate()}>
            {tt('Week bevestigen voor de tablets')}
          </button>
        ) : null}
      </div>
      <Fout fout={opslaan.error ?? bevestig.error ?? rijen.error} />

      <ImportKaart orgId={orgId} beheert={beheert} bestaand={rijen.data ?? []} onKlaar={ververs} />

      {rijen.isLoading ? <Laden /> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {dagen.map((datum) => (
          <MenuDagKaart
            key={`${datum}-${perDatum.get(datum)?.bijgewerkt_at ?? 'nieuw'}`}
            datum={datum}
            rij={perDatum.get(datum)}
            beheert={beheert}
            bezig={opslaan.isPending}
            onSla={(dag) => opslaan.mutate(dag)}
          />
        ))}
      </div>
    </div>
  )
}

function MenuDagKaart({
  datum,
  rij,
  beheert,
  bezig,
  onSla,
}: {
  datum: string
  rij: MenuRij | undefined
  beheert: boolean
  bezig: boolean
  onSla: (dag: MenuDag) => void
}) {
  const [soep, setSoep] = useState(rij?.soep ?? '')
  const [middag, setMiddag] = useState(rij?.middag ?? '')
  const [dessert, setDessert] = useState(rij?.dessert ?? '')
  const [notitie, setNotitie] = useState(rij?.notitie ?? '')
  const [soepAll, setSoepAll] = useState(rij?.soep_allergenen ?? '')
  const [middagAll, setMiddagAll] = useState(rij?.middag_allergenen ?? '')
  const [dessertAll, setDessertAll] = useState(rij?.dessert_allergenen ?? '')
  const bevestigd = rij?.status === 'gepubliceerd'

  return (
    <Kaart
      titel={
        <span className="flex flex-wrap items-center gap-2">
          <span>{datumNl(datum)}</span>
          <span className={`rounded-pill px-3 py-0.5 text-sm font-semibold ${bevestigd ? 'bg-accent-soft text-ink' : 'bg-surface-soft text-ink-soft'}`}>
            {bevestigd ? tt('Bevestigd') : rij ? tt('Concept') : tt('Nog leeg')}
          </span>
        </span>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={label} htmlFor={`${datum}-soep`}>{tt('Soep')}</label>
          <input id={`${datum}-soep`} className={veld} value={soep} onChange={(e) => setSoep(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor={`${datum}-middag`}>{tt('Middagmaal')}</label>
          <input id={`${datum}-middag`} className={veld} value={middag} onChange={(e) => setMiddag(e.target.value)} />
        </div>
        <div>
          <label className={label} htmlFor={`${datum}-dessert`}>{tt('Dessert')}</label>
          <input id={`${datum}-dessert`} className={veld} value={dessert} onChange={(e) => setDessert(e.target.value)} />
        </div>

        {beheert ? (
          <details className="rounded-2xl border border-line p-3">
            <summary className="cursor-pointer font-semibold">{tt('Allergenen (keuken of coördinator)')}</summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className={label} htmlFor={`${datum}-soepall`}>{tt('Allergenen soep')}</label>
                <input id={`${datum}-soepall`} className={veld} value={soepAll} onChange={(e) => setSoepAll(e.target.value)} placeholder={tt('bv. gluten, selderij')} />
              </div>
              <div>
                <label className={label} htmlFor={`${datum}-middagall`}>{tt('Allergenen middagmaal')}</label>
                <input id={`${datum}-middagall`} className={veld} value={middagAll} onChange={(e) => setMiddagAll(e.target.value)} />
              </div>
              <div>
                <label className={label} htmlFor={`${datum}-dessertall`}>{tt('Allergenen dessert')}</label>
                <input id={`${datum}-dessertall`} className={veld} value={dessertAll} onChange={(e) => setDessertAll(e.target.value)} />
              </div>
            </div>
          </details>
        ) : (
          <p className="text-sm text-ink-soft">{tt('Allergenen vult de keuken of een coördinator in.')}</p>
        )}

        <div>
          <label className={label} htmlFor={`${datum}-notitie`}>{tt('Notitie voor de bewoners')}</label>
          <textarea id={`${datum}-notitie`} className={tekstvak} rows={2} value={notitie} onChange={(e) => setNotitie(e.target.value)} />
        </div>

        <button
          className={knop}
          disabled={bezig}
          onClick={() =>
            onSla({
              datum,
              soep: soep || null,
              middag: middag || null,
              dessert: dessert || null,
              notitie: notitie || null,
              soep_allergenen: beheert ? soepAll || null : null,
              middag_allergenen: beheert ? middagAll || null : null,
              dessert_allergenen: beheert ? dessertAll || null : null,
            })
          }
        >
          {tt('Opslaan')}
        </button>
      </div>
    </Kaart>
  )
}

/** Een CSV uit de keuken inlezen. Eerst het voorbeeld, dan pas opslaan. */
function ImportKaart({
  orgId,
  beheert,
  bestaand,
  onKlaar,
}: {
  orgId: string
  beheert: boolean
  bestaand: MenuRij[]
  onKlaar: () => void
}) {
  const [voorbeeld, setVoorbeeld] = useState<ReturnType<typeof leesMenuBestand> | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  async function kiesBestand(bestand: File | undefined) {
    setFout(null)
    setVoorbeeld(null)
    if (!bestand) return
    const tekst = await bestand.text()
    setVoorbeeld(leesMenuBestand(tekst, { magAllergenen: beheert }))
  }

  async function bewaar(bevestigen: boolean) {
    if (!voorbeeld || voorbeeld.dagen.length === 0) return
    setBezig(true)
    setFout(null)
    try {
      for (const dag of voorbeeld.dagen) {
        const oud = bestaand.find((r) => r.datum === dag.datum)
        await menuBewaarDag({ org: orgId, dag, bestaand: oud, magAllergenen: beheert })
      }
      if (bevestigen && beheert) {
        const van = voorbeeld.dagen[0].datum
        const tot = voorbeeld.dagen[voorbeeld.dagen.length - 1].datum
        await menuBevestig(orgId, van, tot)
      }
      setVoorbeeld(null)
      onKlaar()
    } catch (e) {
      setFout(e instanceof Error ? e.message : tt('Dat lukte nu niet. Probeer het opnieuw.'))
    } finally {
      setBezig(false)
    }
  }

  return (
    <Kaart titel={tt('Menu uit een bestand inlezen')}>
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          {tt('Kies een CSV-bestand met de kolommen Datum, Soep, Middagmaal, Dessert. Sla het Excel-sjabloon op als CSV (puntkomma).')}
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label={tt('Bestand met het menu')}
          onChange={(e) => kiesBestand(e.target.files?.[0])}
          className="min-h-touch"
        />
        {voorbeeld ? (
          <div className="space-y-3">
            {voorbeeld.fouten.length > 0 ? (
              <ul className="space-y-1 rounded-2xl border border-alert p-3 text-alert" role="alert">
                {voorbeeld.fouten.map((f) => <li key={f}>{f}</li>)}
              </ul>
            ) : null}
            {voorbeeld.waarschuwingen.length > 0 ? (
              <ul className="space-y-1 rounded-2xl border border-warn p-3">
                {voorbeeld.waarschuwingen.map((w) => <li key={w}>{w}</li>)}
              </ul>
            ) : null}
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {voorbeeld.dagen.map((d) => (
                <li key={d.datum} className="p-3">
                  <p className="font-semibold">{datumNl(d.datum)}</p>
                  <p className="text-sm">{[d.soep, d.middag, d.dessert].filter(Boolean).join(' · ') || tt('geen gerechten')}</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <button className={knop} disabled={bezig || voorbeeld.dagen.length === 0 || voorbeeld.fouten.length > 0} onClick={() => bewaar(false)}>
                {tt('Opslaan als concept')}
              </button>
              {beheert ? (
                <button className={knopKlein} disabled={bezig || voorbeeld.dagen.length === 0 || voorbeeld.fouten.length > 0} onClick={() => bewaar(true)}>
                  {tt('Opslaan en bevestigen')}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        <Fout fout={fout} />
      </div>
    </Kaart>
  )
}
