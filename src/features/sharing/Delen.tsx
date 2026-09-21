import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, ShieldCheck, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useHousehold, type SupportLevel } from '../household/useHousehold'

const NIVEAUS: { id: SupportLevel; titel: string; uitleg: string; ziet: string }[] = [
  {
    id: 'zelf',
    titel: 'Ik doe het zelf',
    uitleg: 'Je gebruikt Thuis voor jezelf. Familie kan mee plannen, maar kijkt niet mee.',
    ziet: 'Familie ziet de agenda. Niet je medicatie, logboek, notities of locatie. Geen meldingen.',
  },
  {
    id: 'samen',
    titel: 'We doen het samen',
    uitleg: 'Familie helpt mee met plannen en invullen, en kan zien hoe je dag verloopt.',
    ziet: 'Familie ziet de agenda, medicatie en het logboek. Nog steeds geen meldingen.',
  },
  {
    id: 'ondersteund',
    titel: 'Help me meer',
    uitleg: 'Familie krijgt een seintje als er iets afwijkt, zoals vergeten medicatie.',
    ziet: 'Familie ziet alles wat nodig is, en krijgt meldingen bij afwijkingen.',
  },
]

const ROL: Record<string, string> = {
  admin: 'Beheerder',
  member: 'Familie',
  caregiver: 'Zorgverlener',
  person: 'Tablet van de persoon',
}

type Lid = { profile_id: string; role: string; profile: { full_name: string | null } | null }

/**
 * Vertrouwen hangt niet af van beloftes, maar van kunnen zien wat er
 * gebeurt. Dit scherm zegt in gewone taal wie wat ziet — en de persoon
 * beslist, niet de familie.
 */
export default function Delen() {
  const { household } = useHousehold()
  const queryClient = useQueryClient()
  const hh = household?.household_id ?? ''
  const ikBenHet = !!household?.is_self
  const isBeheerder = household?.role === 'admin'

  const { data: leden } = useQuery({
    queryKey: ['members', hh],
    enabled: !!hh,
    queryFn: async (): Promise<Lid[]> => {
      const { data, error } = await supabase
        .from('membership')
        .select('profile_id, role, profile:profile_id (full_name)')
        .eq('household_id', hh)
      if (error) throw error
      return (data ?? []) as unknown as Lid[]
    },
  })

  const ververs = () => queryClient.invalidateQueries({ queryKey: ['households'] })

  const niveau = useMutation({
    mutationFn: async (n: SupportLevel) => {
      const { data, error } = await supabase.rpc('set_support_level', { hh, niveau: n })
      if (error) throw error
      return data as string
    },
    onSuccess: ververs,
  })

  const antwoord = useMutation({
    mutationFn: async (akkoord: boolean) => {
      const { error } = await supabase.rpc('answer_support_request', { hh, akkoord })
      if (error) throw error
    },
    onSuccess: ververs,
  })

  const delen = useMutation({
    mutationFn: async (aan: boolean) => {
      const { error } = await supabase.rpc('set_share_quick_notes', { hh, delen: aan })
      if (error) throw error
    },
    onSuccess: ververs,
  })

  const verwijder = useMutation({
    mutationFn: async (profileId: string) => {
      const { error } = await supabase
        .from('membership')
        .delete()
        .eq('household_id', hh)
        .eq('profile_id', profileId)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', hh] }),
  })

  if (!household) return null

  const huidig = household.support_level
  const gevraagd = household.requested_support_level
  const voornaam = household.person_name.split(' ')[0]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          {ikBenHet ? 'Wie ziet wat' : `Wat ${voornaam} deelt`}
        </h1>
        <p className="mt-1 text-ink-soft">
          {ikBenHet
            ? 'Jij beslist hoeveel je familie meekijkt. Minder kan altijd; meer vraagt jouw ja.'
            : `${voornaam} beslist hoeveel familie meekijkt. Jij kan meer ondersteuning voorstellen.`}
        </p>
      </header>

      {/* Een openstaand voorstel komt eerst: dat is wat er nu een antwoord vraagt. */}
      {gevraagd && ikBenHet ? (
        <section className="rounded-card bg-accent-soft p-6 shadow-lift ring-1 ring-accent/25">
          <p className="text-lg font-bold">Je familie stelt voor om meer te helpen</p>
          <p className="mt-1 text-ink-soft">
            Voorstel: <strong>{NIVEAUS.find((n) => n.id === gevraagd)?.titel}</strong>.{' '}
            {NIVEAUS.find((n) => n.id === gevraagd)?.ziet}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => antwoord.mutate(true)}
              className="min-h-touch flex-1 rounded-pill bg-accent-ink px-5 font-semibold text-white"
            >
              Ja, dat is goed
            </button>
            <button
              onClick={() => antwoord.mutate(false)}
              className="min-h-touch flex-1 rounded-pill border-[1.5px] border-line-strong bg-surface px-5 font-semibold"
            >
              Nee, nog niet
            </button>
          </div>
        </section>
      ) : null}

      {gevraagd && !ikBenHet ? (
        <p className="rounded-card bg-surface-soft p-4 text-ink-soft">
          Je voorstel voor <strong>{NIVEAUS.find((n) => n.id === gevraagd)?.titel}</strong> wacht op
          het antwoord van {voornaam}.
        </p>
      ) : null}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
          Hoeveel hulp
        </h2>
        {NIVEAUS.map((n) => {
          const actief = n.id === huidig
          const kanKiezen = ikBenHet || isBeheerder
          return (
            <button
              key={n.id}
              disabled={!kanKiezen || actief || niveau.isPending}
              onClick={() => niveau.mutate(n.id)}
              aria-pressed={actief}
              className={`block w-full rounded-card p-5 text-left shadow-card ${
                actief ? 'bg-accent-soft ring-2 ring-accent' : 'bg-surface'
              } disabled:cursor-default`}
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-lg font-bold">{n.titel}</span>
                {actief ? (
                  <span className="rounded-pill bg-accent-ink px-3 py-0.5 text-sm font-semibold text-white">
                    nu
                  </span>
                ) : null}
              </span>
              <span className="mt-1 block text-ink-soft">{n.uitleg}</span>
              <span className="mt-2 block text-sm text-ink-faint">{n.ziet}</span>
            </button>
          )
        })}
        {niveau.data === 'aangevraagd' ? (
          <p className="text-sm font-semibold text-accent-ink">
            Voorgesteld. {voornaam} krijgt de vraag op het eigen scherm.
          </p>
        ) : null}
        {niveau.error ? (
          <p role="alert" className="text-sm text-alert">
            {niveau.error instanceof Error ? niveau.error.message : 'Dat lukte niet.'}
          </p>
        ) : null}
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              {household.share_quick_notes ? (
                <Eye size={20} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <EyeOff size={20} strokeWidth={1.75} aria-hidden="true" />
              )}
              Wat ik laat onthouden
            </h2>
            <p className="mt-1 text-sm text-ink-soft">
              {household.share_quick_notes
                ? 'Familie kan zien wat je via "Onthoud dit" noteert, zodra ze meekijken.'
                : 'Alleen jij ziet wat je via "Onthoud dit" noteert.'}
            </p>
          </div>
          {ikBenHet || (isBeheerder && !leden?.some((l) => l.role === 'person')) ? (
            <button
              role="switch"
              aria-checked={household.share_quick_notes}
              aria-label="Notities delen met familie"
              onClick={() => delen.mutate(!household.share_quick_notes)}
              className={`relative h-9 w-16 shrink-0 rounded-pill border-[1.5px] ${
                household.share_quick_notes
                  ? 'border-accent bg-accent'
                  : 'border-line-strong bg-surface-deep'
              }`}
            >
              <span
                className={`absolute top-1 h-6 w-6 rounded-full bg-surface shadow-card transition-transform ${
                  household.share_quick_notes ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-card bg-surface p-6 shadow-card">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Users size={20} strokeWidth={1.75} aria-hidden="true" />
          Wie er bij hoort
        </h2>
        <ul className="mt-3 space-y-2">
          {(leden ?? []).map((l) => (
            <li
              key={l.profile_id}
              className="flex items-center gap-3 rounded-2xl bg-surface-soft px-4 py-3"
            >
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{l.profile?.full_name ?? 'Onbekend'}</span>
                <span className="text-sm text-ink-soft">{ROL[l.role] ?? l.role}</span>
              </span>
              {isBeheerder && l.role !== 'admin' ? (
                <button
                  onClick={() => {
                    if (confirm(`${l.profile?.full_name ?? 'Deze persoon'} geen toegang meer geven?`))
                      verwijder.mutate(l.profile_id)
                  }}
                  className="shrink-0 rounded-pill border border-line px-3 py-1 text-sm font-semibold text-ink-soft"
                >
                  Toegang weghalen
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
