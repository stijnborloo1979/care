import { useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'

type Herkenner = {
  lang: string
  interimResults: boolean
  continuous: boolean
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

/**
 * Het invulwerk is de echte drempel van dit product: niemand typt twaalf
 * handleidingen uit op een telefoon. Inspreken kost twintig seconden.
 *
 * De knop verschijnt alleen waar spraak werkt, zodat er nergens een dode
 * knop staat.
 */
export default function DictateButton({
  onTekst,
  label = 'Inspreken',
}: {
  onTekst: (tekst: string) => void
  label?: string
}) {
  const [luistert, setLuistert] = useState(false)
  const recRef = useRef<Herkenner | null>(null)

  if (!herkennerKlasse()) return null

  function start() {
    const Klasse = herkennerKlasse()
    if (!Klasse) return
    const rec = new Klasse()
    recRef.current = rec
    rec.lang = 'nl-BE'
    rec.interimResults = false
    rec.continuous = false
    rec.onresult = (e) => {
      const tekst = e.results[0][0].transcript.trim()
      // Eerste letter groot en een punt erachter: ingesproken tekst komt
      // zonder leestekens binnen, en dat leest slecht op het scherm van
      // de persoon.
      const net = tekst.charAt(0).toUpperCase() + tekst.slice(1)
      onTekst(/[.!?]$/.test(net) ? net : net + '.')
    }
    rec.onerror = () => setLuistert(false)
    rec.onend = () => setLuistert(false)
    rec.start()
    setLuistert(true)
  }

  function stop() {
    recRef.current?.stop()
    setLuistert(false)
  }

  return (
    <button
      type="button"
      onClick={luistert ? stop : start}
      aria-label={luistert ? 'Stoppen met inspreken' : label}
      title={label}
      className={`inline-flex min-h-[2.4rem] shrink-0 items-center gap-1.5 rounded-pill border-[1.5px] px-3 text-sm font-semibold ${
        luistert
          ? 'animate-pulse border-alert bg-alert-soft text-alert'
          : 'border-line-strong text-ink-soft'
      }`}
    >
      {luistert ? <Square size={16} strokeWidth={2} /> : <Mic size={16} strokeWidth={1.75} />}
      {luistert ? 'Stop' : label}
    </button>
  )
}
