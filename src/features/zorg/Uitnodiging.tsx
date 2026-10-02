import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import CodeLogin from '../auth/CodeLogin'
import { ROLNAAM, aanvaardUitnodiging, bekijkUitnodiging } from './zorgApi'
import { Fout, knop } from './ui'

/** Een medewerker opent de link uit zijn uitnodiging. */
export default function Uitnodiging() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { session, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const preview = useQuery({
    queryKey: ['zorg', 'uitnodiging', token, session?.user.id],
    enabled: !!token && !!session,
    queryFn: () => bekijkUitnodiging(token),
  })
  const aanvaard = useMutation({
    mutationFn: () => aanvaardUitnodiging(token),
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ['organisaties'], type: 'all' })
      navigate('/zorg', { replace: true })
    },
  })

  if (loading) return <p className="p-6 text-ink-soft">Even geduld…</p>

  // Ingelogd met een ander adres dan de uitnodiging: meteen zeggen, niet pas na de klik.
  const ikBen = session?.user.email?.toLowerCase() ?? ''
  const verkeerdAdres = !!preview.data && !!ikBen && preview.data.email.toLowerCase() !== ikBen

  return (
    <main className="mx-auto max-w-[32rem] px-5 py-10">
      <div className="rounded-card border border-line bg-surface p-6 shadow-card">
        {!token ? (
          <p role="alert" className="text-alert">Deze link is onvolledig. Vraag een nieuwe uitnodiging.</p>
        ) : !session ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Je bent uitgenodigd</h1>
            <p className="mt-2 text-ink-soft">Om in LifeAngle Care te werken voor je woonzorgcentrum.</p>
            <div className="mt-6">
              <CodeLogin
                titel="Eerst even inloggen"
                uitleg="Gebruik het e-mailadres waarop je de uitnodiging kreeg. Je krijgt een code van zes cijfers."
              />
            </div>
          </>
        ) : preview.isLoading ? (
          <p className="text-ink-soft">Even geduld…</p>
        ) : !preview.data ? (
          <p role="alert" className="text-alert">Deze uitnodiging bestaat niet.</p>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">{preview.data.organisatie} nodigt je uit</h1>
            <p className="mt-2 text-lg text-ink-soft">Als {ROLNAAM[preview.data.rol].toLowerCase()}.</p>
            {preview.data.status !== 'open' ? (
              <p role="alert" className="mt-4 rounded-2xl border border-alert bg-surface-soft p-3 text-alert">
                Deze uitnodiging is {preview.data.status}. Vraag je beheerder om een nieuwe.
              </p>
            ) : verkeerdAdres ? (
              <div className="mt-4 rounded-2xl border border-line bg-surface-soft p-4">
                <p>
                  Deze uitnodiging is voor <strong className="break-all">{preview.data.email}</strong>. Je bent nu
                  ingelogd als <strong className="break-all">{session.user.email}</strong>.
                </p>
                <button onClick={() => signOut()} className={`${knop} mt-4 w-full`}>
                  Uitloggen en inloggen met {preview.data.email}
                </button>
              </div>
            ) : (
              <button onClick={() => aanvaard.mutate()} disabled={aanvaard.isPending} className={`${knop} mt-6 w-full`}>
                {aanvaard.isPending ? 'Bezig…' : 'Uitnodiging aanvaarden'}
              </button>
            )}
            <Fout fout={aanvaard.error ?? preview.error} />
          </>
        )}
      </div>
    </main>
  )
}
