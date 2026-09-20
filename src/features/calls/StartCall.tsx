import { useState } from 'react'
import { startCall } from '../../services/calls'
import CallScreen from './CallScreen'
import { heeftTurn } from './useWebRTC'

/**
 * De familiekant: één knop, die de oproep aanmaakt en meteen het
 * gespreksscherm opent. Aan de andere kant rinkelt het toestel en wordt
 * na vijf seconden vanzelf opgenomen.
 */
export default function StartCall({
  householdId,
  metWie,
}: {
  householdId: string
  metWie: string
}) {
  const [callId, setCallId] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function bellen() {
    setBezig(true)
    setFout(null)
    try {
      setCallId(await startCall(householdId))
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'Bellen lukte niet.')
    } finally {
      setBezig(false)
    }
  }

  if (callId) {
    return (
      <CallScreen callId={callId} rol="beller" metWie={metWie} onKlaar={() => setCallId(null)} />
    )
  }

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card">
      <h2 className="text-lg font-bold">Videobellen met {metWie}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Het beeld gaat rechtstreeks van toestel naar toestel, versleuteld. Er komt geen dienst van
        buitenaf aan te pas en er wordt niets opgenomen.
      </p>

      <button
        onClick={bellen}
        disabled={bezig}
        className="mt-4 flex min-h-touch w-full items-center justify-center gap-2 rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
      >
        {bezig ? 'Bezig…' : `📹 Bel ${metWie}`}
      </button>

      {!heeftTurn() ? (
        <p className="mt-3 text-sm text-ink-faint">
          Er is nog geen TURN-server ingesteld. Op de meeste thuisnetwerken werkt het gesprek, op
          sommige mobiele netwerken niet. Zie <code>11_calls.sql</code> voor wat je daarvoor nodig
          hebt.
        </p>
      ) : null}

      {fout ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {fout}
        </p>
      ) : null}
    </section>
  )
}
