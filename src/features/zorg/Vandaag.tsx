import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'
import { BarChart3, BedDouble, CalendarDays, CalendarRange, ClipboardList, Megaphone, Users } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useOrganisatie } from './useOrganisatie'
import { useOngezien } from './OpenVragen'
import { afdelingen as haalAfdelingen, mijnBewoners } from './zorgApi'
import { vasteDag } from '../../services/afdelingsdag'
import { activiteitenTussen, maandagVan, weekRooster } from '../../services/weekplanning'
import { bezetting, bezettingPerAfdeling, kamers as haalKamers, totalen } from '../../services/kamers'
import { orgNieuws } from '../../services/nieuws'
import AfdelingNu from './AfdelingNu'
import { Overzicht } from './Beheer'
import { Kaart, Leeg, dagEnUur } from './ui'
import { tt, uiLocale } from '../../lib/uiTaal'

const EMOJI: Record<string, string> = { maaltijd: '🍽️', rust: '🛋️', activiteit: '🎵', verzorging: '🛁', andere: '📌' }

function groet(nu: Date) {
  const u = nu.getHours()
  return u < 12 ? tt('Goedemorgen') : u < 18 ? tt('Goedemiddag') : tt('Goedenavond')
}

/**
 * De startpagina van LifeAngle Care: wat er vandaag in het huis gebeurt,
 * wat aandacht vraagt, en de snelste weg naar de rest. Een beheerder ziet
 * het huis (geen bewonersinhoud, J4); een zorgkundige ook zijn bewoners.
 */
export default function Vandaag() {
  const { org, beheert, isBeheerder } = useOrganisatie()
  const { session } = useAuth()
  const orgId = org?.org_id ?? ''
  const nu = new Date()
  const maandag = maandagVan(nu)
  const morgen = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + 1)
  const vandaagBegin = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate())

  const afd = useQuery({ queryKey: ['zorg', 'afdelingen', orgId], queryFn: () => haalAfdelingen(orgId), enabled: !!orgId })
  const vast = useQuery({ queryKey: ['zorg', 'vaste-dag', orgId], queryFn: () => vasteDag(orgId), enabled: !!orgId })
  const acts = useQuery({
    queryKey: ['zorg', 'vandaag-acts', orgId, vandaagBegin.toISOString()],
    queryFn: () => activiteitenTussen(orgId, vandaagBegin, morgen),
    enabled: !!orgId,
  })
  const km = useQuery({ queryKey: ['zorg', 'kamers', orgId], queryFn: () => haalKamers(orgId), enabled: !!orgId })
  const bz = useQuery({ queryKey: ['zorg', 'bezetting', orgId], queryFn: () => bezetting(orgId), enabled: !!orgId })
  const mijn = useQuery({ queryKey: ['zorg', 'mijn-bewoners', orgId], enabled: !!orgId, queryFn: () => mijnBewoners(orgId) })
  const nieuws = useQuery({ queryKey: ['zorg', 'nieuws', orgId], queryFn: () => orgNieuws(orgId), enabled: !!orgId })
  const vragen = useOngezien(orgId).totaal
  if (!org) return null

  const namen = Object.fromEntries((afd.data ?? []).map((a) => [a.id, a.name]))
  const wd = (nu.getDay() + 6) % 7
  const vandaag = weekRooster(maandag, vast.data ?? [], acts.data ?? [], null)[wd]?.items ?? []
  const t = totalen(bezettingPerAfdeling(afd.data ?? [], km.data ?? [], bz.data ?? []))
  const hhmm = `${String(nu.getHours()).padStart(2, '0')}:${String(nu.getMinutes()).padStart(2, '0')}`
  const volgende = vandaag.find((i) => !i.geannuleerd && i.tijd >= hhmm)
  const voornaam = (session?.user.user_metadata?.full_name as string | undefined)?.split(' ')[0]

  const tegels: { naam: string; waarde: string | number; onder?: string; naar: string }[] = [
    { naam: tt('Bewoners'), waarde: t.bewoners, onder: (afd.data ?? []).length === 1 ? tt('{n} afdeling', { n: 1 }) : tt('{n} afdelingen', { n: (afd.data ?? []).length }), naar: '/zorg/bewoners' },
    { naam: tt('Vrije bedden'), waarde: t.vrij ?? '–', onder: t.bedden ? tt('van {n} bedden', { n: t.bedden }) : tt('kamers nog niet ingevoerd'), naar: '/zorg/kamers' },
    {
      naam: tt('Vandaag gepland'),
      waarde: vandaag.filter((i) => !i.vast && !i.geannuleerd).length,
      onder: volgende ? tt('straks: {tijd} {titel}', { tijd: volgende.tijd, titel: volgende.titel }) : tt('activiteiten'),
      naar: '/zorg/week',
    },
    beheert
      ? { naam: tt('Nieuws verstuurd'), waarde: (nieuws.data ?? []).length, onder: tt('laatste 180 dagen'), naar: '/zorg/nieuws' }
      : { naam: tt('Open vragen'), waarde: vragen, onder: tt('van je bewoners'), naar: '/zorg/bewoners' },
  ]

  const snel: { naar: string; naam: string; icoon: LucideIcon; zichtbaar: boolean }[] = [
    { naar: '/zorg/bewoners', naam: tt('Bewoners'), icoon: Users, zichtbaar: true },
    { naar: '/zorg/overdracht', naam: tt('Overdracht'), icoon: ClipboardList, zichtbaar: true },
    { naar: '/zorg/week', naam: tt('Weekplanning'), icoon: CalendarRange, zichtbaar: true },
    { naar: '/zorg/activiteiten', naam: tt('Activiteit plannen'), icoon: CalendarDays, zichtbaar: beheert || !!org.team_lead },
    { naar: '/zorg/kamers', naam: tt('Kamers'), icoon: BedDouble, zichtbaar: true },
    { naar: '/zorg/nieuws', naam: tt('Nieuws versturen'), icoon: Megaphone, zichtbaar: beheert || !!org.team_lead },
    { naar: '/zorg/rapporten', naam: tt('Rapporten'), icoon: BarChart3, zichtbaar: beheert },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {groet(nu)}
          {voornaam ? `, ${voornaam}` : ''}
        </h1>
        <p className="mt-1 text-ink-soft">
          {org.naam} — {new Intl.DateTimeFormat(uiLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(nu)}
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tegels.map((x) => (
          <Link key={x.naam} to={x.naar} className="block min-w-0 rounded-card bg-surface p-4 shadow-card transition hover:shadow-lift">
            <dt className="truncate text-sm font-semibold text-ink-soft">{x.naam}</dt>
            <dd className="text-3xl font-bold tabular-nums">{x.waarde}</dd>
            {x.onder ? <dd className="truncate text-xs text-ink-faint">{x.onder}</dd> : null}
          </Link>
        ))}
      </dl>

      <AfdelingNu orgId={orgId} mijn={mijn.data ?? []} />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Kaart titel={<><CalendarDays size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Vandaag in het huis')}</>}>
          {vandaag.length === 0 ? (
            <Leeg>
              {tt('Er staat vandaag niets gepland.')}{' '}
              {beheert || org.team_lead ? (
                <Link to="/zorg/activiteiten" className="font-semibold underline underline-offset-4">
                  {tt('Vul de vaste dag in')}
                </Link>
              ) : null}
            </Leeg>
          ) : (
            <ol className="space-y-1">
              {vandaag.map((i) => {
                const isVolgende = i.sleutel === volgende?.sleutel
                const voorbij = i.tijd < hhmm && !isVolgende
                return (
                  <li
                    key={i.sleutel}
                    className={`flex items-baseline gap-3 rounded-xl px-2 py-1.5 ${isVolgende ? 'bg-accent-soft' : ''} ${voorbij ? 'text-ink-faint' : ''}`}
                  >
                    <span className="w-14 shrink-0 whitespace-nowrap font-bold tabular-nums">{i.tijd}</span>
                    <span className="min-w-0 flex-1">
                      <span aria-hidden="true">{i.emoji || EMOJI[i.soort]} </span>
                      <span className={i.geannuleerd ? 'line-through' : 'font-semibold'}>{i.titel}</span>
                      <span className="text-sm text-ink-soft">
                        {i.department_id ? ` · ${namen[i.department_id] ?? ''}` : ` · ${tt('hele huis')}`}
                        {i.plaats ? ` · ${i.plaats}` : ''}
                        {i.geannuleerd ? ` · ${tt('gaat niet door')}` : ''}
                      </span>
                    </span>
                    {isVolgende ? <span className="shrink-0 text-xs font-bold uppercase text-accent-ink">{tt('straks')}</span> : null}
                  </li>
                )
              })}
            </ol>
          )}
        </Kaart>

        <div className="space-y-6">
          <Kaart titel={<><Megaphone size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Laatste nieuws')}</>}>
            {(nieuws.data ?? []).length === 0 ? (
              <p className="text-ink-soft">{tt('Nog geen nieuws aan de families.')}</p>
            ) : (
              <ul className="space-y-3">
                {(nieuws.data ?? []).slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <p className="font-semibold">{n.titel}</p>
                    <p className="text-sm text-ink-faint">
                      {n.department_id ? tt('Afdeling {naam}', { naam: namen[n.department_id] ?? '' }) : tt('Alle families')} · {dagEnUur(n.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {beheert || org.team_lead ? (
              <Link to="/zorg/nieuws" className="mt-3 inline-block text-sm font-semibold text-accent-ink underline underline-offset-4">
                {tt('Nieuw bericht')}
              </Link>
            ) : null}
          </Kaart>

          <Kaart titel={tt('Snel naar')}>
            <ul className="grid grid-cols-2 gap-2">
              {snel
                .filter((s) => s.zichtbaar)
                .map((s) => (
                  <li key={s.naar}>
                    <Link
                      to={s.naar}
                      className="flex min-h-[4.5rem] flex-col items-start justify-between rounded-2xl bg-surface-soft p-3 text-sm font-semibold hover:bg-accent-soft"
                    >
                      <s.icoon size={20} strokeWidth={1.75} aria-hidden="true" className="text-accent-ink" />
                      {s.naam}
                    </Link>
                  </li>
                ))}
            </ul>
          </Kaart>
        </div>
      </div>

      {beheert ? <Overzicht orgId={orgId} isBeheerder={isBeheerder} alleenAandacht /> : null}
    </div>
  )
}
