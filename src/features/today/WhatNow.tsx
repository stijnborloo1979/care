import { Link } from 'react-router-dom'
import { useHousehold } from '../household/useHousehold'
import { hhmm } from '../../lib/time'
import { useAgenda, useMarkDone, useNow } from './useAgenda'
import { whatNow } from './whatNow'
import { t } from '../../lib/i18n'

/**
 * Eén vraag, één antwoord, één knop. Dit scherm bestaat omdat "wat moet
 * ik nu doen" de enige vraag is die er op een slechte dag toe doet.
 */
export default function WhatNow() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const tz = household?.timezone ?? 'Europe/Brussels'
  const now = useNow()
  const { data, isLoading } = useAgenda(hh, tz)
  const markDone = useMarkDone(hh)

  const { current, next } = whatNow(data ?? [], now)

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <Link to="/" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ {t('nav.vandaag')}
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">
        {t('watnu.titel')}
      </h1>
      <p className="mt-1 text-lg text-ink-soft">{t('watnu.hetIs', { tijd: hhmm(now, tz) })}</p>

      {isLoading ? (
        <p className="mt-8 text-ink-soft">{t('watnu.laden')}</p>
      ) : (
        <div className="mt-6 rounded-card border-[1.5px] border-accent bg-accent-soft p-6 shadow-lift">
          <p className="text-6xl" aria-hidden="true">
            {current?.emoji ?? '🍵'}
          </p>
          <p className="mt-3 text-4xl font-extrabold leading-tight tracking-tight">
            {current?.title ?? t('watnu.rusten')}
          </p>
          <p className="mt-3 text-xl text-ink-soft">
            {current?.note ?? t('watnu.nietsMoet')}
          </p>

          {current ? (
            <button
              onClick={() => markDone.mutate({ id: current.id, done: true })}
              className="mt-6 flex min-h-[3.6rem] w-full items-center justify-center rounded-pill bg-accent-ink px-5 text-xl font-semibold text-white"
            >
              {t('watnu.gedaan')}
            </button>
          ) : null}
        </div>
      )}

      {next ? (
        <div className="mt-6 rounded-card bg-surface p-6 shadow-card">
          <p className="text-base font-bold text-ink-faint">{t('vandaag.daarna')}</p>
          <p className="mt-1 text-2xl font-bold">
            {next.emoji ? `${next.emoji} ` : ''}
            {next.title}
          </p>
          <p className="text-lg text-ink-soft">
            {t('vandaag.om', { tijd: hhmm(new Date(next.starts_at), tz) })}
          </p>
        </div>
      ) : null}

      <Link
        to="/praten"
        className="mt-6 flex min-h-[3.6rem] w-full items-center justify-center gap-2 rounded-pill border-[1.5px] border-line-strong text-lg font-semibold"
      >
        🎤 {t('watnu.hardop')}
      </Link>
    </main>
  )
}
