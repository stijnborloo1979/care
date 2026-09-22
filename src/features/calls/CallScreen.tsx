import { useEffect } from 'react'
import { endCall } from '../../services/calls'
import { useWebRTC } from './useWebRTC'
import { useRadio } from '../radio/radioStore'

/**
 * Tijdens het gesprek staat het beeld van de ander schermvullend en is er
 * één knop die telt: ophangen. Alles anders is kleiner en secundair.
 */
export default function CallScreen({
  callId,
  rol,
  metWie,
  onKlaar,
}: {
  callId: string
  rol: 'beller' | 'ontvanger'
  metWie: string
  onKlaar: () => void
}) {
  const {
    state,
    fout,
    lokaalRef,
    externRef,
    audioRef,
    geluidGeblokkeerd,
    externHeeftGeluid,
    zetGeluidAan,
    hangUp,
    microfoonAan,
    cameraAan,
    zetMicrofoon,
    zetCamera,
  } = useWebRTC(callId, rol)

  useEffect(() => {
    if (state === 'ended') onKlaar()
  }, [state, onKlaar])

  // Tijdens het gesprek geen muziek; daarna speelt de radio verder.
  useEffect(() => {
    useRadio.getState().pauzeerVoorGesprek()
    return () => useRadio.getState().hervatNaGesprek()
  }, [])

  async function stoppen() {
    hangUp()
    try {
      await endCall(callId)
    } catch {
      // Het gesprek is hoe dan ook voorbij voor wie hier zit.
    }
    onKlaar()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black"
      role="dialog"
      aria-modal="true"
      aria-label={`Videogesprek met ${metWie}`}
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={externRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full bg-black object-cover"
        />

        {state !== 'active' ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 px-6 text-center text-white">
            <p className="text-3xl font-extrabold">{metWie}</p>
            <p className="text-xl">
              {state === 'connecting'
                ? 'Verbinden…'
                : state === 'failed'
                  ? 'Het gesprek lukte niet'
                  : 'Even geduld…'}
            </p>
            {fout ? <p className="max-w-sm text-lg text-white/80">{fout}</p> : null}
          </div>
        ) : null}

        <audio ref={audioRef} autoPlay />

        {geluidGeblokkeerd && state === 'active' ? (
          <button
            onClick={zetGeluidAan}
            className="absolute inset-x-6 top-6 flex min-h-[4rem] items-center justify-center rounded-card bg-white text-xl font-bold text-black shadow-lift"
          >
            🔊 Tik hier voor geluid
          </button>
        ) : null}

        {state === 'active' && !externHeeftGeluid ? (
          <p className="absolute inset-x-6 top-6 rounded-card bg-black/70 p-4 text-center text-lg text-white">
            Er komt geen geluid van de andere kant. Staat daar de microfoon uit of geblokkeerd?
          </p>
        ) : null}

        {/* Het eigen beeld klein in de hoek: je moet kunnen zien dat je
            zelf in beeld bent, maar het mag niet afleiden. */}
        <video
          ref={lokaalRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-4 right-4 h-32 w-24 rounded-2xl border-2 border-white/40 object-cover"
        />
      </div>

      <div className="flex items-center justify-center gap-4 bg-black px-6 py-5">
        <button
          onClick={() => zetMicrofoon(!microfoonAan)}
          aria-pressed={!microfoonAan}
          aria-label={microfoonAan ? 'Microfoon uitzetten' : 'Microfoon aanzetten'}
          className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-2xl text-white"
        >
          {microfoonAan ? '🎤' : '🔇'}
        </button>

        <button
          onClick={stoppen}
          className="grid h-20 w-20 place-items-center rounded-full bg-[#A8442F] text-3xl text-white"
          aria-label="Ophangen"
        >
          📵
        </button>

        <button
          onClick={() => zetCamera(!cameraAan)}
          aria-pressed={!cameraAan}
          aria-label={cameraAan ? 'Camera uitzetten' : 'Camera aanzetten'}
          className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-2xl text-white"
        >
          {cameraAan ? '📹' : '🚫'}
        </button>
      </div>
    </div>
  )
}
