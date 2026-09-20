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
}: {
  path: string | null
  emoji?: string | null
  bucket?: string
  className?: string
  alt?: string
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

  return (
    <div
      className={`grid place-items-center overflow-hidden rounded-card bg-surface-deep ${className}`}
      style={{ aspectRatio: '4 / 3' }}
    >
      {url ? (
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <span className="text-5xl" aria-hidden="true">
          {emoji ?? '📦'}
        </span>
      )}
    </div>
  )
}
