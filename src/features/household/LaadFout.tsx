import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../auth/AuthProvider'
import { tt } from '../../lib/uiTaal'

/**
 * Als de huishoudens niet te laden zijn, is dat een fout — geen nieuwe
 * gebruiker. Vroeger stuurde een fout je stil naar de onboarding, en dan
 * leek het alsof je huishouden weg was. Dit scherm zegt wat er misloopt,
 * leesbaar op een gsm zonder console.
 */
export default function LaadFout({
  error,
  onOpnieuw,
}: {
  error?: unknown
  onOpnieuw?: () => void
}) {
  const { session, signOut } = useAuth()
  const [uid, setUid] = useState<string>('…')

  useEffect(() => {
    supabase.rpc('debug_auth_uid').then(({ data, error: e }) => {
      setUid(e ? `fout: ${e.message}` : String(data))
    })
  }, [])

  const melding =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message: unknown }).message)
      : error
        ? String(error)
        : 'geen'

  return (
    <main className="mx-auto max-w-[34rem] px-5 py-10">
      <h1 className="text-2xl font-bold">{tt('Je gegevens zijn nu niet te laden')}</h1>
      <p className="mt-2 text-ink-soft">{tt('Je huishouden is niet weg. Probeer het opnieuw.')}</p>
      <div className="mt-6 flex gap-3">
        {onOpnieuw ? (
          <button
            onClick={onOpnieuw}
            className="min-h-[3rem] rounded-full bg-accent px-6 font-bold text-white"
          >
            {tt('Opnieuw')}
          </button>
        ) : null}
        <button
          onClick={() => signOut()}
          className="min-h-[3rem] rounded-full border-[1.5px] border-line-strong px-6 font-bold"
        >
          {tt('Uitloggen')}
        </button>
      </div>
      <Diagnose melding={melding} email={session?.user.email} id={session?.user.id} uid={uid} />
    </main>
  )
}

/** Tijdelijk: wat de app ziet. Kan weg zodra het inlogprobleem opgelost is. */
export function Diagnose({
  melding,
  email,
  id,
  uid,
  aantal,
}: {
  melding?: string
  email?: string
  id?: string
  uid?: string
  aantal?: number
}) {
  return (
    <pre className="mt-8 whitespace-pre-wrap break-all rounded-2xl bg-surface p-4 text-xs text-ink-soft">
      {`ingelogd als: ${email ?? '-'}
user id app:  ${id ?? '-'}
auth.uid() db: ${uid ?? '-'}
huishoudens:  ${aantal ?? '-'}
fout:         ${melding ?? 'geen'}`}
    </pre>
  )
}
