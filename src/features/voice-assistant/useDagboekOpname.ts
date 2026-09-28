import { useCallback, useEffect, useRef, useState } from 'react'
import { locale } from '../../lib/i18n'
import { useKioskBezig } from '../kiosk/kioskStore'
import { herkennerKlasse, kiesMimeType, transcribeer, type Herkenner } from './spraak'

const MAX_SECONDEN = 5 * 60

export interface DagboekOpname {
  blob: Blob
  mimeType: string
  seconden: number
  transcript: string
}

/**
 * Neemt het verhaal op in de eigen stem. De opname is het belangrijkste:
 * familie wil later de stem horen, niet alleen de tekst lezen.
 *
 * De tekst komt, waar het kan, van de spraakherkenning die tegelijk
 * meeluistert. Lukt dat niet (sommige Android-toestellen geven de
 * microfoon maar aan één van beide), dan probeert de edge function
 * `voice-transcribe` het achteraf. Lukt ook dat niet, dan wordt de opname
 * bewaard zonder tekst.
 */
export function useDagboekOpname() {
  const [neemtOp, setNeemtOp] = useState(false)
  const [seconden, setSeconden] = useState(0)
  const [fout, setFout] = useState<string | null>(null)
  useKioskBezig(neemtOp)

  const recRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const herkennerRef = useRef<Herkenner | null>(null)
  const stukkenRef = useRef<Blob[]>([])
  const tekstRef = useRef('')
  const startRef = useRef(0)
  const tikRef = useRef<number | null>(null)
  const klaarRef = useRef<((o: DagboekOpname | null) => void) | null>(null)

  const opruimen = useCallback(() => {
    if (tikRef.current !== null) window.clearInterval(tikRef.current)
    tikRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    try {
      herkennerRef.current?.abort()
    } catch {
      /* al gestopt */
    }
    herkennerRef.current = null
    setNeemtOp(false)
  }, [])

  useEffect(() => opruimen, [opruimen])

  /** Start de opname. De belofte lost op wanneer stop() geroepen wordt. */
  const start = useCallback(async (): Promise<DagboekOpname | null> => {
    setFout(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setFout('Ik mag de microfoon niet gebruiken.')
      return null
    }
    streamRef.current = stream
    const mimeType = kiesMimeType()
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recRef.current = rec
    stukkenRef.current = []
    tekstRef.current = ''
    rec.ondataavailable = (e) => e.data.size && stukkenRef.current.push(e.data)

    // Meeluisteren voor de tekst, als de browser dat kan.
    const Klasse = herkennerKlasse()
    if (Klasse) {
      try {
        const h = new Klasse()
        h.lang = locale()
        h.continuous = true
        h.interimResults = false
        h.maxAlternatives = 1
        h.onresult = (e) => {
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) tekstRef.current += ' ' + e.results[i][0].transcript
          }
        }
        h.onerror = () => {}
        // Chrome stopt na een stilte; zolang we opnemen, opnieuw starten.
        h.onend = () => {
          if (recRef.current?.state === 'recording' && herkennerRef.current === h) {
            try {
              h.start()
            } catch {
              /* laat maar */
            }
          }
        }
        h.start()
        herkennerRef.current = h
      } catch {
        herkennerRef.current = null
      }
    }

    const resultaat = new Promise<DagboekOpname | null>((resolve) => {
      klaarRef.current = resolve
    })

    rec.onstop = async () => {
      const dur = Math.max(1, Math.round((Date.now() - startRef.current) / 1000))
      const blob = new Blob(stukkenRef.current, { type: rec.mimeType || mimeType })
      opruimen()
      let transcript = tekstRef.current.replace(/\s+/g, ' ').trim()
      if (!transcript) transcript = (await transcribeer(blob)) ?? ''
      klaarRef.current?.(blob.size ? { blob, mimeType: blob.type || mimeType, seconden: dur, transcript } : null)
      klaarRef.current = null
    }

    rec.start(1000)
    startRef.current = Date.now()
    setSeconden(0)
    setNeemtOp(true)
    tikRef.current = window.setInterval(() => {
      const s = Math.round((Date.now() - startRef.current) / 1000)
      setSeconden(s)
      if (s >= MAX_SECONDEN && rec.state === 'recording') rec.stop()
    }, 500)

    return resultaat
  }, [opruimen])

  const stop = useCallback(() => {
    try {
      herkennerRef.current?.stop()
    } catch {
      /* al gestopt */
    }
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
  }, [])

  const annuleer = useCallback(() => {
    klaarRef.current?.(null)
    klaarRef.current = null
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null
      rec.stop()
    }
    opruimen()
  }, [opruimen])

  return { start, stop, annuleer, neemtOp, seconden, fout, maxSeconden: MAX_SECONDEN }
}
