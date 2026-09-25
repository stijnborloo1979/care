import { useEffect, useState } from 'react'
import { signedUrl } from '../lib/storage'

/**
 * Buckets zijn privé, dus elke foto heeft een tijdelijke link nodig.
 * Zonder foto vult een emoji de plaats: een leeg grijs vlak zegt niets.
 */
export default function StoragePhoto({
  path,
  emoji,
  bucket = 'home-memory',
  className = '',
  alt = '',
  passend = false,
}: {
  path: string | null
  emoji?: string | null
  bucket?: string
  className?: string
  alt?: string
  /**
   * Heel de foto tonen in plaats van het vlak te vullen.
   *
   * Standaard wordt bijgesneden: dat staat strak en bij een foto die je
   * toch herkent, mis je niets. Maar wie een kamer met een telefoon
   * fotografeert, doet dat staand — en dan verdwijnt bij bijsnijden de
   * boven- en onderkant, precies het stuk waaraan je de kamer herkent.
   * Daar is een randje langs de zijkant het kleinere kwaad.
   */
  passend?: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let weg = false
    if (!path) {
      setUrl(null)
      return
    }
    signedUrl(bucket, path)
      .then((u) => {
        if (!weg) setUrl(u)
      })
      .catch(() => {
        if (!weg) setUrl(null)
      })
    return () => {
      weg = true
    }
  }, [path, bucket])

  // De foto ligt absoluut in het vlak, niet als roosteritem.
  //
  // Dat was een echte fout: in een grid met place-items-center wordt een
  // item niet uitgerekt, dus h-full deed niets. De foto kreeg de breedte
  // van het vlak en daarna zijn eigen hoogte, en wat er onderuit stak werd
  // weggeknipt. Een staande foto — en zo fotografeert iedereen met een
  // telefoon — verloor zo boven- en onderkant. Ze leek ingezoomd terwijl
  // ze gewoon afgesneden was, en object-fit kon er niets aan doen omdat
  // het vlak nooit de maat gaf.
  return (
    <div
      className={`relative overflow-hidden rounded-card bg-surface-deep ${className}`}
      style={{ aspectRatio: '4 / 3' }}
    >
      {url ? (
        <img
          src={url}
          alt={alt}
          className={`absolute inset-0 h-full w-full ${passend ? 'object-contain' : 'object-cover'}`}
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-5xl" aria-hidden="true">
          {emoji ?? '📦'}
        </span>
      )}
    </div>
  )
}
