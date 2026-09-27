import { Mic } from 'lucide-react'
import { t } from '../../lib/i18n'
import { useVoice } from './voiceStore'

/**
 * De centrale knop in de navigatie. Rond, groter dan de rest en in de
 * accentkleur: het is de weg terug voor wie niet meer weet waar te kijken.
 */
export default function VoiceButton() {
  const openen = useVoice((s) => s.openen)
  return (
    <button
      type="button"
      onClick={openen}
      aria-label="LifeAngle Voice: praat met mij"
      className="relative -mt-7 flex min-w-0 flex-1 flex-col items-center justify-end gap-0.5 text-sm font-semibold text-accent-ink"
    >
      <span className="grid h-[4.25rem] w-[4.25rem] place-items-center rounded-full border-4 border-bg bg-accent-ink text-white shadow-lift">
        <Mic size={30} aria-hidden="true" />
      </span>
      {t('voice.knop')}
    </button>
  )
}
