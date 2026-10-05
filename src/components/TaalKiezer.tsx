import { Languages } from 'lucide-react'
import { UI_TALEN, kiesUiTaal, tt, uiTaal } from '../lib/uiTaal'

/** De taal van de schermen kiezen (niet die van de tablet). */
export default function TaalKiezer({ compact = false }: { compact?: boolean }) {
  return (
    <label className={`flex items-center gap-2 ${compact ? 'px-2 py-1.5 text-sm' : ''}`}>
      <Languages size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-ink-soft" />
      <span className="sr-only">{tt('Taal')}</span>
      <select
        value={uiTaal()}
        onChange={(e) => kiesUiTaal(e.target.value as 'nl' | 'fr' | 'en')}
        className="min-h-[2.25rem] flex-1 rounded-xl border border-line bg-surface px-2 text-sm font-semibold"
      >
        {UI_TALEN.map((t) => (
          <option key={t.code} value={t.code}>
            {t.naam}
          </option>
        ))}
      </select>
    </label>
  )
}
