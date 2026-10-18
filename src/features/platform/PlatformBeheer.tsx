import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Kaart, Kop, Leeg, Fout, knop, label, tekstvak, veld } from '../zorg/ui'
import {
  activeerOrganisatie,
  controleOrganisaties,
  controleerAanvraag,
  ikId,
  isPlatformBeheerder,
  keurAanvraagGoed,
  logLijst,
  platformAanvragen,
  wijsAanvraagAf,
  type Aanvraag,
} from './platformApi'

/**
 * Beheer voor LifeAngle-medewerkers: aanvragen van een WZC controleren en
 * goedkeuren, WZC's activeren, en het logboek bekijken. Nederlands; intern.
 * De server controleert alles opnieuw; dit scherm verbergt alleen wat niet mag.
 */
export default function PlatformBeheer() {
  const { data: mag, isLoading } = useQuery({ queryKey: ['platform-mag'], queryFn: isPlatformBeheerder })
  if (isLoading) return <p className="p-6 text-ink-soft">Even geduld…</p>
  if (!mag) return <Leeg>Dit scherm is alleen voor platformbeheerders.</Leeg>
  return (
    <main className="mx-auto max-w-[56rem] space-y-8 px-5 py-10">
      <Kop titel="LifeAngle · platformbeheer" uitleg="Aanvragen, activatie en logboek voor woonzorgcentra." />
      <Aanvragen />
      <Organisaties />
      <Logboek />
    </main>
  )
}

function Aanvragen() {
  const qc = useQueryClient()
  const { data, error } = useQuery({ queryKey: ['platform-aanvragen'], queryFn: platformAanvragen })
  const { data: ik } = useQuery({ queryKey: ['ik-id'], queryFn: ikId })
  const ververs = () => qc.invalidateQueries({ queryKey: ['platform-aanvragen'] })

  return (
    <Kaart titel="Aanvragen">
      <Fout fout={error} />
      {data && data.length === 0 ? <p className="text-ink-soft">Geen aanvragen.</p> : null}
      <ul className="space-y-4">
        {(data ?? []).map((a) => (
          <AanvraagRegel key={a.id} a={a} ikId={ik ?? null} onKlaar={ververs} />
        ))}
      </ul>
    </Kaart>
  )
}

function AanvraagRegel({ a, ikId, onKlaar }: { a: Aanvraag; ikId: string | null; onKlaar: () => void }) {
  const [notitie, setNotitie] = useState('')
  const controleer = useMutation({ mutationFn: () => controleerAanvraag(a.id, notitie), onSuccess: onKlaar })
  const keur = useMutation({ mutationFn: () => keurAanvraagGoed(a.id), onSuccess: onKlaar })
  const wijs = useMutation({ mutationFn: () => wijsAanvraagAf(a.id, notitie), onSuccess: onKlaar })
  const zelfGecontroleerd = a.telefoon_gecontroleerd_door !== null && a.telefoon_gecontroleerd_door === ikId

  return (
    <li className="rounded-card border border-line p-4">
      <p className="font-bold">
        {a.naam} <span className="font-normal text-ink-soft">· {a.status}</span>
      </p>
      <p className="text-sm text-ink-soft">
        KBO {a.ondernemingsnummer}
        {a.erkenningsnummer ? ` · erkenning ${a.erkenningsnummer}` : ''} · {a.adres}
      </p>
      <p className="text-sm text-ink-soft">
        {a.contact_naam} · {a.contact_email} · {a.telefoon}
      </p>
      {a.notitie ? <p className="mt-1 text-sm">Notitie: {a.notitie}</p> : null}

      {a.status === 'ingediend' ? (
        <div className="mt-3 space-y-2">
          <textarea className={tekstvak} placeholder="Notitie bij de telefonische controle (nummer uit KBO, niet uit het formulier)" value={notitie} onChange={(e) => setNotitie(e.target.value)} />
          <button className={knop} disabled={controleer.isPending} onClick={() => controleer.mutate()}>Telefonisch gecontroleerd</button>
          <Fout fout={controleer.error} />
        </div>
      ) : null}

      {a.status === 'gecontroleerd' ? (
        <div className="mt-3 space-y-2">
          {zelfGecontroleerd ? (
            <p className="text-sm text-ink-soft">Jij hebt deze aanvraag gecontroleerd. Een collega moet goedkeuren.</p>
          ) : (
            <button className={knop} disabled={keur.isPending} onClick={() => keur.mutate()}>Goedkeuren</button>
          )}
          <Fout fout={keur.error} />
          <div className="flex gap-2">
            <input className={veld} placeholder="Reden bij afwijzen" value={notitie} onChange={(e) => setNotitie(e.target.value)} />
            <button className={knop} disabled={!notitie.trim() || wijs.isPending} onClick={() => wijs.mutate()}>Afwijzen</button>
          </div>
          <Fout fout={wijs.error} />
        </div>
      ) : null}
    </li>
  )
}

function Organisaties() {
  const qc = useQueryClient()
  const { data, error } = useQuery({ queryKey: ['platform-org-controle'], queryFn: controleOrganisaties })
  return (
    <Kaart titel="Nog niet vastgelegd (verwerkersovereenkomst)">
      <p className="mb-3 text-sm text-ink-soft">Bestaande organisaties worden hier niet automatisch uitgezet. Leg de overeenkomst vast om ze te activeren.</p>
      <Fout fout={error} />
      {data && data.length === 0 ? <p className="text-ink-soft">Alles is vastgelegd.</p> : null}
      <ul className="space-y-4">
        {(data ?? []).map((o) => (
          <OrgRegel key={o.id} o={o} onKlaar={() => qc.invalidateQueries({ queryKey: ['platform-org-controle'] })} />
        ))}
      </ul>
    </Kaart>
  )
}

function OrgRegel({ o, onKlaar }: { o: { id: string; name: string; contact_email: string | null; active: boolean; beheerders: number; huishoudens: number }; onKlaar: () => void }) {
  const [dpa, setDpa] = useState('')
  const act = useMutation({ mutationFn: () => activeerOrganisatie(o.id, dpa), onSuccess: onKlaar })
  return (
    <li className="rounded-card border border-line p-4">
      <p className="font-bold">{o.name} <span className="font-normal text-ink-soft">· {o.active ? 'actief' : 'niet actief'}</span></p>
      <p className="text-sm text-ink-soft">{o.contact_email ?? 'geen e-mail'} · {o.beheerders} beheerder(s) · {o.huishoudens} bewoner(s)</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="flex-1">
          <span className={label}>Verwijzing verwerkersovereenkomst</span>
          <input className={veld} value={dpa} onChange={(e) => setDpa(e.target.value)} />
        </label>
        <button className={knop} disabled={!dpa.trim() || act.isPending} onClick={() => act.mutate()}>Vastleggen en activeren</button>
      </div>
      <Fout fout={act.error} />
    </li>
  )
}

function Logboek() {
  const { data, error } = useQuery({ queryKey: ['platform-log'], queryFn: () => logLijst(50) })
  return (
    <Kaart titel="Logboek">
      <Fout fout={error} />
      <ul className="space-y-1 text-sm">
        {(data ?? []).map((r) => (
          <li key={r.id}>
            <span className="text-ink-soft">{new Date(r.created_at).toLocaleString('nl-BE')}</span> · {r.soort}
          </li>
        ))}
      </ul>
    </Kaart>
  )
}
