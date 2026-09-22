import { useEffect } from 'react'
import { KLEUR, useLicht } from './lichtStore'

/**
 * Het scherm als lamp: een warme gloed langs de randen die langzaam
 * aanzwelt en weer wegebt. Eén tik ergens op het scherm dooft hem.
 *
 * Bewust traag — een cyclus van vier seconden — en zacht van kleur. Snel
 * knipperend licht schrikt af en kan bij sommige mensen zelfs klachten
 * geven; dit hoort te voelen als "er is iets voor jou", niet als alarm.
 */
export default function Licht() {
  const { actief, stop } = useLicht()

  useEffect(() => {
    if (!actief) return
    const doof = () => stop()
    // Een tik dooft het licht, maar gaat gewoon door naar wat eronder zit.
    window.addEventListener('pointerdown', doof, { once: true, capture: true })
    return () => window.removeEventListener('pointerdown', doof, { capture: true })
  }, [actief, stop])

  if (!actief) return null

  return (
    <div
      aria-hidden="true"
      className="licht-gloed pointer-events-none fixed inset-0 z-[55]"
      style={{ ['--licht' as string]: KLEUR[actief] }}
    />
  )
}
