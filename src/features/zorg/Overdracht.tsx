import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { useOrganisatie } from './useOrganisatie'
import OpenVragen from './OpenVragen'
import { DIENSTEN, dienstDatum, huidigeDienst, medewerkers, nieuweOverdracht, overdrachten, type Dienst } from './zorgApi'
import { Fout, Kaart, Kop, Laden, Leeg, knop, label, tekstvak, uur } from './ui'
import { tt, uiLocale } from '../../lib/uiTaal'

const datumLabel = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(uiLocale(), { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * Wat de volgende dienst moet weten. Per afdeling, alleen voor wie er
 * werkt. Niet aan te passen: een overdracht is wat er op dat moment
 * gezegd werd.
 */
export default function Overdracht() {
  const { org } = useOrganisatie()
  const { session } = useAuth()
  const queryClient = useQueryClient()
  const afdelingen = org?.afdelingen ?? []
  const [gekozen, setGekozen] = useState<string | null>(null)
  const afdeling = afdelingen.find((a) => a.id === gekozen) ?? afdelingen[0] ?? null

  const [dienst, setDienst] = useState<Dienst>(huidigeDienst())
  const [tekst, setTekst] = useState('')

  const lijst = useQuery({
    queryKey: ['zorg', 'overdracht', afdeling?.id],
    enabled: !!afdeling,
    queryFn: () => overdrachten(afdeling!.id),
  })
  const team = useQuery({
    queryKey: ['zorg', 'medewerkers', org?.org_id],
    enabled: !!org,
    queryFn: () => medewerkers(org!.org_id),
  })
  const namen = Object.fromEntries((team.data ?? []).map((m) => [m.profile_id, m.naam]))

  const bewaar = useMutation({
    mutationFn: () =>
      nieuweOverdracht({
        department_id: afdeling!.id,
        shift_date: dienstDatum(),
        shift: dienst,
        body: tekst,
        author_id: session!.user.id,
      }),
    onSuccess: () => {
      setTekst('')
      queryClient.invalidateQueries({ queryKey: ['zorg', 'overdracht', afdeling?.id] })
    },
  })

  if (!org) return null

  if (afdelingen.length === 0) {
    return (
      <div className="space-y-6">
        <Kop titel={tt('Overdracht')} />
        <Leeg>{tt('Je staat nog op geen afdeling. De beheerder van {org} zet je op een afdeling.', { org: org.naam })}</Leeg>
      </div>
    )
  }

  // Per dag en dienst groeperen, nieuwste eerst.
  const groepen = new Map<string, typeof lijst.data>()
  for (const o of lijst.data ?? []) {
    const k = `${o.shift_date}|${o.shift}`
    if (!groepen.has(k)) groepen.set(k, [])
    groepen.get(k)!.push(o)
  }

  return (
    <div className="space-y-6">
      <Kop
        titel={tt('Overdracht')}
        uitleg={tt('Wat de volgende dienst moet weten. Een overdracht wordt na een tijd automatisch gewist; wat blijvend belangrijk is, schrijf je in een zorgnotitie.')}
      />

      <OpenVragen orgId={org.org_id} />

      {afdelingen.length > 1 ? (
        <div role="tablist" aria-label={tt('Afdeling')} className="flex flex-wrap gap-2">
          {afdelingen.map((a) => (
            <button
              key={a.id}
              role="tab"
              aria-selected={a.id === afdeling?.id}
              onClick={() => setGekozen(a.id)}
              className={`min-h-touch rounded-pill px-4 font-semibold ${
                a.id === afdeling?.id ? 'bg-accent-ink text-white' : 'border-[1.5px] border-line-strong bg-surface'
              }`}
            >
              {a.naam}
            </button>
          ))}
        </div>
      ) : null}

      <Kaart titel={tt('Nieuwe overdracht · {afdeling}', { afdeling: afdeling?.naam ?? '' })}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (tekst.trim()) bewaar.mutate()
          }}
        >
          <fieldset>
            <legend className={label}>{tt('Dienst')}</legend>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DIENSTEN.map((d) => (
                <button
                  key={d.waarde}
                  type="button"
                  aria-pressed={dienst === d.waarde}
                  onClick={() => setDienst(d.waarde)}
                  className={`rounded-pill px-3 py-1.5 text-sm font-semibold ${
                    dienst === d.waarde ? 'bg-accent-ink text-white' : 'border border-line bg-surface text-ink-soft'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="mt-3 block">
            <span className={label}>{tt('Wat moet de volgende dienst weten?')}</span>
            <textarea rows={5} maxLength={8000} value={tekst} onChange={(e) => setTekst(e.target.value)} className={tekstvak} />
          </label>
          <button type="submit" disabled={!tekst.trim() || bewaar.isPending} className={`${knop} mt-3 w-full sm:w-auto`}>
            {bewaar.isPending ? tt('Bezig…') : tt('Overdracht bewaren')}
          </button>
          <Fout fout={bewaar.error} />
        </form>
      </Kaart>

      <Kaart titel={tt('De laatste dagen')}>
        {lijst.isLoading ? <Laden /> : null}
        <Fout fout={lijst.error} />
        {lijst.data && lijst.data.length === 0 ? <Leeg>{tt('Nog geen overdracht de laatste dagen.')}</Leeg> : null}
        <div className="space-y-5">
          {[...groepen.entries()].map(([k, rijen]) => {
            const [datum, d] = k.split('|')
            return (
              <div key={k}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
                  {datumLabel(datum)} · {DIENSTEN.find((x) => x.waarde === d)?.label}
                </h3>
                <ul className="mt-2 space-y-2">
                  {(rijen ?? []).map((o) => (
                    <li key={o.id} className="rounded-2xl bg-surface-soft px-4 py-3">
                      <p className="whitespace-pre-wrap break-words">{o.body}</p>
                      <p className="mt-1 text-sm text-ink-faint">
                        {(o.author_id && namen[o.author_id]) || tt('Een collega')} · {uur(o.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </Kaart>
    </div>
  )
}
