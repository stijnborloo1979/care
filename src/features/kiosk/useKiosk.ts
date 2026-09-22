import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isNacht, uurIn } from './dagdeel'
import { useKioskStore } from './kioskStore'
import { nachtHelderheid, schermAan } from './fully'
import { useLicht } from '../licht/lichtStore'

interface Opties {
  actief: boolean
  tz: string
  /** Minuten zonder aanraking voor we terugkeren naar Vandaag. */
  terugNa: number
  nachtVan: number
  nachtTot: number
}

// Schermen die de persoon rustig bekijkt zonder te tikken. Daar niet
// wegspringen: een diavoorstelling hoort door te lopen.
const RUSTIG = ['/fotos']

// Wie 's nachts het scherm aantikt, krijgt even het gewone scherm. Zolang.
const NACHT_WAKKER_MS = 60_000

const TIK_MS = 15_000

/**
 * De kioskmodus voor de vaste tablet:
 * - na een paar minuten zonder aanraking terug naar Vandaag, bovenaan;
 * - 's nachts een rustige klok in plaats van het gewone scherm;
 * - met Fully Kiosk ook de echte helderheid omlaag en het scherm aan bij
 *   een melding.
 *
 * Niets hiervan onderbreekt een gesprek, een opname of de spraakherkenning.
 */
export function useKiosk({ actief, tz, terugNa, nachtVan, nachtTot }: Opties) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const bezig = useKioskStore((s) => s.bezig > 0)
  const laatste = useRef(Date.now())
  const teruggezet = useRef(false)
  const [nu, setNu] = useState(() => Date.now())
  const [wakker, setWakker] = useState(false)

  // Elke aanraking telt als activiteit. In de capture-fase, zodat ook een
  // tik die ergens anders wordt tegengehouden meetelt.
  useEffect(() => {
    if (!actief) return
    const raak = () => {
      laatste.current = Date.now()
      teruggezet.current = false
      setNu(Date.now())
    }
    const soorten = ['pointerdown', 'keydown', 'wheel'] as const
    soorten.forEach((s) => window.addEventListener(s, raak, { capture: true, passive: true }))
    return () => soorten.forEach((s) => window.removeEventListener(s, raak, { capture: true }))
  }, [actief])

  useEffect(() => {
    if (!actief) return
    const id = window.setInterval(() => setNu(Date.now()), TIK_MS)
    return () => window.clearInterval(id)
  }, [actief])

  const stil = nu - laatste.current
  const nacht = actief && isNacht(uurIn(new Date(nu), tz), nachtVan, nachtTot)

  // Terug naar Vandaag, één keer per periode van stilte.
  useEffect(() => {
    if (!actief || bezig || teruggezet.current) return
    if (stil < terugNa * 60_000) return
    if (RUSTIG.some((p) => pathname.startsWith(p))) return
    teruggezet.current = true
    if (pathname !== '/' && pathname !== '/persoon') navigate('/', { replace: true })
    window.scrollTo({ top: 0 })
  }, [actief, bezig, stil, terugNa, pathname, navigate])

  // Na het wekken is het scherm een minuut gewoon zichtbaar, daarna
  // komt de klok terug.
  useEffect(() => {
    if (wakker && stil >= NACHT_WAKKER_MS) setWakker(false)
  }, [wakker, stil])

  const nachtscherm = nacht && !bezig && !wakker && stil >= NACHT_WAKKER_MS

  useEffect(() => {
    if (!actief) return
    nachtHelderheid(nachtscherm)
  }, [actief, nachtscherm])

  // Weer helder als de kioskmodus uitgaat of de app sluit.
  useEffect(() => {
    if (!actief) return
    return () => nachtHelderheid(false)
  }, [actief])

  // Met Fully gaat het scherm aan bij een melding, ook als het toestel sliep.
  useEffect(() => {
    if (!actief) return
    return useLicht.getState().voegUitgangToe((s) => {
      if (s) schermAan()
    })
  }, [actief])

  const wek = useCallback(() => {
    laatste.current = Date.now()
    setWakker(true)
    setNu(Date.now())
  }, [])

  return { nachtscherm, wek }
}
