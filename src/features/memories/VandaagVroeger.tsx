import { Link } from 'react-router-dom'
import StoragePhoto from '../../components/StoragePhoto'
import { localDateKey } from '../../lib/time'
import { usePhotos } from './usePhotos'
import { kiesHerinnering } from './vandaagVroeger'

/**
 * Elke dag één herinnering uit de eigen tijdlijn. Een foto om naar te
 * kijken, en een gespreksstarter voor wie vandaag langskomt.
 */
export default function VandaagVroeger({
  householdId,
  timezone,
  onVertel,
}: {
  householdId: string
  timezone: string
  /** Opent "Vertel eens" met een vraag over deze foto. */
  onVertel: (vraag: string) => void
}) {
  const { data } = usePhotos(householdId)
  const h = kiesHerinnering(data ?? [], localDateKey(new Date(), timezone))
  if (!h) return null

  const kop = h.verjaardag
    ? `Vandaag ${h.jarenGeleden} jaar geleden`
    : h.jarenGeleden
      ? `${h.jarenGeleden} jaar geleden`
      : 'Een herinnering'

  return (
    <section aria-labelledby="vroeger" className="overflow-hidden rounded-card bg-surface shadow-card">
      <Link to="/fotos" aria-label={`Foto: ${h.foto.title}`}>
        <StoragePhoto path={h.foto.photo_path} bucket="memories" emoji="📷" alt={h.foto.title} className="rounded-none" />
      </Link>
      <div className="p-5">
        <h2 id="vroeger" className="text-base font-bold text-ink-faint">
          {kop}
        </h2>
        <p className="mt-1 text-2xl font-bold tracking-tight">{h.foto.title}</p>
        {h.foto.story ? <p className="mt-1 text-lg text-ink-soft">{h.foto.story}</p> : null}
        <button
          onClick={() => onVertel(`Wat herinner je je van: ${h.foto.title}?`)}
          className="mt-4 min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
        >
          Vertel erover
        </button>
      </div>
    </section>
  )
}
