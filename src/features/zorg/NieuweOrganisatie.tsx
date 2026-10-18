import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { dienOrgAanvraag, type OrgAanvraagInvoer } from './zorgApi'
import { useOrganisatie } from './useOrganisatie'
import { Fout, knop, label, veld } from './ui'
import { tt } from '../../lib/uiTaal'
import { DemoKnop } from './Demo'

const leeg: OrgAanvraagInvoer = {
  naam: '',
  ondernemingsnummer: '',
  erkenningsnummer: '',
  adres: '',
  contactNaam: '',
  contactEmail: '',
  telefoon: '',
}

const velden: { sleutel: keyof OrgAanvraagInvoer; tekst: string; plaats?: string; verplicht: boolean; type?: string }[] = [
  { sleutel: 'naam', tekst: 'Naam van het woonzorgcentrum', plaats: 'WZC De Linde', verplicht: true },
  { sleutel: 'ondernemingsnummer', tekst: 'Ondernemingsnummer', plaats: '0123.456.789', verplicht: true },
  { sleutel: 'erkenningsnummer', tekst: 'Erkenningsnummer (indien bekend)', verplicht: false },
  { sleutel: 'adres', tekst: 'Adres', plaats: 'Straat 1, 9000 Gent', verplicht: true },
  { sleutel: 'contactNaam', tekst: 'Naam van de contactpersoon', verplicht: true },
  { sleutel: 'contactEmail', tekst: 'E-mailadres van het woonzorgcentrum', plaats: 'info@woonzorgcentrum.be', verplicht: true, type: 'email' },
  { sleutel: 'telefoon', tekst: 'Telefoonnummer van de contactpersoon', verplicht: true, type: 'tel' },
]

/**
 * Een woonzorgcentrum aanvragen. LifeAngle controleert de gegevens telefonisch
 * en per e-mail; pas daarna wordt het account van het WZC actief.
 */
export default function NieuweOrganisatie() {
  const { org, isLoading } = useOrganisatie()
  const [v, setV] = useState<OrgAanvraagInvoer>(leeg)
  const [ingediend, setIngediend] = useState(false)
  const dien = useMutation({
    mutationFn: () => dienOrgAanvraag(v),
    onSuccess: () => setIngediend(true),
  })

  if (isLoading) return <p className="p-6 text-ink-soft">{tt('Even geduld…')}</p>
  // Wie al aan een WZC gekoppeld is, gaat naar zijn scherm.
  if (org && !ingediend) return <Navigate to="/zorg" replace />

  if (ingediend) {
    return (
      <main className="mx-auto max-w-[32rem] px-5 py-10">
        <h1 className="text-[1.9rem] font-extrabold leading-tight tracking-tight">{tt('Je aanvraag is ontvangen')}</h1>
        <p className="mt-3 text-lg text-ink-soft">
          {tt('LifeAngle controleert de gegevens en neemt contact op met de contactpersoon. Pas daarna wordt het woonzorgcentrum actief en kan de beheerder medewerkers uitnodigen.')}
        </p>
        <Link to="/" className="mt-8 block text-center font-semibold text-ink-faint underline underline-offset-4">
          {tt('Terug')}
        </Link>
      </main>
    )
  }

  const kanIndienen = velden.every((f) => !f.verplicht || v[f.sleutel].trim() !== '') && !dien.isPending

  return (
    <main className="mx-auto max-w-[32rem] px-5 py-10">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent-ink">
        <Building2 size={28} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <h1 className="mt-5 text-[1.9rem] font-extrabold leading-tight tracking-tight">{tt('Een woonzorgcentrum aanvragen')}</h1>
      <p className="mt-2 text-lg text-ink-soft">
        {tt('LifeAngle controleert elk woonzorgcentrum voordat het actief wordt. Daarna wordt de contactpersoon beheerder.')}
      </p>
      <p className="mt-2 text-ink-soft">
        {tt('Werk je in een woonzorgcentrum dat al LifeAngle gebruikt? Dan heb je een uitnodiging nodig van je beheerder.')}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (kanIndienen) dien.mutate()
        }}
        className="mt-6 space-y-4"
      >
        {velden.map((f) => (
          <label key={f.sleutel} className="block">
            <span className={label}>{tt(f.tekst)}</span>
            <input
              type={f.type ?? 'text'}
              required={f.verplicht}
              value={v[f.sleutel]}
              onChange={(e) => setV({ ...v, [f.sleutel]: e.target.value })}
              placeholder={f.plaats ? tt(f.plaats) : undefined}
              className={veld}
            />
          </label>
        ))}
        <button type="submit" disabled={!kanIndienen} className={`${knop} mt-2 w-full text-lg`}>
          {dien.isPending ? tt('Bezig…') : tt('Aanvraag indienen')}
        </button>
        <Fout fout={dien.error} />
      </form>

      <div className="mt-8 rounded-card border-[1.5px] border-dashed border-accent bg-accent-soft p-5">
        <h2 className="text-lg font-bold">{tt('Eerst rondkijken?')}</h2>
        <p className="mt-1 text-ink-soft">
          {tt('Open een demo-woonzorgcentrum met afdelingen, kamers en acht verzonnen bewoners. Je kan het daarna met één klik wissen.')}
        </p>
        <div className="mt-3">
          <DemoKnop groot />
        </div>
      </div>

      <Link to="/" className="mt-6 block text-center font-semibold text-ink-faint underline underline-offset-4">
        {tt('Terug')}
      </Link>
    </main>
  )
}
