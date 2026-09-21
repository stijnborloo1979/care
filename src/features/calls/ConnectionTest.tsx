import { useState } from 'react'
import { GEEN_TURN, ijsservers } from './useWebRTC'

type Uitslag = {
  servers: number
  turnGeleverd: boolean
  lokaal: boolean
  stun: boolean
  turn: boolean
}

/**
 * Test wat dit toestel kan, zonder iemand te bellen. Dat maakt van
 * "het werkt niet" een concreet antwoord:
 *
 *   lokaal  werkt alleen op hetzelfde wifi
 *   STUN    werkt ook tussen twee verschillende wifi-netwerken
 *   TURN    werkt ook op 4G en 5G
 */
export default function ConnectionTest() {
  const [bezig, setBezig] = useState(false)
  const [uitslag, setUitslag] = useState<Uitslag | null>(null)

  async function test() {
    setBezig(true)
    setUitslag(null)
    // Opnieuw proberen, ook als TURN eerder deze sessie niet werkte.
    sessionStorage.removeItem(GEEN_TURN)

    const servers = await ijsservers()
    const turnGeleverd = servers.some((s) =>
      (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => String(u).startsWith('turn')),
    )

    const pc = new RTCPeerConnection({ iceServers: servers })
    pc.createDataChannel('test')
    const soorten = new Set<string>()
    pc.onicecandidate = (e) => {
      const c = e.candidate?.candidate
      if (!c) return
      if (c.includes(' typ host')) soorten.add('host')
      if (c.includes(' typ srflx')) soorten.add('srflx')
      if (c.includes(' typ relay')) soorten.add('relay')
    }
    await pc.setLocalDescription(await pc.createOffer())
    await new Promise((r) => setTimeout(r, 6000))
    pc.close()

    setUitslag({
      servers: servers.length,
      turnGeleverd,
      lokaal: soorten.has('host'),
      stun: soorten.has('srflx'),
      turn: soorten.has('relay'),
    })
    setBezig(false)
  }

  const Rij = ({ ok, tekst, uitleg }: { ok: boolean; tekst: string; uitleg: string }) => (
    <li className="flex items-start gap-3">
      <span className={`mt-0.5 font-bold ${ok ? 'text-ok' : 'text-alert'}`}>{ok ? '✓' : '✗'}</span>
      <span>
        <span className="block font-semibold">{tekst}</span>
        <span className="text-sm text-ink-soft">{uitleg}</span>
      </span>
    </li>
  )

  return (
    <div className="mt-4 rounded-2xl bg-surface-soft p-4">
      <button
        onClick={test}
        disabled={bezig}
        className="min-h-[2.6rem] rounded-pill border-[1.5px] border-line-strong bg-surface px-4 text-sm font-semibold disabled:opacity-60"
      >
        {bezig ? 'Bezig met testen… (6 sec)' : 'Verbinding testen'}
      </button>

      {uitslag ? (
        <ul className="mt-4 space-y-3">
          <Rij
            ok={uitslag.lokaal}
            tekst="Lokaal netwerk"
            uitleg="Nodig om überhaupt te bellen. Mislukt dit, dan blokkeert de browser camera of netwerk."
          />
          <Rij
            ok={uitslag.stun}
            tekst="STUN — tussen verschillende netwerken"
            uitleg="Werkt dit, dan lukt bellen tussen twee wifi-netwerken."
          />
          <Rij
            ok={uitslag.turnGeleverd}
            tekst="TURN-gegevens ontvangen"
            uitleg={
              uitslag.turnGeleverd
                ? 'De edge function turn-credentials gaf gegevens terug.'
                : 'De edge function turn-credentials bestaat niet, of de secrets CF_TURN_KEY_ID en CF_TURN_API_TOKEN kloppen niet.'
            }
          />
          <Rij
            ok={uitslag.turn}
            tekst="TURN — ook op 4G en 5G"
            uitleg={
              uitslag.turn
                ? 'Alles in orde: bellen hoort nu ook op mobiel internet te werken.'
                : uitslag.turnGeleverd
                  ? 'Gegevens ontvangen, maar de TURN-server antwoordt niet. Controleer het token bij Cloudflare.'
                  : 'Zonder TURN-gegevens kan dit niet lukken.'
            }
          />
        </ul>
      ) : null}
    </div>
  )
}
