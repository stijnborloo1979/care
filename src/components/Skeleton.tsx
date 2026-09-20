/**
 * Een vorm die lijkt op wat er komt, in plaats van de tekst "Bezig met
 * laden". Dat oogt rustiger en het scherm springt minder wanneer de
 * gegevens binnenkomen.
 */
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-card ${className}`} aria-hidden="true" />
}

export function SkeletonTekst({ regels = 3 }: { regels?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: regels }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-4 rounded-pill"
          style={{ width: `${100 - i * 15}%` }}
        />
      ))}
    </div>
  )
}
