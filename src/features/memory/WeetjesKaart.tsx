import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { CATEGORIEEN } from '../../services/notes'
import { useNotes } from '../notes/useNotes'
import { t } from '../../lib/i18n'

/**
 * De ingang naar de weetjes, als tegel op het dagscherm.
 *
 * Weetjes zijn de antwoorden op vragen die terugkomen: waar de
 * reservesleutel ligt, hoe de koffie moet. Ze stonden alleen achter "In
 * huis" — twee tikken diep, en onder een kop die over het huis gaat en
 * niet over weetjes. Wie zich net afvraagt waar iets ligt, zoekt daar niet.
 *
 * Drie stuks op het scherm, niet alle: dit is een ingang, geen lijst. Wat
 * je hier ziet, kan je meteen lezen; de rest staat één tik verder.
 */
export default function WeetjesKaart({ householdId }: { householdId: string }) {
  const { data } = useNotes(householdId)
  const alle = data ?? []
  if (alle.length === 0) return null

  const eerste = alle.slice(0, 3)
  const rest = alle.length - eerste.length

  return (
    <section aria-labelledby="weetjes" className="rounded-card bg-surface p-5 shadow-card">
      <h2 id="weetjes" className="text-base font-bold text-ink-faint">
        {t('weetjes.titel')}
      </h2>

      <ul className="mt-2 list-none space-y-3 p-0">
        {eerste.map((n) => {
          const cat = CATEGORIEEN.find((c) => c.waarde === n.category)
          return (
            <li key={n.id} className="flex items-start gap-3">
              <span aria-hidden="true" className="text-2xl leading-none">
                {cat?.emoji ?? '📌'}
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-snug">{n.title}</span>
                <span className="block text-ink-soft">{n.body}</span>
              </span>
            </li>
          )
        })}
      </ul>

      {rest > 0 ? (
        <Link
          to="/weetjes"
          className="mt-4 inline-flex min-h-touch items-center gap-2 rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
        >
          Nog {rest} {rest === 1 ? 'weetje' : 'weetjes'}
          <Icon naam="verder" size={18} />
        </Link>
      ) : null}
    </section>
  )
}
