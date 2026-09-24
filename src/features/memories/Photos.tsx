import { useState } from 'react'
import Icon from '../../components/Icon'
import { Link } from 'react-router-dom'
import StoragePhoto from '../../components/StoragePhoto'
import { useHousehold } from '../household/useHousehold'
import { usePhotos } from './usePhotos'
import Slideshow from './Slideshow'
import { t } from '../../lib/i18n'

export default function Photos() {
  const { household } = useHousehold()
  const { data: photos, isLoading } = usePhotos(household?.household_id ?? '')
  const [slide, setSlide] = useState<number | null>(null)

  const lijst = photos ?? []

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <Link to="/memory" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ {t('huis.titel')}
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">{t('fotos.titel')}</h1>
      <p className="mt-1 text-lg text-ink-soft">{t('fotos.uitleg')}</p>

      {isLoading ? <p className="mt-6 text-ink-soft">{t('watnu.laden')}</p> : null}

      {lijst.length > 0 ? (
        <>
          <button
            onClick={() => setSlide(0)}
            className="mt-6 flex min-h-[3.4rem] w-full items-center justify-center gap-2 rounded-pill bg-accent-ink text-lg font-semibold text-white shadow-lift"
          >
            <Icon naam="afspelen" size={20} />
            {t('fotos.rustig')}
          </button>

          <ol className="mt-6 space-y-4">
            {lijst.map((p, i) => (
              <li key={p.id}>
                <button
                  onClick={() => setSlide(i)}
                  className="flex w-full items-start gap-4 rounded-card border border-line bg-surface p-4 text-left shadow-card"
                >
                  <span className="w-28 shrink-0">
                    <StoragePhoto
                      path={p.photo_path}
                      bucket="memories"
                      emoji="📷"
                      alt={p.title}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="inline-block rounded-pill border border-line bg-surface-soft px-3 py-0.5 text-sm font-semibold text-ink-soft">
                      {p.year ?? 'vroeger'}
                    </span>
                    <span className="mt-1 block text-lg font-bold">{p.title}</span>
                    {p.story ? (
                      <span className="mt-1 block text-ink-soft">{p.story}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : !isLoading ? (
        <div className="mt-6 rounded-card border-[1.5px] border-dashed border-line-strong bg-surface-soft p-8 text-center text-ink-soft">
          {t('fotos.leeg')}
          <span className="mt-1 block text-sm">{t('huis.familieVoegtToe')}</span>
        </div>
      ) : null}

      {slide !== null ? (
        <Slideshow photos={lijst} start={slide} onClose={() => setSlide(null)} />
      ) : null}
    </main>
  )
}
