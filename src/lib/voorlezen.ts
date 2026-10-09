import { locale } from './i18n'

/**
 * Eén plek die voorleest, voor de hele app.
 *
 * Op een smartphone ging voorlezen vaak stil mis. De oorzaken, en wat we
 * eraan doen:
 *
 * - cancel() en meteen speak(): Chrome op Android en Safari op iOS gooien
 *   dan soms ook de nieuwe zin weg. We annuleren alleen als er iets bezig
 *   is, en spreken dan pas na een korte pauze.
 * - Alleen een taalcode (nl-BE) meegeven: heeft het toestel precies die
 *   stem niet, dan blijft het soms stil. We kiezen zelf een stem: eerst de
 *   juiste regio, anders dezelfde taal (nl-NL voor nl-BE).
 * - Een vastgelopen pauzestand (Chrome): resume() vóór het spreken.
 * - Lange teksten: Chrome breekt na ongeveer 15 seconden af. We lezen per
 *   zin voor.
 * - Chrome ruimt een uitspraak soms op voor ze klaar is; dan stopt ze
 *   halverwege. We houden ze vast tot ze klaar is.
 *
 * iOS laat de eerste uitspraak alleen toe tijdens een tik. Roep voorlezen()
 * dus rechtstreeks in een onClick aan, niet na een await.
 */

let vastgehouden: SpeechSynthesisUtterance[] = []

export function kanVoorlezen(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

const norm = (s: string) => s.replace('_', '-').toLowerCase()

/** De beste stem voor deze taal: precies de regio, anders dezelfde taal. */
export function stemVoor(lang: string, stemmen: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const doel = norm(lang)
  const taal = doel.slice(0, 2)
  const kandidaten = stemmen.filter((v) => norm(v.lang) === taal || norm(v.lang).startsWith(`${taal}-`))
  const voorkeur = (lijst: SpeechSynthesisVoice[]) => lijst.find((v) => v.localService) ?? lijst[0]
  return voorkeur(kandidaten.filter((v) => norm(v.lang) === doel)) ?? voorkeur(kandidaten)
}

/** Knipt een tekst in zinnen van hoogstens `max` tekens. */
export function zinnen(tekst: string, max = 180): string[] {
  // Geen lookbehind in deze regex: oudere iPads (iOS < 16.4) kennen dat niet,
  // en dan laadt de hele app niet.
  const ruw = tekst
    .split(/\n+/)
    .flatMap((regel) => regel.match(/[^.!?…]+[.!?…]*/g) ?? [])
    .map((z) => z.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const uit: string[] = []
  for (const z of ruw) {
    if (z.length <= max) {
      uit.push(z)
      continue
    }
    // Een heel lange zin: op komma's, en desnoods op spaties.
    let stuk = ''
    for (const woord of z.split(/\s+/)) {
      if (stuk && (stuk + ' ' + woord).length > max) {
        uit.push(stuk)
        stuk = woord
      } else {
        stuk = stuk ? `${stuk} ${woord}` : woord
      }
    }
    if (stuk) uit.push(stuk)
  }
  return uit
}

export interface VoorleesOpties {
  /** Tempo; de app spreekt rustig. */
  rate?: number
  /** Eén keer, als alles gezegd is, of als het niet lukte. */
  onEinde?: () => void
}

/**
 * Leest een tekst voor. Geeft false als het toestel niet kan voorlezen of
 * er niets te zeggen is (onEinde wordt dan meteen aangeroepen).
 */
export function voorlezen(tekst: string, { rate = 0.92, onEinde }: VoorleesOpties = {}): boolean {
  let klaar = false
  const einde = () => {
    if (klaar) return
    klaar = true
    onEinde?.()
  }

  const delen = zinnen(tekst ?? '')
  if (!kanVoorlezen() || delen.length === 0) {
    einde()
    return false
  }

  const synth = window.speechSynthesis
  const lang = locale()

  const spreek = () => {
    if (synth.paused) synth.resume()
    const stem = stemVoor(lang, synth.getVoices?.() ?? [])
    vastgehouden = delen.map((deel, i) => {
      const u = new SpeechSynthesisUtterance(deel)
      u.lang = stem?.lang ?? lang
      if (stem) u.voice = stem
      u.rate = rate
      if (i === delen.length - 1) u.onend = () => {
        vastgehouden = []
        einde()
      }
      u.onerror = einde
      return u
    })
    for (const u of vastgehouden) synth.speak(u)
  }

  if (synth.speaking || synth.pending) {
    synth.cancel()
    window.setTimeout(spreek, 120)
  } else {
    spreek()
  }
  return true
}

export function stopVoorlezen() {
  if (!kanVoorlezen()) return
  vastgehouden = []
  window.speechSynthesis.cancel()
}

// Stemmen worden traag geladen (vooral op Android); vraag ze al op, zodat
// ze er zijn bij de eerste tik.
if (kanVoorlezen()) {
  try {
    window.speechSynthesis.getVoices()
    window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices())
  } catch {
    // Geen probleem: dan kiest de browser zelf een stem.
  }
}
