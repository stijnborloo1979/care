import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isWeggeklikt, onthoudWeggeklikt, useInstall } from './useInstall'

/**
 * Eén regel bovenaan, alleen zolang de app nog niet op het beginscherm
 * staat. Op Android kan het met één druk; op iPad blijft het handwerk,
 * dus daar verwijst de knop naar de uitleg.
 */
export default function InstallPrompt({ compact = false }: { compact?: boolean }) {
  const { kanInstalleren, installeer, geinstalleerd, platform } = useInstall()
  const [weg, setWeg] = useState(isWeggeklikt())

  if (geinstalleerd || weg) return null
  if (!kanInstalleren && platform !== 'ios') return null

  function wegklikken() {
    onthoudWeggeklikt()
    setWeg(true)
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-center gap-3 border-b border-line bg-accent-soft px-4 text-accent-ink ${
        compact ? 'py-1.5 text-sm' : 'py-2.5'
      }`}
    >
      <span className="font-semibold">Zet Thuis op het beginscherm van dit toestel</span>

      {kanInstalleren ? (
        <button
          onClick={installeer}
          className="min-h-[2.4rem] rounded-pill bg-accent-ink px-4 font-semibold text-white"
        >
          Installeren
        </button>
      ) : (
        <Link
          to="/installeren"
          className="min-h-[2.4rem] rounded-pill border-[1.5px] border-accent-ink px-4 py-1 font-semibold"
        >
          Hoe doe ik dat?
        </Link>
      )}

      <button onClick={wegklikken} className="underline underline-offset-4" aria-label="Verbergen">
        Later
      </button>
    </div>
  )
}
