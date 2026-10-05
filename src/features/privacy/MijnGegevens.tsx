import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Download, Trash2 } from 'lucide-react'
import { exporteer, verwijderAccount } from '../../services/export'
import { useAuth } from '../auth/AuthProvider'
import { tt } from '../../lib/uiTaal'

/**
 * De twee rechten uit de AVG die in de app zelf moeten kunnen: inzage en
 * verwijdering. Zonder omweg via een mail of een formulier.
 */
export default function MijnGegevens() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const [bezig, setBezig] = useState<'export' | 'wis' | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [bevestig, setBevestig] = useState('')
  const [ookHuishouden, setOokHuishouden] = useState(false)
  const [open, setOpen] = useState(false)

  async function download() {
    setBezig('export')
    setFout(null)
    try {
      const blob = await exporteer()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lifeangle-gegevens-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setFout(e instanceof Error ? e.message : tt('Downloaden lukte niet.'))
    } finally {
      setBezig(null)
    }
  }

  async function wis() {
    setBezig('wis')
    setFout(null)
    try {
      await verwijderAccount(ookHuishouden)
      await signOut()
      navigate('/login', { replace: true })
    } catch (e) {
      setFout(e instanceof Error ? e.message : tt('Verwijderen lukte niet.'))
    } finally {
      setBezig(null)
    }
  }

  const [verklaringVoor, verklaringNa] = tt(
    'Wat LifeAngle bewaart, waarom, en hoe lang, staat in de {link}.',
  ).split('{link}')
  const [typVoor, typNa] = tt('Typ {woord} om te bevestigen').split('{woord}')

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">{tt('Mijn gegevens')}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {verklaringVoor}
        <Link to="/privacy" className="font-semibold text-accent-ink underline underline-offset-4">
          {tt('privacyverklaring')}
        </Link>
        {verklaringNa}
      </p>

      <button
        onClick={download}
        disabled={bezig !== null}
        className="mt-4 flex min-h-touch items-center gap-2 rounded-pill border-[1.5px] border-line-strong px-5 font-semibold disabled:opacity-60"
      >
        <Download size={18} strokeWidth={1.75} />
        {bezig === 'export' ? tt('Bezig met verzamelen…') : tt('Download mijn gegevens')}
      </button>
      <p className="mt-2 text-xs text-ink-faint">
        {tt('Eén bestand met alles wat jij in de app kan zien. Foto’s, opnames en documenten staan erin als verwijzing.')}
      </p>

      <div className="mt-6 border-t border-line pt-5">
        {!open ? (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 font-semibold text-alert"
          >
            <Trash2 size={18} strokeWidth={1.75} />
            {tt('Mijn account verwijderen')}
          </button>
        ) : (
          <div className="space-y-3">
            <p className="font-semibold">{tt('Je account verwijderen')}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
              <li>{tt('Je kan niet meer inloggen, en je profiel verdwijnt.')}</li>
              <li>
                {tt('Gaat een huishouden over jou, of ben je er alleen in, dan verdwijnt het mee — met alle foto’s, verhalen en documenten.')}
              </li>
              <li>
                {tt('Zijn er nog anderen, dan blijft het huishouden bestaan. Wat je schreef, blijft staan zonder je naam.')}
              </li>
              <li>{tt('Dit kan niet ongedaan gemaakt worden. Download eerst je gegevens als je ze wil houden.')}</li>
            </ul>

            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={ookHuishouden}
                onChange={(e) => setOokHuishouden(e.target.checked)}
                className="mt-0.5 h-5 w-5"
              />
              {tt('Ben ik de enige beheerder van een huishouden waar nog anderen in zitten, verwijder dat huishouden dan ook.')}
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-ink-soft">
                {typVoor}
                <strong>VERWIJDER</strong>
                {typNa}
              </span>
              <input
                value={bevestig}
                onChange={(e) => setBevestig(e.target.value)}
                className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={wis}
                disabled={bevestig.trim().toUpperCase() !== 'VERWIJDER' || bezig !== null}
                className="min-h-touch rounded-pill bg-alert px-5 font-semibold text-white disabled:opacity-40"
              >
                {bezig === 'wis' ? tt('Bezig…') : tt('Definitief verwijderen')}
              </button>
              <button
                onClick={() => {
                  setOpen(false)
                  setBevestig('')
                }}
                className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
              >
                {tt('Annuleren')}
              </button>
            </div>
          </div>
        )}
      </div>

      {fout ? (
        <p role="alert" className="mt-4 rounded-2xl bg-alert-soft p-3 text-sm text-alert">
          {fout}
        </p>
      ) : null}
    </section>
  )
}
