import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from './AuthProvider'
import CodeLogin from './CodeLogin'

interface Preview {
  person_name: string
  role: string
  relation: string | null
  invited_by_name: string
  expires_at: string
  status: string
}

const ROL_TEKST: Record<string, string> = {
  admin: 'Je krijgt volledige toegang en kan zelf mensen uitnodigen.',
  member: 'Je kan de planning, foto\u2019s en het zorglogboek beheren.',
  caregiver: 'Je ziet alleen wat gedeeld is: medicatie en zorglogboek.',
  person: 'Je krijgt het eenvoudige scherm.',
}

export default function AcceptInvite() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const { session, loading } = useAuth()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!token) {
      setError('Deze link is onvolledig. Vraag een nieuwe uitnodiging.')
      return
    }
    supabase
      .rpc('invite_preview', { invite_token: token })
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else if (Array.isArray(data) && data.length > 0) setPreview(data[0] as Preview)
        else setError('Deze uitnodiging bestaat niet.')
      })
  }, [token])

  async function aanvaard() {
    setBusy(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('accept_invite', { invite_token: token })
      if (error) throw error
      await queryClient.invalidateQueries({ queryKey: ['households'] })
      navigate('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Aanvaarden lukte niet.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="p-6 text-ink-soft">Even geduld…</p>

  return (
    <main className="mx-auto max-w-[32rem] px-5 py-10">
      {preview ? (
        <div className="rounded-card border border-line bg-surface p-6 shadow-card">
          <h1 className="text-2xl font-bold tracking-tight">
            {preview.invited_by_name} nodigt je uit
          </h1>
          <p className="mt-2 text-lg text-ink-soft">
            Om mee te zorgen voor {preview.person_name}
            {preview.relation ? ` als ${preview.relation.toLowerCase()}` : ''}.
          </p>
          <p className="mt-3 text-ink-soft">{ROL_TEKST[preview.role] ?? ''}</p>

          {preview.status !== 'open' ? (
            <p role="alert" className="mt-4 rounded-2xl border border-alert bg-surface-soft p-3 text-alert">
              Deze uitnodiging is {preview.status}. Vraag {preview.invited_by_name} om een nieuwe.
            </p>
          ) : session ? (
            <button
              onClick={aanvaard}
              disabled={busy}
              className="mt-6 flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
            >
              {busy ? 'Bezig…' : 'Uitnodiging aanvaarden'}
            </button>
          ) : (
            <div className="mt-6">
              {/* Eerst inloggen, dan pas aanvaarden: het token alleen geeft
                  geen toegang, het mailadres moet kloppen. */}
              <CodeLogin
                titel="Eerst even inloggen"
                uitleg="Gebruik het e-mailadres waarop je de uitnodiging kreeg. Je krijgt een code van zes cijfers."
              />
            </div>
          )}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl border border-alert bg-surface-soft p-3 text-alert">
          {error}
        </p>
      ) : null}
    </main>
  )
}
