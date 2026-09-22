import { useCallback, useEffect, useRef, useState } from 'react'
import { useRadio } from '../radio/radioStore'

type Herkenner = {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  onresult: ((e: { results: { 0: { 0: { transcript: string } } } }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
}

function herkennerKlasse(): (new () => Herkenner) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => Herkenner
    webkitSpeechRecognition?: new () => Herkenner
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function spreek(tekst: string) {
  if (!('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(tekst)
  u.lang = 'nl-BE'
  u.rate = 0.92
  // De radio even zachter, anders gaat de herinnering verloren in de muziek.
  const radio = useRadio.getState()
  radio.demp(true)
  u.onend = () => radio.demp(false)
  u.onerror = () => radio.demp(false)
  window.speechSynthesis.speak(u)
}

export function useSpeech(onVraag: (tekst: string) => void) {
  const [luistert, setLuistert] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const refVraag = useRef(onVraag)
  refVraag.current = onVraag

  const beschikbaar = herkennerKlasse() !== null

  const start = useCallback(() => {
    const Klasse = herkennerKlasse()
    if (!Klasse) {
      setFout('Spraak werkt niet in deze browser. Tik een vraag aan.')
      return
    }
    setFout(null)
    try {
      const rec = new Klasse()
      rec.lang = 'nl-BE'
      rec.interimResults = false
      rec.maxAlternatives = 1
      rec.onresult = (e) => refVraag.current(e.results[0][0].transcript)
      rec.onerror = () => setFout('Ik heb je niet goed gehoord. Probeer opnieuw.')
      rec.onend = () => setLuistert(false)
      rec.start()
      setLuistert(true)
    } catch {
      setFout('Spraak is hier niet beschikbaar. Tik een vraag aan.')
      setLuistert(false)
    }
  }, [])

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    }
  }, [])

  return { start, luistert, fout, beschikbaar }
}
