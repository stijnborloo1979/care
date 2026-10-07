import { useEffect } from 'react'
import { endCall } from '../../services/calls'
import { useWebRTC } from './useWebRTC'
import { useRadio } from '../radio/radioStore'
import { useKioskBezig } from '../kiosk/kioskStore'
import { t } from '../../lib/i18n'

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

  // Een gesprek zonder aanraking is een gewoon gesprek: de kiosk blijft eraf.
  useKioskBezig(true)

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
      aria-label={t('oproep.metWie', { naam: metWie })}
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
                ? t('oproep.verbinden')
                : state === 'declined'
                  ? t('oproep.geweigerd', { naam: metWie })
                  : state === 'missed'
                    ? t('oproep.gemist', { naam: metWie })
                    : state === 'failed'
                      ? t('oproep.mislukt')
                      : t('oproep.verbinden')}
            </p>

            {/* Bij weigeren of niet opnemen geen technische uitleg: er is
                niets kapot, er is gewoon niet opgenomen. */}
            {state === 'declined' ? (
              <p className="max-w-sm text-lg text-white/80">
                {t('oproep.nuNiet')}
              </p>
            ) : state === 'missed' ? (
              <p className="max-w-sm text-lg text-white/80">
                {t('oproep.niemand')}
              </p>
            ) : fout ? (
              <p className="max-w-sm text-lg text-white/80">{fout}</p>
            ) : null}
          </div>
        ) : null}

        <audio ref={audioRef} autoPlay />

        {geluidGeblokkeerd && state === 'active' ? (
          <button
            onClick={zetGeluidAan}
            className="absolute inset-x-6 top-6 flex min-h-[4rem] items-center justify-center rounded-card bg-white text-xl font-bold text-black shadow-lift"
          >
            {t('oproep.tikGeluid')}
          </button>
        ) : null}

        {state === 'active' && !externHeeftGeluid ? (
          <p className="absolute inset-x-6 top-6 rounded-card bg-black/70 p-4 text-center text-lg text-white">
            {t('oproep.geenGeluid')}
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
          aria-label={microfoonAan ? t('oproep.micUit') : t('oproep.micAan')}
          className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-2xl text-white"
        >
          {microfoonAan ? '🎤' : '🔇'}
        </button>

        <button
          onClick={stoppen}
          className="grid h-20 w-20 place-items-center rounded-full bg-[#B03A2E] text-3xl text-white"
          aria-label={t('oproep.ophangen')}
        >
          📵
        </button>

        <button
          onClick={() => zetCamera(!cameraAan)}
          aria-pressed={!cameraAan}
          aria-label={cameraAan ? t('oproep.camUit') : t('oproep.camAan')}
          className="grid h-14 w-14 place-items-center rounded-full bg-white/15 text-2xl text-white"
        >
          {cameraAan ? '📹' : '🚫'}
        </button>
      </div>
    </div>
  )
}
