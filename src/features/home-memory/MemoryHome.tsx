import { Link } from 'react-router-dom'
import RoomGrid from './RoomGrid'
import { t } from '../../lib/i18n'

export default function MemoryHome() {
  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <Link to="/" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ Vandaag
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">{t('huis.titel')}</h1>
      <p className="mt-1 text-lg text-ink-soft">{t('huis.uitleg')}</p>

      <div className="mt-6">
        <RoomGrid />
      </div>

      <Link
        to="/fotos"
        className="mt-6 flex min-h-[5rem] items-center gap-4 rounded-card border-[1.5px] border-line-strong bg-surface px-5 text-xl font-bold shadow-card"
      >
        <span className="text-3xl" aria-hidden="true">
          📷
        </span>
        {t('fotos.titel')}
      </Link>

      <Link
        to="/weetjes"
        className="mt-3 flex min-h-[5rem] items-center gap-4 rounded-card border-[1.5px] border-line-strong bg-surface px-5 text-xl font-bold shadow-card"
      >
        <span className="text-3xl" aria-hidden="true">
          📓
        </span>
        {t('weetjes.titel')}
      </Link>
    </main>
  )
}
