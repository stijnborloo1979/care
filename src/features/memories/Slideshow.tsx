import { useEffect, useState } from 'react'
import StoragePhoto from '../../components/StoragePhoto'
import type { MemoryPhoto } from '../../services/memories'

/**
 * Rustige modus: één herinnering per scherm, twee knoppen, geen tijdslimiet.
 * Automatisch doorschuiven staat er bewust niet in — dan leest niemand het
 * verhaal uit, en juist daarover wil de persoon praten.
 */
export default function Slideshow({
  photos,
  start = 0,
  onClose,
}: {
  photos: MemoryPhoto[]
  start?: number
  onClose: () => void
}) {
  const [i, setI] = useState(start)
  const foto = photos[i]

  useEffect(() => {
    function toets(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, photos.length - 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0))
    }
    window.addEventListener('keydown', toets)
    return () => window.removeEventListener('keydown', toets)
  }, [photos.length, onClose])

  useEffect(() => {
    if (!foto || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(
      [foto.year ? String(foto.year) : '', foto.title, foto.story ?? ''].filter(Boolean).join('. '),
    )
    u.lang = 'nl-BE'
    u.rate = 0.9
    window.speechSynthesis.speak(u)
    return () => window.speechSynthesis.cancel()
  }, [foto])

  if (!foto) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Herinneringen bekijken"
      className="fixed inset-0 z-50 overflow-y-auto bg-bg"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      <div className="mx-auto max-w-[36rem] px-5 py-6">
        <button
          onClick={onClose}
          className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
        >
          Sluiten
        </button>

        <div className="mt-5">
          <StoragePhoto path={foto.photo_path} bucket="memories" emoji="📷" alt={foto.title} />
        </div>

        <p className="mt-5 text-4xl font-extrabold tracking-tight">{foto.year ?? ''}</p>
        <h2 className="mt-1 text-2xl font-bold">{foto.title}</h2>
        {foto.story ? <p className="mt-3 text-xl leading-snug text-ink-soft">{foto.story}</p> : null}

        <div className="mt-7 flex gap-3">
          <button
            onClick={() => setI(Math.max(0, i - 1))}
            disabled={i === 0}
            className="min-h-[3.4rem] flex-1 rounded-pill border-[1.5px] border-line-strong text-lg font-semibold disabled:opacity-40"
          >
            ‹ Vorige
          </button>
          <button
            onClick={() => (i < photos.length - 1 ? setI(i + 1) : onClose())}
            className="min-h-[3.4rem] flex-1 rounded-pill bg-accent-ink text-lg font-semibold text-white"
          >
            {i < photos.length - 1 ? 'Volgende ›' : 'Klaar'}
          </button>
        </div>

        <p className="mt-4 text-center text-ink-faint">
          {i + 1} van {photos.length}
        </p>
      </div>
    </div>
  )
}
