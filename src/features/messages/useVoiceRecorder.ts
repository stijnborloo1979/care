import { useCallback, useEffect, useRef, useState } from 'react'
import { useKioskBezig } from '../kiosk/kioskStore'

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'ready' | 'error'

export interface Recording {
  blob: Blob
  url: string
  seconds: number
  mimeType: string
}

const MAX_SECONDS = 60

/**
 * Kies een formaat dat de browser echt aankan. Safari op iPhone en iPad
 * ondersteunt geen webm en levert audio/mp4; alle andere browsers doen
 * opus in webm. Zonder deze controle werkt de knop op de iPad van Els
 * niet, zonder foutmelding.
 */
function pickMimeType(): string {
  const kandidaten = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ]
  for (const type of kandidaten) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return ''
}

export function extensionFor(mimeType: string): string {
  if (mimeType.includes('mp4')) return 'm4a'
  if (mimeType.includes('ogg')) return 'ogg'
  return 'webm'
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [seconds, setSeconds] = useState(0)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Tijdens het inspreken niet terug naar Vandaag springen.
  useKioskBezig(state === 'requesting' || state === 'recording')

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef<number | null>(null)
  const startedRef = useRef(0)

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
    }
  }, [])

  const start = useCallback(async () => {
    setError(null)

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setState('error')
      setError('Opnemen werkt niet in deze browser. Typ je bericht of gebruik een andere browser.')
      return
    }

    const mimeType = pickMimeType()
    setState('requesting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm'
        const blob = new Blob(chunksRef.current, { type })
        const duur = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000))
        stopTracks()
        setRecording({ blob, url: URL.createObjectURL(blob), seconds: duur, mimeType: type })
        setState('ready')
      }

      startedRef.current = Date.now()
      setSeconds(0)
      recorder.start()
      setState('recording')

      tickRef.current = window.setInterval(() => {
        const verstreken = Math.round((Date.now() - startedRef.current) / 1000)
        setSeconds(verstreken)
        // Zelf afkappen: een bericht van vijf minuten luistert niemand af,
        // en een vergeten opname loopt anders door tot de batterij leeg is.
        if (verstreken >= MAX_SECONDS) stop()
      }, 250)
    } catch (e) {
      stopTracks()
      setState('error')
      const naam = e instanceof DOMException ? e.name : ''
      if (naam === 'NotAllowedError') {
        setError('De microfoon is geblokkeerd. Zet hem aan in de instellingen van je browser.')
      } else if (naam === 'NotFoundError') {
        setError('Geen microfoon gevonden op dit toestel.')
      } else {
        setError('Opnemen lukte niet. Probeer het opnieuw.')
      }
    }
  }, [stop, stopTracks])

  const reset = useCallback(() => {
    if (recording) URL.revokeObjectURL(recording.url)
    setRecording(null)
    setSeconds(0)
    setState('idle')
    setError(null)
  }, [recording])

  useEffect(() => {
    return () => {
      stopTracks()
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    }
  }, [stopTracks])

  return { state, seconds, recording, error, start, stop, reset, maxSeconds: MAX_SECONDS }
}
