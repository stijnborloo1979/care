import { Link } from 'react-router-dom'
import StoragePhoto from '../../components/StoragePhoto'
import { usePhotos } from './usePhotos'

/**
 * De ingang naar de fototijdlijn, als tegel op het dagscherm.
 *
 * "Vandaag vroeger" toont één foto die bij deze dag hoort, en verdwijnt op
 * dagen waar niets bij past. Dit blok staat er altijd zolang er foto's
 * zijn: één beeld om naar te kijken en een weg naar de rest. Zonder dit
 * was de tijdlijn voor haar alleen te bereiken op de dagen dat er toevallig
 * een herinnering was.
 *
 * De nieuwste foto, niet de oudste: die is het verst van vroeger en het
 * dichtst bij wat familie er laatst bij zette.
 */
export default function HerinneringenKaart({ householdId }: { householdId: string }) {
  const { data } = usePhotos(householdId)
  const fotos = (data ?? []).filter((f) => f.photo_path)
  if (fotos.length === 0) return null

  const nieuwste = fotos[fotos.length - 1]

  return (
    <section aria-labelledby="herinneringen" className="overflow-hidden rounded-card bg-surface shadow-card">
      <Link to="/fotos" aria-label={`Foto's bekijken, te beginnen bij ${nieuwste.title}`}>
        <StoragePhoto
          path={nieuwste.photo_path}
          bucket="memories"
          emoji="📷"
          alt={nieuwste.title}
          className="rounded-none"
        />
      </Link>

      <div className="p-5">
        <h2 id="herinneringen" className="text-base font-bold text-ink-faint">
          Herinneringen
        </h2>
        <p className="mt-1 text-2xl font-bold tracking-tight">{nieuwste.title}</p>
        {nieuwste.year ? <p className="mt-1 text-lg text-ink-soft">{nieuwste.year}</p> : null}

        <Link
          to="/fotos"
          className="mt-4 inline-flex min-h-touch items-center rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
        >
          {/* Het aantal erbij: dat maakt van een knop een belofte. */}
          Alle {fotos.length} foto's bekijken
        </Link>
      </div>
    </section>
  )
}
