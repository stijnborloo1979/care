import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MessageCircleQuestion } from 'lucide-react'
import { mijnBewoners } from './zorgApi'
import { ongezien } from './bewonerBerichten'
import { Kaart } from './ui'
import { tt } from '../../lib/uiTaal'

/**
 * Open vragen per bewoner, alleen van mijn bewoners in deze organisatie.
 * De database toont al alleen wat ik mag zien; dit houdt ook een tweede
 * WZC of mijn eigen huishouden buiten de telling.
 */
export function useOngezien(orgId: string | undefined) {
  const open = useQuery({ queryKey: ['zorg', 'ongezien'], queryFn: ongezien, refetchInterval: 60_000 })
  const mijn = useQuery({
    queryKey: ['zorg', 'mijn-bewoners', orgId],
    enabled: !!orgId,
    queryFn: () => mijnBewoners(orgId!),
  })
  const data: Record<string, number> = {}
  for (const b of mijn.data ?? []) if (open.data?.[b.household_id]) data[b.household_id] = open.data[b.household_id]
  return { data, totaal: Object.values(data).reduce((a, n) => a + n, 0) }
}

/**
 * Bij de dienstwissel: welke bewoners nog een vraag hebben waar niemand op
 * reageerde (68). Alleen mijn bewoners; zonder open vragen niets.
 */
export default function OpenVragen({ orgId }: { orgId: string }) {
  const open = useOngezien(orgId)
  const bewoners = useQuery({ queryKey: ['zorg', 'mijn-bewoners', orgId], queryFn: () => mijnBewoners(orgId) })
  const rijen = (bewoners.data ?? []).filter((b) => (open.data[b.household_id] ?? 0) > 0)
  if (rijen.length === 0) return null
  return (
    <Kaart titel={<><MessageCircleQuestion size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Open vragen van bewoners')}</>}>
      <ul className="space-y-2">
        {rijen.map((b) => {
          const n = open.data[b.household_id]
          return (
            <li key={b.household_id}>
              <Link
                to={`/zorg/bewoner/${b.household_id}`}
                className="flex min-h-touch items-center justify-between gap-3 rounded-2xl bg-surface-soft px-4 py-3 hover:bg-surface-deep"
              >
                <span className="min-w-0 truncate font-semibold">{b.naam}</span>
                <span className="shrink-0 rounded-pill bg-alert px-2.5 py-1 text-xs font-bold text-white">
                  {n === 1 ? tt('{n} vraag', { n }) : tt('{n} vragen', { n })}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </Kaart>
  )
}
