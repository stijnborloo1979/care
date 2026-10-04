import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useOrganisatie } from './useOrganisatie'
import { afdelingen as haalAfdelingen } from './zorgApi'
import { mijnLeidAfdelingen, orgNieuws, plaatsNieuws, wisNieuws } from '../../services/nieuws'
import { Fout, Kaart, Kop, Laden, Leeg, dagEnUur, knop, knopKlein, label, veld } from './ui'

/**
 * Nieuws van het woonzorgcentrum aan de families (79): aan iedereen, of aan
 * de families van één afdeling. Nooit over één bewoner: daarvoor is er het
 * dossier en de berichten.
 */
export default function Nieuws() {
  const { org, beheert, isBeheerder } = useOrganisatie()
  const { session } = useAuth()
  const ik = session?.user.id ?? ''
  const orgId = org?.org_id ?? ''
  const queryClient = useQueryClient()
  const sleutel = ['zorg', 'nieuws', orgId]
  const lijst = useQuery({ queryKey: sleutel, queryFn: () => orgNieuws(orgId), enabled: !!orgId })
  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId), enabled: !!orgId })
  const leid = useQuery({ queryKey: ['zorg', 'leid-afdelingen', ik], queryFn: () => mijnLeidAfdelingen(ik), enabled: !!ik && !beheert })
  const namen = Object.fromEntries((afd.data ?? []).map((a) => [a.id, a.name]))
  const wis = useMutation({ mutationFn: wisNieuws, onSuccess: () => queryClient.invalidateQueries({ queryKey: sleutel }) })

  if (!org) return null
  // Beheerder en coördinator: iedereen of één afdeling. Team lead: alleen zijn afdelingen.
  const keuzes = beheert ? afd.data ?? [] : (afd.data ?? []).filter((a) => (leid.data ?? []).includes(a.id))
  const magSchrijven = beheert || keuzes.length > 0

  return (
    <div className="space-y-6">
      <Kop titel="Nieuws voor de families" uitleg="Eén bericht, bij elke familie in de app. Met de naam van het woonzorgcentrum erbij." />
      {magSchrijven ? (
        <NieuwBericht
          orgId={orgId}
          ik={ik}
          aanIedereen={beheert}
          afdelingen={keuzes}
          onKlaar={() => queryClient.invalidateQueries({ queryKey: sleutel })}
        />
      ) : null}
      <Kaart titel="Verstuurd">
        {lijst.isLoading ? <Laden /> : null}
        <Fout fout={lijst.error ?? wis.error} />
        {lijst.data && lijst.data.length === 0 ? <Leeg>Nog geen nieuws verstuurd.</Leeg> : null}
        <ul className="space-y-3">
          {(lijst.data ?? []).map((n) => (
            <li key={n.id} className="rounded-2xl border border-line p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{n.titel}</p>
                  <p className="mt-1 whitespace-pre-line">{n.tekst}</p>
                  <p className="mt-1 text-sm text-ink-faint">
                    {n.department_id ? `Aan de families van afdeling ${namen[n.department_id] ?? '…'}` : 'Aan alle families'} ·{' '}
                    {dagEnUur(n.created_at)}
                  </p>
                </div>
                {n.author_id === ik || isBeheerder ? (
                  <button
                    onClick={() => {
                      if (confirm(`"${n.titel}" wissen? De families zien het dan niet meer.`)) wis.mutate(n.id)
                    }}
                    aria-label={`${n.titel} wissen`}
                    className={knopKlein}
                  >
                    <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-faint">Nieuws blijft 180 dagen staan.</p>
      </Kaart>
    </div>
  )
}

function NieuwBericht({
  orgId,
  ik,
  aanIedereen,
  afdelingen,
  onKlaar,
}: {
  orgId: string
  ik: string
  aanIedereen: boolean
  afdelingen: { id: string; name: string }[]
  onKlaar: () => void
}) {
  const [titel, setTitel] = useState('')
  const [tekst, setTekst] = useState('')
  const [afdeling, setAfdeling] = useState('')
  const doel = aanIedereen ? afdeling : afdeling || afdelingen[0]?.id || ''
  const bewaar = useMutation({
    mutationFn: () => plaatsNieuws({ org_id: orgId, department_id: doel || null, titel, tekst, auteur: ik }),
    onSuccess: () => {
      setTitel('')
      setTekst('')
      onKlaar()
    },
  })

  return (
    <Kaart titel="Nieuw bericht">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (confirm(doel ? 'Versturen naar de families van deze afdeling?' : 'Versturen naar alle families?')) bewaar.mutate()
        }}
        className="grid gap-3"
      >
        <label>
          <span className={label}>Aan</span>
          <select value={doel} onChange={(e) => setAfdeling(e.target.value)} className={veld}>
            {aanIedereen ? <option value="">Alle families</option> : null}
            {afdelingen.map((a) => (
              <option key={a.id} value={a.id}>
                De families van afdeling {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Titel</span>
          <input required maxLength={120} value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Zomerfeest zaterdag" className={veld} />
        </label>
        <label>
          <span className={label}>Bericht</span>
          <textarea
            required
            maxLength={2000}
            rows={4}
            value={tekst}
            onChange={(e) => setTekst(e.target.value)}
            placeholder="Zaterdag om 14 uur in de tuin. Iedereen welkom."
            className={veld}
          />
        </label>
        <p className="rounded-2xl bg-surface-soft p-3 text-sm text-ink-soft">
          Schrijf hier nooit iets over één bewoner. Dit lezen alle families{doel ? ' van die afdeling' : ''}.
        </p>
        <div>
          <button type="submit" disabled={bewaar.isPending} className={`${knop} w-full sm:w-auto`}>
            {bewaar.isPending ? 'Bezig…' : 'Versturen'}
          </button>
          <Fout fout={bewaar.error} />
        </div>
      </form>
    </Kaart>
  )
}
