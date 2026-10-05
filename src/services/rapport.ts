import { supabase } from '../lib/supabase'
import { ontbrekendeFunctie } from '../lib/ontbrekendeFunctie'
import { tt } from '../lib/uiTaal'

/** Rapporten (83): alleen aantallen. */
export interface RapportRij {
  afdeling: string | null
  sleutel: string
  waarde: number | null
}

export async function orgRapport(org: string, van: string, tot: string): Promise<RapportRij[] | null> {
  const { data, error } = await supabase.rpc('org_rapport', { org, van, tot })
  if (error) {
    if (ontbrekendeFunctie(error)) return null
    throw error
  }
  return ((data ?? []) as RapportRij[]).map((r) => ({ ...r, waarde: r.waarde === null ? null : Number(r.waarde) }))
}

export const LABELS: Record<string, { label: string; uitleg: string }> = {
  bewoners: { label: tt('Bewoners'), uitleg: tt('Nu in het woonzorgcentrum') },
  opnames: { label: tt('Opnames'), uitleg: tt('Nieuwe bewoners in deze periode') },
  vertrekken: { label: tt('Vertrekken'), uitleg: tt('Verblijven die afliepen') },
  activiteiten: { label: tt('Activiteiten'), uitleg: tt('Gepland, zonder de geannuleerde') },
  aanwezig: { label: tt('Aanwezigheden'), uitleg: tt('Keer dat een bewoner erbij was') },
  deelnemers: { label: tt('Deelnemers'), uitleg: tt('Verschillende bewoners die meededen') },
  bezoeken: { label: tt('Bezoeken'), uitleg: tt('Vastgelegd in "Wie was er hier?"') },
  uitstappen: { label: tt('Uitstappen'), uitleg: tt('Met de familie, echt vertrokken') },
  nieuws: { label: tt('Nieuwsberichten'), uitleg: tt('Verstuurd aan de families') },
}

export const VOLGORDE = ['bewoners', 'opnames', 'vertrekken', 'activiteiten', 'aanwezig', 'deelnemers', 'bezoeken', 'uitstappen', 'nieuws']

/** Eén periode: "deze maand", "vorige maand" … als YYYY-MM-DD van/tot. */
export function periode(soort: 'deze-maand' | 'vorige-maand' | 'dit-jaar' | '30-dagen', nu: Date = new Date()): { van: string; tot: string } {
  const p = (n: number) => String(n).padStart(2, '0')
  const dag = (d: Date) => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const j = nu.getFullYear()
  const m = nu.getMonth()
  if (soort === 'deze-maand') return { van: dag(new Date(j, m, 1)), tot: dag(nu) }
  if (soort === 'vorige-maand') return { van: dag(new Date(j, m - 1, 1)), tot: dag(new Date(j, m, 0)) }
  if (soort === 'dit-jaar') return { van: dag(new Date(j, 0, 1)), tot: dag(nu) }
  return { van: dag(new Date(nu.getTime() - 29 * 864e5)), tot: dag(nu) }
}

/** CSV voor Excel (puntkomma, zoals in België gebruikelijk). */
export function naarCsv(rijen: RapportRij[], van: string, tot: string): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const regels = [[tt('Periode'), tt('Afdeling'), tt('Cijfer'), tt('Waarde')].join(';')]
  const gesorteerd = rijen
    .slice()
    .sort((a, b) => VOLGORDE.indexOf(a.sleutel) - VOLGORDE.indexOf(b.sleutel) || (a.afdeling ?? '').localeCompare(b.afdeling ?? ''))
  for (const r of gesorteerd) {
    regels.push([`${van} – ${tot}`, r.afdeling ?? tt('Totaal'), LABELS[r.sleutel]?.label ?? r.sleutel, r.waarde === null ? tt('niet getoond (minder dan 5 bewoners of korter dan 28 dagen)') : String(r.waarde)].map(esc).join(';'))
  }
  return '﻿' + regels.join('\r\n')
}
