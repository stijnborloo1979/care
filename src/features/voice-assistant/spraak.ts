/**
 * Speech-to-Text en Text-to-Speech voor LifeAngle Voice.
 *
 * STT: eerst de spraakherkenning van de browser (Chrome, Edge, Safari).
 * Heeft de browser die niet (Firefox), dan nemen we een kort fragment op
 * en laat de edge function `voice-transcribe` het uitschrijven — als die
 * geïnstalleerd is. Geen van beide: dan typt de gebruiker.
 *
 * TTS: de stem van het toestel. zeg() wacht tot de zin uitgesproken is,
 * zodat de microfoon pas daarna weer luistert en LifeAngle zichzelf niet
 * hoort.
 */

import { supabase } from '../../lib/supabase'
import { locale } from '../../lib/i18n'
import { uitspraak } from '../../lib/uitspraak'
import { useRadio } from '../radio/radioStore'
import { huidigePrefs } from '../settings/useDisplayPrefs'

// ---------------------------------------------------------------------
//  Spraakherkenning van de browser
// ---------------------------------------------------------------------

interface Resultaat {
  isFinal: boolean
  0: { transcript: string }
}

export interface Herkenner {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: { resultIndex: number; results: ArrayLike<Resultaat> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

export function herkennerKlasse(): (new () => Herkenner) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: new () => Herkenner
    webkitSpeechRecognition?: new () => Herkenner
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function kanOpnemen(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices
}

export type SttFout = 'geweigerd' | 'niet-beschikbaar' | 'fout'

export class SpraakFout extends Error {
  constructor(public soort: SttFout) {
    super(soort)
  }
}

export interface Luisteren {
  /** De uitgeschreven zin; '' als er niets verstaan werd. */
  klaar: Promise<string>
  stop(): void
}

/**
 * Eén zin beluisteren. Stopt vanzelf na een stilte (browser) of na
 * `maxSeconden` (opname).
 */
export function luister(maxSeconden = 10): Luisteren {
  const Klasse = herkennerKlasse()
  if (Klasse) return luisterBrowser(Klasse)
  if (kanOpnemen()) return luisterViaOpname(maxSeconden)
  return { klaar: Promise.reject(new SpraakFout('niet-beschikbaar')), stop() {} }
}

function luisterBrowser(Klasse: new () => Herkenner): Luisteren {
  const rec = new Klasse()
  rec.lang = locale()
  rec.interimResults = false
  rec.continuous = false
  rec.maxAlternatives = 1
  let tekst = ''
  let fout: SpraakFout | null = null

  const klaar = new Promise<string>((resolve, reject) => {
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) tekst += e.results[i][0].transcript
    }
    rec.onerror = (e) => {
      // Stilte is geen fout: dan is er gewoon niets verstaan.
      if (e.error === 'no-speech' || e.error === 'aborted') return
      fout = new SpraakFout(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'geweigerd' : 'fout')
    }
    rec.onend = () => (fout ? reject(fout) : resolve(tekst.trim()))
    try {
      rec.start()
    } catch {
      reject(new SpraakFout('fout'))
    }
  })
  return { klaar, stop: () => rec.stop() }
}

export function kiesMimeType(): string {
  for (const type of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

function luisterViaOpname(maxSeconden: number): Luisteren {
  let stopper: (() => void) | null = null
  const klaar = (async () => {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      throw new SpraakFout('geweigerd')
    }
    const mimeType = kiesMimeType()
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const stukken: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && stukken.push(e.data)
    const gestopt = new Promise<void>((r) => (rec.onstop = () => r()))
    rec.start()
    const id = window.setTimeout(() => rec.state !== 'inactive' && rec.stop(), maxSeconden * 1000)
    stopper = () => rec.state !== 'inactive' && rec.stop()
    await gestopt
    window.clearTimeout(id)
    stream.getTracks().forEach((t) => t.stop())
    const blob = new Blob(stukken, { type: rec.mimeType || mimeType })
    const tekst = await transcribeer(blob)
    if (tekst === null) throw new SpraakFout('niet-beschikbaar')
    return tekst
  })()
  return { klaar, stop: () => stopper?.() }
}

/**
 * Een opname laten uitschrijven door de edge function `voice-transcribe`.
 * Geeft null als die er niet is of faalt — dan blijft de opname gewoon
 * bewaard, alleen zonder tekst.
 */
export async function transcribeer(blob: Blob): Promise<string | null> {
  if (!blob.size) return ''
  try {
    const form = new FormData()
    form.append('audio', blob, `opname.${blob.type.includes('mp4') ? 'm4a' : 'webm'}`)
    form.append('taal', locale().slice(0, 2))
    const { data, error } = await supabase.functions.invoke('voice-transcribe', { body: form })
    if (error || typeof data?.tekst !== 'string') return null
    return data.tekst.trim()
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------
//  Uitspreken
// ---------------------------------------------------------------------

/** Spreekt een zin uit en wacht tot hij klaar is. Stil als de stem uit staat. */
export function zeg(tekst: string): Promise<void> {
  if (!tekst || !huidigePrefs().voice || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(uitspraak(tekst, locale()))
    u.lang = locale()
    // Rustig tempo, zoals de rest van de app.
    u.rate = 0.92
    const radio = useRadio.getState()
    radio.demp(true)
    let klaar = false
    const einde = () => {
      if (klaar) return
      klaar = true
      radio.demp(false)
      resolve()
    }
    u.onend = einde
    u.onerror = einde
    // Sommige browsers vergeten onend; dan niet eeuwig wachten.
    window.setTimeout(einde, 2000 + tekst.length * 90)
    window.speechSynthesis.speak(u)
  })
}

export function zwijg() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
}
