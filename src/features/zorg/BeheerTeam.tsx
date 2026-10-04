import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MailPlus } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import {
  ROLNAAM,
  openOrgUitnodigingen,
  stuurUitnodigingOpnieuw,
  trekUitnodigingIn,
  zetMedewerkerActief,
  zetMedewerkerRol,
  type Medewerker,
  type OrgRol,
} from './zorgApi'
import { Fout, Kaart, Leeg, dagEnUur, knopKlein } from './ui'
import { tt } from '../../lib/uiTaal'

function useVerversTeam(orgId: string) {
  const queryClient = useQueryClient()
  return () => {
    for (const k of ['medewerkers', 'toewijzingen', 'open-uitnodigingen', 'mijn-bewoners'])
      queryClient.invalidateQueries({ queryKey: ['zorg', k, orgId] })
  }
}

/**
 * Rol wijzigen en uit dienst zetten, voor de beheerder (70). Nooit jezelf.
 * Wie beheerder wordt of uit dienst gaat, verliest meteen zijn afdeling en
 * toewijzingen; dat staat er ook bij.
 */
export function MedewerkerActies({ orgId, m }: { orgId: string; m: Medewerker }) {
  const ik = useAuth().session?.user.id
  const ververs = useVerversTeam(orgId)
  const rol = useMutation({ mutationFn: (r: OrgRol) => zetMedewerkerRol(orgId, m.profile_id, r), onSuccess: ververs })
  const actief = useMutation({ mutationFn: (a: boolean) => zetMedewerkerActief(orgId, m.profile_id, a), onSuccess: ververs })
  if (m.profile_id === ik) return null

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {m.actief ? (
        <>
          <select
            value={m.rol}
            onChange={(e) => {
              const nieuw = e.target.value as OrgRol
              const waarschuwing =
                nieuw === 'org_admin' && (m.afdelingen.length > 0)
                  ? ` ${tt('Als beheerder ziet {naam} geen inhoud over bewoners: afdelingen en toewijzingen vervallen.', { naam: m.naam })}`
                  : ''
              if (confirm(`${tt('{naam} {rol} maken?', { naam: m.naam, rol: ROLNAAM[nieuw].toLowerCase() })}${waarschuwing}`)) rol.mutate(nieuw)
            }}
            aria-label={tt('Rol van {naam}', { naam: m.naam })}
            className="min-h-[2.25rem] rounded-pill border border-line bg-surface px-3 text-sm font-semibold text-ink-soft"
          >
            {(Object.keys(ROLNAAM) as OrgRol[]).map((r) => (
              <option key={r} value={r}>
                {ROLNAAM[r]}
              </option>
            ))}
          </select>
          <button
            onClick={() => {
              if (confirm(tt('{naam} uit dienst zetten? Toegang, afdelingen en toewijzingen stoppen meteen.', { naam: m.naam }))) actief.mutate(false)
            }}
            className={knopKlein}
          >
            {tt('Uit dienst')}
          </button>
        </>
      ) : (
        <button onClick={() => actief.mutate(true)} className={knopKlein}>
          {tt('Terug in dienst')}
        </button>
      )}
      <Fout fout={rol.error ?? actief.error} />
    </div>
  )
}

/** Uitnodigingen die nog niet aanvaard zijn: opnieuw sturen of intrekken. */
export function OpenUitnodigingen({ orgId }: { orgId: string }) {
  const ververs = useVerversTeam(orgId)
  const lijst = useQuery({ queryKey: ['zorg', 'open-uitnodigingen', orgId], queryFn: () => openOrgUitnodigingen(orgId) })
  const [melding, setMelding] = useState<string | null>(null)
  const opnieuw = useMutation({
    mutationFn: stuurUitnodigingOpnieuw,
    onSuccess: (r) => {
      setMelding(r.gemaild ? tt('Opnieuw gemaild, en 14 dagen langer geldig.') : tt('14 dagen langer geldig. De mail kon niet vertrekken; stuur de link zelf.'))
      ververs()
    },
  })
  const intrekken = useMutation({ mutationFn: trekUitnodigingIn, onSuccess: ververs })

  const nu = Date.now()
  const open = (lijst.data ?? []).filter(Boolean)
  if (!lijst.data) return null

  return (
    <Kaart titel={<><MailPlus size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Openstaande uitnodigingen')}</>}>
      {open.length === 0 ? <Leeg>{tt('Geen openstaande uitnodigingen.')}</Leeg> : null}
      <ul className="space-y-2">
        {open.map((u) => {
          const verlopen = new Date(u.expires_at).getTime() <= nu
          return (
            <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-surface-soft px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block break-all font-semibold">{u.email}</span>
                <span className="block text-sm text-ink-soft">
                  {verlopen
                    ? tt('Verlopen op {datum}', { datum: dagEnUur(u.expires_at) })
                    : tt('Geldig tot {datum}', { datum: dagEnUur(u.expires_at) })}
                </span>
              </span>
              <button onClick={() => opnieuw.mutate(u.id)} disabled={opnieuw.isPending} className={knopKlein}>
                {tt('Opnieuw sturen')}
              </button>
              <button
                onClick={() => {
                  if (confirm(tt('De uitnodiging voor {email} intrekken? De link werkt dan niet meer.', { email: u.email }))) intrekken.mutate(u.id)
                }}
                className={knopKlein}
              >
                {tt('Intrekken')}
              </button>
            </li>
          )
        })}
      </ul>
      {melding ? <p role="status" className="mt-3 text-sm text-ink-soft">{melding}</p> : null}
      <Fout fout={opnieuw.error ?? intrekken.error} />
    </Kaart>
  )
}
