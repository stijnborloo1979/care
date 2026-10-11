import logoMark from '../assets/logo-mark.png'
import logoFull from '../assets/logo-full.png'

/**
 * Het LifeAngle-symbool. Het bestand heeft een transparante achtergrond,
 * dus het past op elke kleur die de app gebruikt. Met `volledig` komt de
 * naam en de slogan erbij (alleen waar daar ruimte voor is, zoals het
 * inlogscherm).
 */
export default function Logo({
  volledig = false,
  className = '',
}: {
  volledig?: boolean
  className?: string
}) {
  if (volledig) {
    return (
      <img
        src={logoFull}
        alt="LifeAngle"
        className={className}
        width={810}
        height={550}
        decoding="async"
      />
    )
  }
  return (
    <img
      src={logoMark}
      alt="LifeAngle"
      className={className}
      width={380}
      height={352}
      decoding="async"
    />
  )
}
