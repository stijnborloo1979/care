import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Mic, Pencil, Square, X, AlertCircle, Loader2 } from 'lucide-react'
import { t } from '../../lib/i18n'
import { useVoiceAssistant, type Fase } from './useVoiceAssistant'
import { opsomming } from './zinnen'
import type { Params } from './intents'

/**
 * LifeAngle Voice, over het hele scherm.
 *
 * De gebruiker moet altijd vier dingen weten, en die staan hier altijd op
 * dezelfde plaats:
 *   1. luister ik?                    → de grote cirkel en "Ik luister…"
 *   2. wordt mijn vraag verwerkt?     → "Even kijken…"
 *   3. wat gaat LifeAngle doen?       → de kaart met JA / NEE / AANPASSEN
 *   4. is het gelukt?                 → een vinkje, of een uitroepteken
 *
 * Niets hangt alleen af van kleur: elke toestand heeft ook een woord en
 * een icoon.
 */
export default function VoiceOverlay() {
  const v = useVoiceAssistant()
  const dialoog = useRef<HTMLDivElement>(null)
  const [typen, setTypen] = useState(false)
  const [tekst, setTekst] = useState('')

  // Escape sluit; de focus gaat naar het venster zodat een schermlezer het meldt.
  useEffect(() => {
    if (!v.open) return
    dialoog.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && v.sluiten()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [v.open, v.sluiten])

  useEffect(() => {
    if (!v.open) {
      setTypen(false)
      setTekst('')
    }
  }, [v.open])

  if (!v.open) return null

  const b = v.beurt
  const bevestigen = b?.status === 'bevestig' && (v.fase === 'wacht' || v.fase === 'luistert' || v.fase === 'spreekt')
  const toonTypen = typen || v.geenSpraak

  return (
    <div
      ref={dialoog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="LifeAngle Voice"
      className="fixed inset-0 z-[60] flex flex-col bg-bg outline-none"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex justify-end px-4 pt-3">
        <button
          onClick={v.sluiten}
          className="flex min-h-touch items-center gap-2 rounded-pill border-[1.5px] border-line-strong bg-surface px-5 text-lg font-semibold"
        >
          <X size={22} aria-hidden="true" />
          {t('voice.sluiten')}
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-[36rem] flex-1 flex-col items-center overflow-y-auto px-5 pb-8 pt-2 text-center">
        <Status fase={v.fase} status={b?.status} />

        {/* Wat de persoon zei — zo ziet ze dat ze goed verstaan werd. */}
        {v.gehoord && v.fase !== 'luistert' ? (
          <p className="mt-4 max-w-full rounded-card bg-surface-soft px-5 py-2.5 text-lg text-ink-soft">
            “{v.gehoord}”
          </p>
        ) : null}

        {/* Wat LifeAngle zegt, ook als tekst: voor wie slecht hoort. */}
        {b && v.fase !== 'verwerkt' ? (
          <p aria-live="polite" className="mt-4 text-[1.6rem] font-extrabold leading-snug tracking-tight">
            {b.zeg}
          </p>
        ) : null}

        {b?.samenvatting && bevestigen ? <Samenvatting s={b.samenvatting} /> : null}

        {b?.regels && b.regels.length > 0 && v.fase !== 'verwerkt' ? (
          <ul className="mt-5 w-full space-y-2 text-left">
            {b.regels.map((r, i) => (
              <li key={i} className="rounded-card border border-line bg-surface p-4 text-lg shadow-card">
                {r}
              </li>
            ))}
          </ul>
        ) : null}

        {bevestigen ? (
          <div className="mt-6 grid w-full gap-3">
            <button
              onClick={() => v.knop('ja')}
              className="flex min-h-big items-center justify-center gap-3 rounded-card bg-accent-ink text-2xl font-extrabold text-white shadow-lift"
            >
              <Check size={30} aria-hidden="true" />
              {t('voice.ja').toUpperCase()}
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => v.knop('nee')}
                className="flex min-h-[4.25rem] items-center justify-center gap-2 rounded-card border-[1.5px] border-line-strong bg-surface px-2 text-lg font-bold"
              >
                <X size={24} aria-hidden="true" />
                {t('voice.nee').toUpperCase()}
              </button>
              <button
                onClick={() => v.knop('aanpassen')}
                className="flex min-h-[4.25rem] items-center justify-center gap-2 rounded-card border-[1.5px] border-line-strong bg-surface px-2 text-lg font-bold"
              >
                <Pencil size={22} aria-hidden="true" />
                {t('voice.aanpassen').toUpperCase()}
              </button>
            </div>
          </div>
        ) : null}

        {v.fase === 'opname' ? (
          <div className="mt-8 w-full">
            <p className="text-lg text-ink-soft">{t('voice.dagboekUitleg')}</p>
            <p className="mt-2 text-3xl font-extrabold tabular-nums" aria-live="off">
              {Math.floor(v.opnameSeconden / 60)}:{String(v.opnameSeconden % 60).padStart(2, '0')}
            </p>
            <button
              onClick={v.dagboekKlaar}
              className="mt-6 flex min-h-big w-full items-center justify-center gap-3 rounded-card bg-accent-ink text-2xl font-extrabold text-white shadow-lift"
            >
              <Square size={26} aria-hidden="true" />
              {t('voice.klaar')}
            </button>
            <button onClick={v.dagboekStop} className="mt-4 min-h-touch px-4 text-lg font-semibold text-ink-soft underline underline-offset-4">
              {t('voice.nee')}, toch niet
            </button>
          </div>
        ) : null}

        {b?.bellen && v.fase === 'wacht' ? (
          <a
            href={`tel:${b.bellen.nummer.replace(/\s/g, '')}`}
            className="mt-8 flex min-h-big w-full items-center justify-center rounded-card bg-accent-ink text-2xl font-extrabold text-white"
          >
            📞 {b.bellen.naam}
          </a>
        ) : null}

        {b?.link && v.fase === 'wacht' ? (
          <Link
            to={b.link.naar}
            onClick={v.sluiten}
            className="mt-4 flex min-h-touch w-full items-center justify-center rounded-pill border-[1.5px] border-line-strong px-5 text-lg font-semibold"
          >
            {b.link.label}
          </Link>
        ) : null}

        {b?.dagboekId && b.status === 'gelukt' && (v.fase === 'wacht' || v.fase === 'spreekt') ? (
          v.prive === 'ja' ? (
            <p className="mt-6 rounded-card bg-surface-soft p-4 text-lg font-semibold">
              🔒 {t('voice.priveGedaan')}
            </p>
          ) : (
            <div className="mt-6 w-full">
              <p className="text-lg text-ink-soft">{t('voice.gedeeldUitleg')}</p>
              <button
                onClick={v.maakPrive}
                disabled={v.prive === 'bezig'}
                className="mt-3 flex min-h-[4rem] w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-line-strong bg-surface text-xl font-bold disabled:opacity-60"
              >
                🔒 {t('voice.prive')}
              </button>
              {v.prive === 'fout' ? (
                <p role="alert" className="mt-2 text-alert">{t('voice.priveFout')}</p>
              ) : null}
            </div>
          )
        ) : null}

        {b?.ververs?.includes('shopping') && v.fase === 'wacht' ? (
          <Link
            to="/boodschappen"
            onClick={v.sluiten}
            className="mt-4 flex min-h-touch w-full items-center justify-center rounded-pill border-[1.5px] border-line-strong px-5 text-lg font-semibold"
          >
            🛒 {t('voice.boodschappen')}
          </Link>
        ) : null}

        <div className="flex-1" />

        {/* De microfoon: altijd onderaan, altijd dezelfde plek. */}
        {v.fase !== 'opname' && v.fase !== 'bewaart' && !v.geenSpraak ? (
          <button
            onClick={v.microfoon}
            aria-label={v.fase === 'luistert' ? 'Klaar met praten' : 'Praat'}
            className={`mt-8 grid h-28 w-28 shrink-0 place-items-center rounded-full text-white shadow-lift transition-transform ${
              v.fase === 'luistert' ? 'voice-luistert bg-accent-ink' : 'bg-accent-ink/90'
            }`}
          >
            <Mic size={44} aria-hidden="true" />
          </button>
        ) : null}

        {toonTypen ? (
          <form
            className="mt-6 flex w-full gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!tekst.trim()) return
              v.typ(tekst.trim())
              setTekst('')
            }}
          >
            <input
              value={tekst}
              onChange={(e) => setTekst(e.target.value)}
              placeholder={t('voice.typHier')}
              aria-label={t('voice.ofTyp')}
              className="min-h-touch min-w-0 flex-1 rounded-pill border-[1.5px] border-line-strong bg-surface px-5 text-lg"
            />
            <button type="submit" className="min-h-touch whitespace-nowrap rounded-pill bg-accent-ink px-5 text-lg font-bold text-white">
              {t('voice.versturen')}
            </button>
          </form>
        ) : v.fase !== 'opname' ? (
          <button onClick={() => setTypen(true)} className="mt-4 min-h-touch px-4 text-base font-semibold text-ink-faint underline underline-offset-4">
            {t('voice.ofTyp')}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function Status({ fase, status }: { fase: Fase; status?: string }) {
  let icoon = <Mic size={40} aria-hidden="true" />
  let label = ''
  let kleur = 'bg-surface text-accent-ink'

  if (fase === 'luistert') {
    label = t('voice.luister')
    kleur = 'bg-accent-soft text-accent-ink'
  } else if (fase === 'verwerkt' || fase === 'bewaart') {
    icoon = <Loader2 size={40} aria-hidden="true" className="voice-draait" />
    label = fase === 'bewaart' ? t('voice.dagboekBewaren') : t('voice.bezig')
  } else if (fase === 'opname') {
    label = t('voice.luister')
    kleur = 'bg-accent-soft text-accent-ink voice-luistert'
  } else if (status === 'gelukt') {
    icoon = <Check size={44} aria-hidden="true" />
    kleur = 'bg-ok text-white'
    label = 'Gedaan'
  } else if (status === 'mislukt') {
    icoon = <AlertCircle size={44} aria-hidden="true" />
    kleur = 'bg-surface text-alert border-[1.5px] border-alert'
    label = 'Niet gelukt'
  }

  return (
    <div className="flex flex-col items-center">
      <div className={`grid h-20 w-20 place-items-center rounded-full shadow-card ${kleur}`}>{icoon}</div>
      <p className="mt-2 min-h-[1.75rem] text-xl font-bold text-ink-soft" aria-live="assertive">
        {label}
      </p>
    </div>
  )
}

function Samenvatting({ s }: { s: { intent: string; parameters: Params } }) {
  const p = s.parameters
  const rijen: [string, string][] = []
  const wat = p.title ?? p.text
  if (wat) rijen.push(['Wat', wat])
  if (p.date) {
    const [j, m, d] = p.date.split('-').map(Number)
    rijen.push([
      'Dag',
      new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(Date.UTC(j, m - 1, d)),
      ),
    ])
  }
  if (p.time) rijen.push(['Uur', p.time])
  if (p.items?.length) rijen.push(['Producten', opsomming(p.items)])
  if (p.contact) rijen.push(['Wie', p.contact])
  if (p.message) rijen.push(['Bericht', p.message])
  if (rijen.length === 0) return null

  return (
    <dl className="mt-5 w-full rounded-card border border-line bg-surface px-5 py-3 text-left shadow-card">
      {rijen.map(([k, w]) => (
        <div key={k} className="flex gap-4 py-1 text-xl">
          <dt className="w-24 shrink-0 font-semibold text-ink-faint">{k}</dt>
          <dd className="font-bold">{w}</dd>
        </div>
      ))}
    </dl>
  )
}
