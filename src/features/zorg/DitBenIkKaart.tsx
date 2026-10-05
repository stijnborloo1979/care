import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { getProfiel } from '../../services/profiel'
import { getPeople } from '../../services/people'
import { getNotes } from '../../services/notes'
import { getVerhalenAlleen } from '../../services/stories'
import { Kaart } from './ui'
import { tt } from '../../lib/uiTaal'

/**
 * "Dit ben ik" voor het zorgteam: wie de bewoner is, in één blik. Wat de
 * familie invulde (hoe aanspreken, wat rust geeft, wat te vermijden), wie
 * er bij haar hoort, wat ze graag heeft en een stukje levensverhaal.
 * Alleen wat het zorgteam ook nu al mag lezen; de database bepaalt dat.
 */
export default function DitBenIkKaart({ hh, naam }: { hh: string; naam: string }) {
  const opt = { enabled: !!hh, retry: false, staleTime: 5 * 60_000 }
  const profiel = useQuery({ ...opt, queryKey: ['zorg', 'profiel', hh], queryFn: () => getProfiel(hh) })
  const mensen = useQuery({ ...opt, queryKey: ['zorg', 'mensen', hh], queryFn: () => getPeople(hh) })
  const weetjes = useQuery({ ...opt, queryKey: ['zorg', 'weetjes', hh], queryFn: () => getNotes(hh) })
  const verhalen = useQuery({ ...opt, queryKey: ['zorg', 'verhalen', hh], queryFn: () => getVerhalenAlleen(hh) })

  const p = profiel.data
  const familie = (mensen.data ?? []).filter((m) => m.kind === 'family' && m.name)
  const voorkeuren = (weetjes.data ?? []).filter((n) => n.category === 'voorkeuren').slice(0, 4)
  const stukje = (verhalen.data ?? []).find((v) => v.shared !== false && v.body?.trim())
  const aanspreken = p?.noemNaam?.trim()

  const velden: [string, string | undefined][] = [
    [tt('Zo praat je best met mij'), p?.omgang],
    [tt('Als ik onrustig ben, helpt dit'), p?.rust],
    [tt('Hier raak ik van overstuur'), p?.vermijden],
  ]
  const ingevuld = velden.filter(([, t]) => t?.trim())
  const iets = aanspreken || ingevuld.length > 0 || familie.length > 0 || voorkeuren.length > 0 || stukje

  return (
    <Kaart titel={<><Sparkles size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Dit ben ik')}</>}>
      {!iets ? (
        <p className="rounded-2xl bg-surface-soft px-4 py-3 text-ink-soft">
          {tt('De familie vulde nog niets in. Vraag hen om "Dit ben ik" aan te vullen in de app.')}
        </p>
      ) : (
        <div className="space-y-4">
          {aanspreken ? (
            <p className="text-lg">
              {tt('Noem mij')} <strong>{aanspreken}</strong>.
            </p>
          ) : null}
          {ingevuld.length > 0 ? (
            <dl className="space-y-2">
              {ingevuld.map(([label, tekst]) => (
                <div key={label} className="rounded-2xl bg-accent-soft px-4 py-3">
                  <dt className="text-sm font-semibold text-accent-ink">{label}</dt>
                  <dd className="mt-0.5 whitespace-pre-wrap">{tekst}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {familie.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{tt('Wie bij mij hoort')}</h3>
              <p className="mt-1">{familie.map((m) => `${m.name} (${m.relation.toLowerCase()})`).join(', ')}</p>
            </div>
          ) : null}
          {voorkeuren.length > 0 ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{tt('Wat ik graag heb')}</h3>
              <ul className="mt-1 space-y-1">
                {voorkeuren.map((n) => (
                  <li key={n.id}>
                    <strong>{n.title}</strong>
                    {n.body ? ` — ${n.body}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {stukje ? (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{tt('Uit mijn verhaal')}</h3>
              <p className="mt-1 line-clamp-4 italic">“{stukje.body}”</p>
            </div>
          ) : null}
        </div>
      )}
      <p className="mt-3 text-xs text-ink-faint">{tt('Ingevuld door {naam} en de familie.', { naam })}</p>
    </Kaart>
  )
}
