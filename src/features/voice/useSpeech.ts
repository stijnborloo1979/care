import { useCallback, useEffect, useRef, useState } from 'react'
import { useKioskBezig } from '../kiosk/kioskStore'
import { useRadio } from '../radio/radioStore'
import { locale, t } from '../../lib/i18n'
import { kanVoorlezen, stopVoorlezen, voorlezen } from '../../lib/voorlezen'

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
  if (!kanVoorlezen()) return
  // De radio even zachter, anders gaat de herinnering verloren in de muziek.
  const radio = useRadio.getState()
  radio.demp(true)
  voorlezen(tekst, { onEinde: () => radio.demp(false) })
}

export function useSpeech(onVraag: (tekst: string) => void) {
  const [luistert, setLuistert] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  useKioskBezig(luistert)
  const refVraag = useRef(onVraag)
  refVraag.current = onVraag

  const beschikbaar = herkennerKlasse() !== null

  const start = useCallback(() => {
    const Klasse = herkennerKlasse()
    if (!Klasse) {
      setFout(t('spraak.nietInBrowser'))
      return
    }
    setFout(null)
    try {
      const rec = new Klasse()
      rec.lang = locale()
      rec.interimResults = false
      rec.maxAlternatives = 1
      rec.onresult = (e) => refVraag.current(e.results[0][0].transcript)
      rec.onerror = () => setFout(t('spraak.nietGehoord'))
      rec.onend = () => setLuistert(false)
      rec.start()
      setLuistert(true)
    } catch {
      setFout(t('spraak.nietBeschikbaar'))
      setLuistert(false)
    }
  }, [])

  useEffect(() => {
    return () => stopVoorlezen()
  }, [])

  return { start, luistert, fout, beschikbaar }
}
