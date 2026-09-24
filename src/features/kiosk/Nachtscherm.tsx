import { useEffect, useState } from 'react'
import { hhmm } from '../../lib/time'
import { omschrijving } from './dagdeel'
import { t } from '../../lib/i18n'

/**
 * 's Nachts: alleen wat iemand nodig heeft die wakker wordt en niet weet
 * hoe laat het is. Donker, groot, rustig. Eén tik toont het gewone scherm.
 *
 * Altijd zwart, ook in het lichte thema: een wit scherm verlicht de hele
 * kamer. Het blok schuift elk uur een paar pixels op, zodat er op een
 * scherm dat jaren aanstaat geen klok inbrandt.
 */
export default function Nachtscherm({ tz, onWek }: { tz: string; onWek: () => void }) {
  const [nu, setNu] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => setNu(new Date()), 20_000)
    return () => window.clearInterval(id)
  }, [])

  const { titel, onder } = omschrijving(nu, tz)
  const uur = nu.getHours()
  const x = ((uur * 7) % 5) * 6 - 12
  const y = ((uur * 3) % 5) * 6 - 12

  return (
    <button
      type="button"
      onClick={onWek}
      aria-label={`${titel}, ${hhmm(nu, tz)}. ${t('nacht.tik')}`}
      className="fixed inset-0 z-50 flex cursor-default items-center justify-center bg-black text-center"
      style={{ color: 'rgb(150, 136, 116)' }}
    >
      <div style={{ transform: `translate(${x}px, ${y}px)` }}>
        <p className="text-3xl font-semibold sm:text-4xl">{titel}</p>
        <p className="mt-2 text-[7rem] font-bold leading-none tracking-tight tabular-nums sm:text-[10rem]">
          {hhmm(nu, tz)}
        </p>
        <p className="mt-4 text-2xl" style={{ color: 'rgb(105, 95, 82)' }}>
          {onder}
        </p>
      </div>
    </button>
  )
}
