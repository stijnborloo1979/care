import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useVoiceRecorder } from './useVoiceRecorder'
import { sendVoiceMessage, type Channel } from './messages'

interface Props {
  householdId: string
  channel?: Channel
  /** Naam van de ontvanger, voor de tekst op de knop. */
  recipient?: string
}

function klok(s: number) {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

/**
 * Familie neemt een kort bericht op. Drie toestanden, meer niet:
 * opnemen, beluisteren, versturen.
 */
export default function VoiceRecorder({ householdId, channel = 'person', recipient = 'Maria' }: Props) {
  const { state, seconds, recording, error, start, stop, reset, maxSeconds } = useVoiceRecorder()
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  async function verstuur() {
    if (!recording) return
    setSending(true)
    setSendError(null)
    try {
      await sendVoiceMessage({
        householdId,
        channel,
        blob: recording.blob,
        seconds: recording.seconds,
        mimeType: recording.mimeType,
      })
      reset()
      await queryClient.invalidateQueries({ queryKey: ['inbox', householdId] })
    } catch (e) {
      setSendError(
        e instanceof Error ? e.message : 'Versturen lukte niet. Controleer je verbinding.',
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card">
      <h3 className="text-lg font-bold">Spreek een bericht in voor {recipient}</h3>
      <p className="mt-1 text-sm text-ink-soft">
        Maximaal {maxSeconds} seconden. {recipient} hoort je stem, en hoeft niets te lezen.
      </p>

      {state === 'idle' || state === 'error' ? (
        <button
          onClick={start}
          className="mt-4 flex min-h-touch w-full items-center justify-center gap-3 rounded-pill bg-accent-ink px-5 font-semibold text-white"
        >
          <span aria-hidden="true">🎤</span> Opnemen
        </button>
      ) : null}

      {state === 'requesting' ? (
        <p className="mt-4 text-ink-soft">Microfoon wordt gevraagd…</p>
      ) : null}

      {state === 'recording' ? (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-alert" aria-hidden="true" />
            <span className="text-xl font-bold tabular-nums">{klok(seconds)}</span>
            <span className="text-sm text-ink-soft">aan het opnemen</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-pill bg-surface-deep">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.min(100, (seconds / maxSeconds) * 100)}%` }}
            />
          </div>
          <button
            onClick={stop}
            className="mt-4 flex min-h-touch w-full items-center justify-center rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
          >
            Stoppen
          </button>
        </div>
      ) : null}

      {state === 'ready' && recording ? (
        <div className="mt-4 space-y-3">
          {/* Altijd eerst terugluisteren: een half opgenomen zin wil je niet versturen. */}
          <audio src={recording.url} controls className="w-full" />
          <p className="text-sm text-ink-soft">{klok(recording.seconds)} opgenomen</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={verstuur}
              disabled={sending}
              className="flex min-h-touch flex-1 items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
            >
              {sending ? 'Versturen…' : `Versturen naar ${recipient}`}
            </button>
            <button
              onClick={reset}
              disabled={sending}
              className="flex min-h-touch items-center justify-center rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
            >
              Opnieuw
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {error}
        </p>
      ) : null}
      {sendError ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {sendError}
        </p>
      ) : null}
    </div>
  )
}
