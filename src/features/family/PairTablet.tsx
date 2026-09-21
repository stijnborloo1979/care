import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Tablet } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Familie maakt hier een code, en tikt die in op de tablet onder
 * "Dit is de tablet van de persoon". Tien minuten geldig, één keer.
 */
export default function PairTablet({
  householdId,
  personName,
}: {
  householdId: string
  personName: string
}) {
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null)
  const [rest, setRest] = useState(0)

  const maak = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_pairing_code', { hh: householdId })
      if (error) throw error
      const rij = Array.isArray(data) ? data[0] : data
      return rij as { code: string; expires_at: string }
    },
    onSuccess: (r) => setCode(r),
  })

  useEffect(() => {
    if (!code) return
    const tik = () =>
      setRest(Math.max(0, Math.round((new Date(code.expires_at).getTime() - Date.now()) / 1000)))
    tik()
    const id = window.setInterval(tik, 1000)
    return () => window.clearInterval(id)
  }, [code])

  const verlopen = code && rest <= 0

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent-soft text-accent-ink">
          <Tablet size={20} strokeWidth={1.75} />
        </span>
        <h2 className="text-lg font-bold">Tablet koppelen</h2>
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        Open Thuis op de tablet van {personName}, kies <em>Dit is de tablet van de persoon</em>, en
        tik daar deze code in. {personName} hoeft geen mail of wachtwoord te hebben.
      </p>

      {code && !verlopen ? (
        <div className="mt-5 rounded-2xl bg-accent-soft p-5 text-center">
          <p className="font-mono text-4xl font-bold tracking-[0.2em] text-accent-ink">
            {code.code.slice(0, 4)} {code.code.slice(4)}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Nog {Math.floor(rest / 60)}:{String(rest % 60).padStart(2, '0')} geldig
          </p>
        </div>
      ) : null}

      <button
        onClick={() => maak.mutate()}
        disabled={maak.isPending}
        className="mt-5 flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
      >
        {maak.isPending ? 'Bezig…' : code ? 'Nieuwe code' : 'Code maken'}
      </button>

      {maak.error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {maak.error instanceof Error ? maak.error.message : 'Code maken lukte niet.'}
        </p>
      ) : null}
    </section>
  )
}
