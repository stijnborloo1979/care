import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronDown } from 'lucide-react'
import { euro, maandenGratis, publiekePrijzen, type Plan } from './prijzen'
import { tt } from '../../lib/uiTaal'

/**
 * De prijspagina. Ook zonder in te loggen. Zolang de prijzen een voorstel
 * zijn, staat dat er bovenaan; er wordt nog niets aangerekend.
 */
export default function Prijzen() {
  const q = useQuery({ queryKey: ['publieke-prijzen'], queryFn: publiekePrijzen, staleTime: 10 * 60_000, retry: false })
  const [voor, setVoor] = useState<'home' | 'care'>('home')
  const [jaar, setJaar] = useState(false)

  const lijst = (q.data ?? []).filter((p) => p.product === voor)
  const voorstel = (q.data ?? []).some((p) => p.voorstel)

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <Link to="/" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ LifeAngle
      </Link>
      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">{tt('Wat kost LifeAngle?')}</h1>
      <p className="mt-2 max-w-2xl text-lg text-ink-soft">
        {tt('Eén prijs per huishouden, met zoveel familieleden als je wil. Voor een woonzorgcentrum: per bewoner die er echt verblijft.')}
      </p>

      {voorstel ? (
        <p role="note" className="mt-5 rounded-2xl bg-accent-soft px-4 py-3 text-accent-ink">
          {tt('Prijzen onder voorbehoud. Er wordt nu nog niets aangerekend.')}
        </p>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label={tt('Voor wie')} className="inline-flex rounded-pill bg-surface-soft p-1">
          {(['home', 'care'] as const).map((p) => (
            <button
              key={p}
              role="tab"
              aria-selected={voor === p}
              onClick={() => setVoor(p)}
              className={`min-h-touch rounded-pill px-5 font-semibold ${voor === p ? 'bg-surface shadow-card' : 'text-ink-soft'}`}
            >
              {p === 'home' ? tt('Voor families') : tt('Voor woonzorgcentra')}
            </button>
          ))}
        </div>
        {voor === 'home' ? (
          <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 font-semibold">
            <input type="checkbox" checked={jaar} onChange={(e) => setJaar(e.target.checked)} className="h-5 w-5" />
            {tt('Per jaar betalen')}
          </label>
        ) : null}
      </div>

      {q.isLoading ? <p className="mt-8 text-ink-soft">{tt('Even geduld…')}</p> : null}
      {q.data === null ? (
        <p className="mt-8 rounded-2xl bg-surface-soft px-4 py-3 text-ink-soft">{tt('De prijzen zijn nog niet ingesteld.')}</p>
      ) : null}

      <div className={`mt-6 grid gap-5 ${lijst.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
        {lijst.map((p, i) => (
          <PlanKaart key={p.id} plan={p} jaar={jaar && voor === 'home'} uitgelicht={voor === 'home' ? i === 1 : i === 0} />
        ))}
      </div>

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        <section className="rounded-card bg-surface p-6 shadow-card">
          <h2 className="text-lg font-bold">{tt('Goed om te weten')}</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-ink-soft">
            <li>{tt('Alle familieleden, de tablet van de persoon en zorgverleners: inbegrepen, zonder meerprijs.')}</li>
            <li>{tt('Verblijft iemand in een woonzorgcentrum dat LifeAngle Care gebruikt, dan betaalt de familie niets extra.')}</li>
            <li>{tt('Opzeggen kan altijd. Je gegevens kan je eerst downloaden.')}</li>
          </ul>
        </section>
        <section className="rounded-card bg-surface p-6 shadow-card">
          <h2 className="text-lg font-bold">{tt('Woonzorgcentrum?')}</h2>
          <p className="mt-2 text-ink-soft">
            {tt('Je betaalt alleen voor bewoners die die maand echt verblijven, niet voor bedden of medewerkers. Begin met een pilot op één afdeling.')}
          </p>
          <Link to="/zorg/nieuw" className="mt-4 inline-flex min-h-touch items-center rounded-pill bg-accent-ink px-5 font-semibold text-white">
            {tt('Een woonzorgcentrum registreren')}
          </Link>
        </section>
      </div>
    </main>
  )
}

function PlanKaart({ plan: p, jaar, uitgelicht }: { plan: Plan; jaar: boolean; uitgelicht: boolean }) {
  const [open, setOpen] = useState(false)
  const gratis = (p.prijs_maand_cent ?? 0) === 0
  const bedrag = jaar && p.prijs_jaar_cent != null ? p.prijs_jaar_cent : p.prijs_maand_cent ?? 0
  const per = p.eenheid === 'bewoner' ? tt('per bewoner per maand') : jaar ? tt('per jaar') : tt('per maand')
  const winst = jaar ? maandenGratis(p) : 0

  return (
    <section
      className={`flex flex-col rounded-card bg-surface p-6 shadow-card ${uitgelicht ? 'ring-2 ring-accent-ink' : ''}`}
      aria-labelledby={`plan-${p.id}`}
    >
      <h2 id={`plan-${p.id}`} className="text-xl font-bold">
        {p.naam}
      </h2>
      <p className="mt-3">
        <span className="text-4xl font-extrabold tracking-tight">{gratis ? tt('Gratis') : euro(bedrag)}</span>
        {!gratis ? <span className="ml-2 text-ink-soft">{per}</span> : null}
      </p>
      <p className="mt-1 text-sm text-ink-faint">
        {!gratis ? (p.btw_inbegrepen ? tt('btw inbegrepen') : tt('excl. btw')) : ' '}
        {p.minimum_maand_cent ? ` · ${tt('minimum {bedrag} per maand', { bedrag: euro(p.minimum_maand_cent) })}` : ''}
        {winst > 0 ? ` · ${winst === 1 ? tt('{n} maand gratis', { n: winst }) : tt('{n} maanden gratis', { n: winst })}` : ''}
      </p>
      {p.omschrijving ? <p className="mt-3 text-ink-soft">{p.omschrijving}</p> : null}
      {p.proefdagen > 0 ? (
        <p className="mt-3 font-semibold text-accent-ink">{tt('{n} dagen gratis proberen', { n: p.proefdagen })}</p>
      ) : null}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="mt-4 inline-flex items-center gap-1 self-start text-sm font-semibold text-ink-soft underline underline-offset-4"
      >
        {tt('Wat zit erin')}
        <ChevronDown size={16} strokeWidth={1.75} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="mt-2 space-y-1">
          {p.onderdelen.map((o) => (
            <li key={o} className="flex items-start gap-2 text-sm">
              <Check size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden="true" />
              {o}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
