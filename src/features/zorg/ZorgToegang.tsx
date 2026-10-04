import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useOrganisaties } from './useOrganisatie'
import { aanvaardInApp, mijnUitnodigingen, ROLNAAM } from './zorgApi'
import { foutTekst } from './ui'
import { tt } from '../../lib/uiTaal'

export function useOpenUitnodigingen() {
  const { session } = useAuth()
  return useQuery({
    queryKey: ['org-uitnodigingen', session?.user.id],
    enabled: !!session,
    staleTime: 60_000,
    queryFn: mijnUitnodigingen,
  })
}

/**
 * De weg naar LifeAngle Care, in de app zelf: open uitnodigingen
 * aanvaarden, naar je woonzorgcentrum gaan, of er een registreren.
 *
 * 'menu'  compact, in het accountmenu
 * 'kaart' alleen open uitnodigingen, groot, bovenaan de onboarding
 */
export default function ZorgToegang({ vorm, onKlaar }: { vorm: 'menu' | 'kaart'; onKlaar?: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const organisaties = useOrganisaties()
  const uitnodigingen = useOpenUitnodigingen()
  const aanvaard = useMutation({
    mutationFn: aanvaardInApp,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['organisaties'] })
      await queryClient.invalidateQueries({ queryKey: ['org-uitnodigingen'] })
      onKlaar?.()
      navigate('/zorg')
    },
  })

  const open = uitnodigingen.data ?? []
  const lid = (organisaties.data ?? []).length > 0
  const fout = aanvaard.error ? foutTekst(aanvaard.error) : null

  if (vorm === 'kaart') {
    if (open.length === 0) return null
    return (
      <div className="mb-6 space-y-3">
        {open.map((u) => (
          <section key={u.id} className="rounded-card bg-accent-soft p-5" aria-label={tt('Uitnodiging')}>
            <p className="flex items-center gap-2 font-bold text-accent-ink">
              <Building2 size={20} strokeWidth={1.75} aria-hidden="true" />
              {tt('Uitnodiging van {organisatie}', { organisatie: u.organisatie })}
            </p>
            <p className="mt-1 text-ink-soft">
              {tt('Je bent uitgenodigd als {rol}. Werk je daar? Dan hoef je hieronder niets in te vullen.', { rol: ROLNAAM[u.rol]?.toLowerCase() ?? u.rol })}
            </p>
            <button
              onClick={() => aanvaard.mutate(u.id)}
              disabled={aanvaard.isPending}
              className="mt-3 min-h-touch rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-50"
            >
              {aanvaard.isPending ? tt('Bezig…') : tt('Aanvaarden')}
            </button>
          </section>
        ))}
        {fout ? <p role="alert" className="text-sm text-alert">{fout}</p> : null}
      </div>
    )
  }

  const item = 'flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm font-semibold hover:bg-surface-soft'
  return (
    <>
      <p className="px-2 pb-1 pt-1 text-xs font-bold uppercase tracking-wide text-ink-faint">{tt('Woonzorgcentrum')}</p>
      {open.map((u) => (
        <button key={u.id} onClick={() => aanvaard.mutate(u.id)} disabled={aanvaard.isPending} className={item}>
          <Building2 size={16} strokeWidth={1.75} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            {tt('Uitnodiging van {organisatie} aanvaarden', { organisatie: u.organisatie })}
            <span className="block text-xs font-normal text-ink-faint">{ROLNAAM[u.rol] ?? u.rol}</span>
          </span>
        </button>
      ))}
      {lid ? (
        <Link to="/zorg" onClick={onKlaar} className={item}>
          <Building2 size={16} strokeWidth={1.75} aria-hidden="true" />
          {tt('Naar het woonzorgcentrum')}
        </Link>
      ) : (
        <Link to="/zorg/nieuw" onClick={onKlaar} className={item}>
          <Building2 size={16} strokeWidth={1.75} aria-hidden="true" />
          {tt('Een woonzorgcentrum registreren')}
        </Link>
      )}
      {fout ? <p role="alert" className="px-2 text-xs text-alert">{fout}</p> : null}
      <div className="my-2 h-px bg-line" />
    </>
  )
}
