import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Download, ShieldCheck } from 'lucide-react'
import { useOrganisatie } from './useOrganisatie'
import { LABELS, VOLGORDE, naarCsv, orgRapport, periode } from '../../services/rapport'
import { Fout, Kaart, Kop, Laden, Leeg, knopKlein, label, veld } from './ui'
import { tt, uiLocale } from '../../lib/uiTaal'

const PERIODES = [
  { id: 'deze-maand', naam: tt('Deze maand') },
  { id: 'vorige-maand', naam: tt('Vorige maand') },
  { id: '30-dagen', naam: tt('Laatste 30 dagen') },
  { id: 'dit-jaar', naam: tt('Dit jaar') },
] as const

/**
 * Rapporten (83): wat de app oplevert, in aantallen. Nooit namen, nooit
 * iets per bewoner; persoonlijke cijfers pas vanaf vijf bewoners.
 */
export default function Rapporten() {
  const { org, beheert } = useOrganisatie()
  const orgId = org?.org_id ?? ''
  const [keuze, setKeuze] = useState<(typeof PERIODES)[number]['id'] | 'eigen'>('deze-maand')
  const standaard = periode('deze-maand')
  const [van, setVan] = useState(standaard.van)
  const [tot, setTot] = useState(standaard.tot)
  const p = keuze === 'eigen' ? { van, tot } : periode(keuze)

  const rapport = useQuery({
    queryKey: ['zorg', 'rapport', orgId, p.van, p.tot],
    queryFn: () => orgRapport(orgId, p.van, p.tot),
    enabled: !!orgId && beheert,
  })
  if (!org) return null
  if (!beheert) return <Navigate to="/zorg" replace />

  const rijen = rapport.data ?? []
  const totaal = (s: string) => rijen.find((r) => r.sleutel === s && r.afdeling === null)
  const afdelingen = [...new Set(rijen.filter((r) => r.afdeling !== null).map((r) => r.afdeling as string))].sort()
  const perAfd = (a: string, s: string) => rijen.find((r) => r.afdeling === a && r.sleutel === s)?.waarde ?? 0
  const fmt = new Intl.DateTimeFormat(uiLocale(), { day: 'numeric', month: 'long', year: 'numeric' })

  function download() {
    const blob = new Blob([naarCsv(rijen, p.van, p.tot)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `lifeangle-rapport-${p.van}-${p.tot}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <Kop
        titel={tt('Rapporten')}
        uitleg={tt('Wat er in het huis gebeurt, in aantallen.')}
        rechts={
          rijen.length > 0 ? (
            <button onClick={download} className={`${knopKlein} inline-flex items-center gap-2`}>
              <Download size={16} strokeWidth={1.75} aria-hidden="true" /> {tt('Download (CSV)')}
            </button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        {PERIODES.map((x) => (
          <button
            key={x.id}
            onClick={() => setKeuze(x.id)}
            aria-pressed={keuze === x.id}
            className={`min-h-[2.75rem] rounded-pill border-[1.5px] px-4 font-semibold ${
              keuze === x.id ? 'border-accent-ink bg-accent-soft text-accent-ink' : 'border-line-strong text-ink-soft'
            }`}
          >
            {x.naam}
          </button>
        ))}
        <button
          onClick={() => setKeuze('eigen')}
          aria-pressed={keuze === 'eigen'}
          className={`min-h-[2.75rem] rounded-pill border-[1.5px] px-4 font-semibold ${
            keuze === 'eigen' ? 'border-accent-ink bg-accent-soft text-accent-ink' : 'border-line-strong text-ink-soft'
          }`}
        >
          {tt('Zelf kiezen')}
        </button>
        {keuze === 'eigen' ? (
          <span className="flex flex-wrap gap-2">
            <label>
              <span className={label}>{tt('Van')}</span>
              <input type="date" value={van} max={tot} onChange={(e) => setVan(e.target.value)} className={veld} />
            </label>
            <label>
              <span className={label}>{tt('Tot en met')}</span>
              <input type="date" value={tot} min={van} max={new Date(new Date(van + 'T12:00:00').getTime() + 365 * 864e5).toISOString().slice(0, 10)} onChange={(e) => setTot(e.target.value)} className={veld} />
            </label>
          </span>
        ) : null}
      </div>
      <p className="text-ink-soft">
        {tt('{van} tot en met {tot}', { van: fmt.format(new Date(p.van + 'T12:00:00')), tot: fmt.format(new Date(p.tot + 'T12:00:00')) })}
      </p>

      {rapport.isLoading ? <Laden /> : null}
      <Fout fout={rapport.error} />
      {rapport.data === null ? <Leeg>{tt('De rapporten zijn er na de update van de database (83).')}</Leeg> : null}

      {rijen.length > 0 ? (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {VOLGORDE.map((s) => {
              const r = totaal(s)
              if (!r) return null
              return (
                <div key={s} className="min-w-0 rounded-card bg-surface p-4 shadow-card">
                  <dt className="truncate text-sm font-semibold text-ink-soft">{LABELS[s]?.label ?? s}</dt>
                  <dd className="text-3xl font-bold tabular-nums">{r.waarde ?? '–'}</dd>
                  <dd className="text-xs text-ink-faint">{r.waarde === null ? tt('Pas vanaf 5 bewoners en 28 dagen') : LABELS[s]?.uitleg}</dd>
                </div>
              )
            })}
          </dl>

          {afdelingen.length > 0 ? (
            <Kaart titel={tt('Per afdeling')}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-left">
                  <thead>
                    <tr className="border-b border-line text-sm text-ink-soft">
                      <th className="py-2 pr-3 font-semibold">{tt('Afdeling')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{tt('Bewoners')}</th>
                      <th className="py-2 pr-3 text-right font-semibold">{tt('Activiteiten')}</th>
                      <th className="py-2 text-right font-semibold">{tt('Aanwezigheden')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {afdelingen.map((a) => (
                      <tr key={a} className="border-b border-line/60 last:border-none">
                        <td className="py-2 pr-3 font-semibold">{a}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{perAfd(a, 'bewoners')}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{perAfd(a, 'activiteiten')}</td>
                        <td className="py-2 text-right tabular-nums">{perAfd(a, 'aanwezig')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Kaart>
          ) : null}

          <p className="flex items-start gap-2 text-sm text-ink-faint">
            <ShieldCheck size={16} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0" />
            {tt('Alleen aantallen, nooit namen of iets over één bewoner. Bezoeken en uitstappen tellen pas mee als er in die periode minstens vijf bewoners waren, over minstens 28 dagen.')}
          </p>
        </>
      ) : null}
    </div>
  )
}
