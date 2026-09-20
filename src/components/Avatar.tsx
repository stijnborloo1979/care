import { useEffect, useState } from 'react'
import { signedUrl } from '../lib/storage'

function initialen(naam: string) {
  return naam
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('')
}

const MAAT = { s: 'h-12 w-12 text-base', m: 'h-16 w-16 text-xl', l: 'h-28 w-28 text-4xl' }

/** Foto als die er is, anders initialen op een eigen kleur. Nooit leeg. */
export default function Avatar({
  name,
  photoPath,
  color,
  size = 'm',
}: {
  name: string
  photoPath?: string | null
  color?: string | null
  size?: keyof typeof MAAT
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let weg = false
    if (!photoPath) {
      setUrl(null)
      return
    }
    signedUrl('avatars', photoPath)
      .then((u) => !weg && setUrl(u))
      .catch(() => !weg && setUrl(null))
    return () => {
      weg = true
    }
  }, [photoPath])

  return (
    <div
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white ${MAAT[size]}`}
      style={{ background: `linear-gradient(145deg, ${color ?? '#8A6A3B'}, rgba(0,0,0,.3))` }}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initialen(name)}
    </div>
  )
}
