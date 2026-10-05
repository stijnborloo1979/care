import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Copy, Download, FileUp, TriangleAlert } from 'lucide-react'
import { useOrganisatie } from './useOrganisatie'
import { nodigUit, ROLNAAM } from './zorgApi'
import {
  geldigAdres,
  importeerBewoners,
  leesTabel,
  naarBewoners,
  naarMedewerkers,
  nodigFamilieUit,
  sjabloon,
  type BewonerRij,
  type ImportUitslag,
  type MedewerkerRij,
} from '../../services/importeren'
import { Fout, Kaart, Kop, Leeg, knop, knopKlein, knopRustig, label, tekstvak } from './ui'
import { tt } from '../../lib/uiTaal'

/** Eén CSV-veld: tussen aanhalingstekens, en nooit als formule in Excel. */
function csvVeld(v: string): string {
  const veilig = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
  return `"${veilig.replace(/"/g, '""')}"`
}

function bewaar(naam: string, inhoud: string) {
  const url = URL.createObjectURL(new Blob([inhoud], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = naam
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Bewoners en medewerkers in één keer in Care zetten, uit Excel: plakken of
 * een CSV-bestand. Eerst nakijken, dan pas bewaren.
 */
export default function Importeren() {
  const { org, beheert, isBeheerder } = useOrganisatie()
  const [soort, setSoort] = useState<'bewoners' | 'medewerkers'>('bewoners')
  if (!org) return null
  if (!beheert) return <Navigate to="/zorg" replace />

  return (
    <div className="space-y-6">
      <Kop
        titel={tt('Importeren')}
        uitleg={tt('Zet je bewoners en medewerkers in één keer in LifeAngle Care, rechtstreeks uit Excel.')}
      />
      {isBeheerder ? (
        <div className="flex gap-2" role="tablist">
          {(['bewoners', 'medewerkers'] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={soort === s}
              onClick={() => setSoort(s)}
              className={`min-h-[2.75rem] rounded-pill border-[1.5px] px-5 font-semibold ${
                soort === s ? 'border-accent-ink bg-accent-soft text-accent-ink' : 'border-line-strong text-ink-soft'
              }`}
            >
              {s === 'bewoners' ? tt('Bewoners') : tt('Medewerkers')}
            </button>
          ))}
        </div>
      ) : null}
      {soort === 'bewoners' ? <Bewoners orgId={org.org_id} /> : <Medewerkers orgId={org.org_id} />}
    </div>
  )
}

function Invoer({ soort, onTabel }: { soort: 'bewoners' | 'medewerkers'; onTabel: (t: string[][]) => void }) {
  const [tekst, setTekst] = useState('')
  return (
    <Kaart titel={tt('1. Je lijst')}>
      <p className="text-ink-soft">
        {soort === 'bewoners'
          ? tt('Kolommen: naam, afdeling, kamer en (als je wil) het e-mailadres van één familielid. Kopieer de cellen in Excel en plak ze hieronder, of kies een CSV-bestand.')
          : tt('Kolommen: e-mailadres en rol (beheerder, coördinator of zorgkundige). Kopieer de cellen in Excel en plak ze hieronder, of kies een CSV-bestand.')}
      </p>
      <textarea
        value={tekst}
        onChange={(e) => setTekst(e.target.value)}
        rows={6}
        placeholder={(soort === 'bewoners' ? [tt('Naam'), tt('Afdeling'), tt('Kamer'), tt('E-mail familie')] : [tt('E-mail'), tt('Rol')]).join('\t')}
        aria-label={tt('Plak hier je lijst')}
        className={`${tekstvak} font-mono text-sm`}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => onTabel(leesTabel(tekst))} disabled={!tekst.trim()} className={knop}>
          {tt('Nakijken')}
        </button>
        <label className={`${knopRustig} cursor-pointer`}>
          <FileUp size={18} strokeWidth={1.75} aria-hidden="true" />
          {tt('CSV-bestand kiezen')}
          <input
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (!f) return
              const inhoud = await f.text()
              setTekst(inhoud)
              onTabel(leesTabel(inhoud))
            }}
          />
        </label>
        <button onClick={() => bewaar(`lifeangle-${soort}.csv`, sjabloon(soort))} className={`${knopKlein} inline-flex items-center gap-1.5`}>
          <Download size={14} strokeWidth={1.75} aria-hidden="true" /> {tt('Voorbeeldbestand')}
        </button>
      </div>
      <p className="mt-2 text-sm text-ink-faint">{tt('Een .xlsx-bestand? Kies in Excel "Opslaan als" en dan "CSV (gescheiden door lijstscheidingsteken)".')}</p>
    </Kaart>
  )
}

/** De database meldt in het Nederlands; de vaste meldingen vertalen we hier. */
function meldingTekst(m: string): string {
  const afd = m.match(/^Afdeling "(.*)" bestaat niet$/)
  return afd ? tt('Afdeling "{naam}" bestaat niet', { naam: afd[1] }) : tt(m)
}

const STATUS: Record<ImportUitslag['status'], string> = {
  ok: tt('klaar om te importeren'),
  fout: tt('fout'),
  overgeslagen: tt('overgeslagen'),
}

function Bewoners({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const [rijen, setRijen] = useState<BewonerRij[]>([])
  const [na, setNa] = useState<ImportUitslag[] | null>(null)
  const [links, setLinks] = useState<{ naam: string; adres: string; link: string | null; fout?: string }[]>([])

  const proef = useMutation({ mutationFn: (r: BewonerRij[]) => importeerBewoners(orgId, r, true) })
  const echt = useMutation({
    mutationFn: async () => {
      const uit = await importeerBewoners(orgId, rijen, false)
      const nieuw: typeof links = []
      for (const u of uit) {
        const adres = rijen[u.rij - 1]?.familie ?? ''
        if (u.status !== 'ok' || !u.household_id || !geldigAdres(adres)) continue
        try {
          nieuw.push({ naam: u.naam, adres, link: await nodigFamilieUit(u.household_id, adres) })
        } catch (e) {
          nieuw.push({ naam: u.naam, adres, link: null, fout: e instanceof Error ? e.message : String((e as { message?: string }).message ?? e) })
        }
      }
      return { uit, nieuw }
    },
    onSuccess: ({ uit, nieuw }) => {
      setNa(uit)
      setLinks(nieuw)
      for (const k of ['alle-bewoners', 'mijn-bewoners', 'bezetting']) queryClient.invalidateQueries({ queryKey: ['zorg', k] })
    },
  })

  const lees = (t: string[][]) => {
    const r = naarBewoners(t)
    setRijen(r)
    setNa(null)
    setLinks([])
    if (r.length) proef.mutate(r)
  }

  const nagekeken = proef.data ?? []
  const klaar = nagekeken.filter((u) => u.status === 'ok').length
  const metFamilie = rijen.filter((r, i) => nagekeken[i]?.status === 'ok' && geldigAdres(r.familie)).length

  if (na) {
    const ok = na.filter((u) => u.status === 'ok').length
    return (
      <div className="space-y-6">
        <Kaart titel={<><CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" className="text-accent-ink" /> {tt('Klaar')}</>}>
          <p className="text-lg">{ok === 1 ? tt('1 bewoner staat nu in Care.') : tt('{n} bewoners staan nu in Care.', { n: ok })}</p>
          <p className="mt-1 text-ink-soft">{tt('Wijs ze toe aan zorgkundigen bij Beheer, en geef ze een kamer bij Kamers.')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/zorg/beheer" className={knop}>{tt('Naar Beheer')}</Link>
            <Link to="/zorg/kamers" className={knopRustig}>{tt('Naar Kamers')}</Link>
          </div>
        </Kaart>
        {links.length > 0 ? (
          <Kaart titel={tt('Uitnodigingen voor de familie')}>
            <p className="text-ink-soft">
              {tt('Stuur elke familie haar link (mail, WhatsApp). Wie de link opent met dat e-mailadres, wordt familiebeheerder en koppelt de tablet. De link is 14 dagen geldig.')}
            </p>
            <ul className="mt-3 space-y-2">
              {links.map((l) => (
                <li key={l.naam} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-soft px-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{l.naam}</span> <span className="text-sm text-ink-soft">· {l.adres}</span>
                    {l.fout ? <span className="block text-sm text-alert">{l.fout}</span> : null}
                  </span>
                  {l.link ? (
                    <button onClick={() => navigator.clipboard?.writeText(l.link!)} className={`${knopKlein} inline-flex items-center gap-1.5`}>
                      <Copy size={14} strokeWidth={1.75} aria-hidden="true" /> {tt('Link kopiëren')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <button
              onClick={() =>
                bewaar(
                  'lifeangle-uitnodigingen-familie.csv',
                  '﻿' + [[tt('Bewoner'), tt('E-mail familie'), tt('Link')], ...links.filter((l) => l.link).map((l) => [l.naam, l.adres, l.link ?? ''])].map((r) => r.map(csvVeld).join(';')).join('\r\n'),
                )
              }
              className={`${knopKlein} mt-3 inline-flex items-center gap-1.5`}
            >
              <Download size={14} strokeWidth={1.75} aria-hidden="true" /> {tt('Alle links (CSV)')}
            </button>
          </Kaart>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Invoer soort="bewoners" onTabel={lees} />
      {proef.isPending ? <p className="text-ink-soft">{tt('Bezig met nakijken…')}</p> : null}
      <Fout fout={proef.error} />
      {rijen.length > 0 && proef.data ? (
        <Kaart titel={tt('2. Nakijken')}>
          <p className="text-ink-soft">
            {tt('{ok} van {n} rijen zijn in orde.', { ok: klaar, n: rijen.length })}{' '}
            {metFamilie === 1 ? tt('1 familie krijgt een uitnodiging.') : metFamilie > 1 ? tt('{n} families krijgen een uitnodiging.', { n: metFamilie }) : null}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-ink-soft">
                  <th className="py-2 pr-2 font-semibold">#</th>
                  <th className="py-2 pr-2 font-semibold">{tt('Naam')}</th>
                  <th className="py-2 pr-2 font-semibold">{tt('Afdeling')}</th>
                  <th className="py-2 pr-2 font-semibold">{tt('Kamer')}</th>
                  <th className="py-2 pr-2 font-semibold">{tt('E-mail familie')}</th>
                  <th className="py-2 font-semibold">{tt('Status')}</th>
                </tr>
              </thead>
              <tbody>
                {rijen.map((r, i) => {
                  const u = nagekeken[i]
                  const slecht = r.familie && !geldigAdres(r.familie)
                  return (
                    <tr key={i} className="border-b border-line/60 last:border-none">
                      <td className="py-1.5 pr-2 text-ink-faint">{i + 1}</td>
                      <td className="py-1.5 pr-2 font-semibold">{r.naam || '—'}</td>
                      <td className="py-1.5 pr-2">{r.afdeling}</td>
                      <td className="py-1.5 pr-2">{r.kamer}</td>
                      <td className={`py-1.5 pr-2 ${slecht ? 'text-alert' : ''}`}>
                        {r.familie}
                        {slecht ? ` (${tt('geen geldig adres')})` : ''}
                      </td>
                      <td className={`py-1.5 ${u?.status === 'ok' ? 'text-accent-ink' : u?.status === 'fout' ? 'text-alert' : 'text-ink-soft'}`}>
                        {u ? STATUS[u.status] : ''}
                        {u?.melding ? ` · ${meldingTekst(u.melding)}` : ''}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button onClick={() => echt.mutate()} disabled={klaar === 0 || echt.isPending} className={`${knop} mt-4`}>
            {echt.isPending ? tt('Bezig…') : klaar === 1 ? tt('1 bewoner importeren') : tt('{n} bewoners importeren', { n: klaar })}
          </button>
          <Fout fout={echt.error} />
        </Kaart>
      ) : rijen.length === 0 && proef.isIdle ? null : rijen.length === 0 ? <Leeg>{tt('Er staan geen rijen in je lijst.')}</Leeg> : null}
    </div>
  )
}

function Medewerkers({ orgId }: { orgId: string }) {
  const [rijen, setRijen] = useState<MedewerkerRij[]>([])
  const [uitslag, setUitslag] = useState<{ email: string; link: string | null; gemaild: boolean; fout?: string }[] | null>(null)
  const goed = rijen.filter((r) => geldigAdres(r.email) && r.rol)
  const verstuur = useMutation({
    mutationFn: async () => {
      const uit: NonNullable<typeof uitslag> = []
      for (const r of goed) {
        try {
          const { link, gemaild } = await nodigUit(orgId, r.email, r.rol!)
          uit.push({ email: r.email, link, gemaild })
        } catch (e) {
          uit.push({ email: r.email, link: null, gemaild: false, fout: e instanceof Error ? e.message : String((e as { message?: string }).message ?? e) })
        }
      }
      return uit
    },
    onSuccess: setUitslag,
  })

  if (uitslag) {
    return (
      <Kaart titel={<><CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" className="text-accent-ink" /> {tt('Uitnodigingen gemaakt')}</>}>
        <ul className="space-y-2">
          {uitslag.map((u) => (
            <li key={u.email} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-soft px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="font-semibold">{u.email}</span>
                <span className="block text-sm text-ink-soft">
                  {u.fout ? <span className="text-alert">{tt(u.fout)}</span> : u.gemaild ? tt('Mail verstuurd') : tt('Geen mail verstuurd: stuur de link zelf door')}
                </span>
              </span>
              {u.link ? (
                <button onClick={() => navigator.clipboard?.writeText(u.link!)} className={`${knopKlein} inline-flex items-center gap-1.5`}>
                  <Copy size={14} strokeWidth={1.75} aria-hidden="true" /> {tt('Link kopiëren')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <Link to="/zorg/beheer" className={`${knop} mt-4 inline-flex`}>{tt('Naar Beheer')}</Link>
      </Kaart>
    )
  }

  return (
    <div className="space-y-6">
      <Invoer soort="medewerkers" onTabel={(t) => setRijen(naarMedewerkers(t))} />
      {rijen.length > 0 ? (
        <Kaart titel={tt('2. Nakijken')}>
          <ul className="space-y-1.5">
            {rijen.map((r, i) => {
              const fout = !geldigAdres(r.email) ? tt('geen geldig adres') : !r.rol ? tt('onbekende rol "{rol}"', { rol: r.rolTekst }) : null
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-soft px-3 py-2 text-sm">
                  {fout ? <TriangleAlert size={16} strokeWidth={1.75} aria-hidden="true" className="text-alert" /> : <CheckCircle2 size={16} strokeWidth={1.75} aria-hidden="true" className="text-accent-ink" />}
                  <span className="min-w-0 flex-1 font-semibold">{r.email || '—'}</span>
                  <span className={fout ? 'text-alert' : 'text-ink-soft'}>{fout ?? ROLNAAM[r.rol!]}</span>
                </li>
              )
            })}
          </ul>
          <p className={`${label} mt-3`}>{tt('Elke medewerker krijgt een eigen uitnodiging, 14 dagen geldig.')}</p>
          <button onClick={() => verstuur.mutate()} disabled={goed.length === 0 || verstuur.isPending} className={`${knop} mt-3`}>
            {verstuur.isPending ? tt('Bezig…') : goed.length === 1 ? tt('1 uitnodiging maken') : tt('{n} uitnodigingen maken', { n: goed.length })}
          </button>
          <Fout fout={verstuur.error} />
        </Kaart>
      ) : null}
    </div>
  )
}
