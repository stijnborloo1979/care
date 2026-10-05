import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Building2, Pencil } from 'lucide-react'
import {
  alleAfdelingen,
  archiveerAfdeling,
  herstelAfdeling,
  hernoemAfdeling,
  nieuweAfdeling,
  orgGegevens,
  zetOrgGegevens,
  type AfdelingRij,
} from './zorgApi'
import { Fout, Kaart, Leeg, knop, knopKlein, knopRustig, label, veld } from './ui'
import { tt } from '../../lib/uiTaal'

/** Naam, contactadres en btw-nummer van het woonzorgcentrum. Alleen de beheerder. */
export function Organisatie({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const g = useQuery({ queryKey: ['zorg', 'org-gegevens', orgId], queryFn: () => orgGegevens(orgId) })
  const [naam, setNaam] = useState('')
  const [mail, setMail] = useState('')
  const [btw, setBtw] = useState('')
  const [bewaard, setBewaard] = useState(false)
  useEffect(() => {
    if (g.data) {
      setNaam(g.data.name)
      setMail(g.data.contact_email ?? '')
      setBtw(g.data.vat_number ?? '')
    }
  }, [g.data])
  const bewaar = useMutation({
    mutationFn: () => zetOrgGegevens(orgId, { name: naam, contact_email: mail, vat_number: btw }),
    onSuccess: () => {
      setBewaard(true)
      queryClient.invalidateQueries({ queryKey: ['zorg', 'org-gegevens', orgId] })
      queryClient.invalidateQueries({ queryKey: ['organisaties'] })
    },
  })
  if (!g.data) return null
  const gewijzigd = naam !== g.data.name || mail !== (g.data.contact_email ?? '') || btw !== (g.data.vat_number ?? '')

  return (
    <Kaart titel={<><Building2 size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Organisatie')}</>}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (naam.trim()) bewaar.mutate()
        }}
        className="grid gap-3 sm:grid-cols-2"
      >
        <label className="sm:col-span-2">
          <span className={label}>{tt('Naam')}</span>
          <input required maxLength={120} value={naam} onChange={(e) => { setNaam(e.target.value); setBewaard(false) }} className={veld} />
        </label>
        <label className="min-w-0">
          <span className={label}>{tt('Contact-e-mail')}</span>
          <input type="email" value={mail} onChange={(e) => { setMail(e.target.value); setBewaard(false) }} className={veld} />
        </label>
        <label className="min-w-0">
          <span className={label}>{tt('Btw-nummer')}</span>
          <input maxLength={30} value={btw} onChange={(e) => { setBtw(e.target.value); setBewaard(false) }} placeholder="BE0123.456.789" className={veld} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={!gewijzigd || !naam.trim() || bewaar.isPending} className={knop}>
            {tt('Bewaren')}
          </button>
          {bewaard && !gewijzigd ? <span role="status" className="text-sm text-ink-soft">{tt('Bewaard.')}</span> : null}
        </div>
      </form>
      <Fout fout={bewaar.error} />
    </Kaart>
  )
}

/** Afdelingen: toevoegen, hernoemen, archiveren en terugzetten (72). */
export function Afdelingen({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient()
  const afd = useQuery({ queryKey: ['zorg', 'alle-afdelingen', orgId], queryFn: () => alleAfdelingen(orgId) })
  const ververs = () => {
    for (const k of ['alle-afdelingen', 'afdelingen', 'medewerkers', 'alle-bewoners'])
      queryClient.invalidateQueries({ queryKey: ['zorg', k, orgId] })
  }
  const [naam, setNaam] = useState('')
  const maak = useMutation({
    mutationFn: () => nieuweAfdeling(orgId, naam),
    onSuccess: () => {
      setNaam('')
      ververs()
    },
  })
  const archiveer = useMutation({ mutationFn: archiveerAfdeling, onSuccess: ververs })
  const herstel = useMutation({ mutationFn: herstelAfdeling, onSuccess: ververs })

  const actief = (afd.data ?? []).filter((a) => !a.archived_at)
  const archief = (afd.data ?? []).filter((a) => a.archived_at)

  return (
    <Kaart titel={tt('Afdelingen')}>
      {afd.data && actief.length === 0 ? <Leeg>{tt('Nog geen afdelingen.')}</Leeg> : null}
      <ul className="space-y-2">
        {actief.map((a) => (
          <AfdelingRegel
            key={a.id}
            a={a}
            onVerandering={ververs}
            onArchiveer={() => {
              if (confirm(tt('Afdeling {naam} archiveren? Medewerkers verliezen hun plaats op deze afdeling.', { naam: a.name }))) archiveer.mutate(a.id)
            }}
          />
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (naam.trim()) maak.mutate()
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <label className="min-w-[12rem] flex-1">
          <span className={label}>{tt('Nieuwe afdeling')}</span>
          <input maxLength={80} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={tt('De Eik')} className={veld} />
        </label>
        <button type="submit" disabled={!naam.trim() || maak.isPending} className={knop}>
          {tt('Toevoegen')}
        </button>
      </form>
      {archief.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-soft">{tt('Gearchiveerd ({n})', { n: archief.length })}</summary>
          <ul className="mt-2 space-y-2">
            {archief.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-soft px-4 py-2">
                <span className="min-w-0 flex-1 text-ink-soft">{a.name}</span>
                <button onClick={() => herstel.mutate(a.id)} className={knopKlein}>
                  {tt('Terugzetten')}
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <Fout fout={maak.error ?? archiveer.error ?? herstel.error} />
    </Kaart>
  )
}

function AfdelingRegel({ a, onVerandering, onArchiveer }: { a: AfdelingRij; onVerandering: () => void; onArchiveer: () => void }) {
  const [bewerk, setBewerk] = useState(false)
  const [naam, setNaam] = useState(a.name)
  const hernoem = useMutation({
    mutationFn: () => hernoemAfdeling(a.id, naam),
    onSuccess: () => {
      setBewerk(false)
      onVerandering()
    },
  })
  if (bewerk) {
    return (
      <li className="rounded-2xl bg-surface-soft px-4 py-3">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (naam.trim()) hernoem.mutate()
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <label className="min-w-[10rem] flex-1">
            <span className="sr-only">{tt('Nieuwe naam voor {naam}', { naam: a.name })}</span>
            <input autoFocus maxLength={80} value={naam} onChange={(e) => setNaam(e.target.value)} className={veld} />
          </label>
          <button type="submit" disabled={!naam.trim() || hernoem.isPending} className={knop}>
            {tt('Bewaren')}
          </button>
          <button type="button" onClick={() => { setBewerk(false); setNaam(a.name) }} className={knopRustig}>
            {tt('Annuleren')}
          </button>
        </form>
        <Fout fout={hernoem.error} />
      </li>
    )
  }
  return (
    <li className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-soft px-4 py-2">
      <span className="min-w-0 flex-1 font-semibold">{a.name}</span>
      <button onClick={() => setBewerk(true)} aria-label={tt('{naam} hernoemen', { naam: a.name })} className={`${knopKlein} inline-flex items-center gap-1`}>
        <Pencil size={14} strokeWidth={1.75} aria-hidden="true" /> {tt('Hernoemen')}
      </button>
      <button onClick={onArchiveer} aria-label={tt('{naam} archiveren', { naam: a.name })} className={`${knopKlein} inline-flex items-center gap-1`}>
        <Archive size={14} strokeWidth={1.75} aria-hidden="true" /> {tt('Archiveren')}
      </button>
    </li>
  )
}
