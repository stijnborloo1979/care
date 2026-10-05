import type { IconNaam } from '../components/Icon'
import { tt } from '../lib/uiTaal'

/**
 * De familienavigatie, met per item de permissie die nodig is om er iets
 * te kunnen (F3). Zonder permissie: het item is er altijd.
 *
 * Gemak, geen beveiliging: de database weigert hoe dan ook. Dit voorkomt
 * alleen dat iemand een scherm opent waar voor hem niets op staat of niets
 * werkt, zoals een zorgverlener in "Documenten".
 */
export interface NavItem {
  to: string
  end?: boolean
  label: string
  icoon: IconNaam
  /** Eén van deze permissies volstaat. */
  perm?: string[]
}

export const NAV: NavItem[] = [
  { to: '/familie', end: true, label: tt('Dashboard'), icoon: 'dashboard' },
  { to: '/familie/kalender', label: tt('Kalender'), icoon: 'agenda', perm: ['agenda.read'] },
  { to: '/familie/planning', label: tt('Routines'), icoon: 'planning', perm: ['routine.read'] },
  { to: '/familie/medicatie', label: tt('Medicatie'), icoon: 'medicatie', perm: ['medication.read'] },
  { to: '/familie/wie', label: tt('Familie'), icoon: 'wie', perm: ['people.read'] },
  { to: '/familie/week', label: tt('De week samen'), icoon: 'wie', perm: ['agenda.read'] },
  { to: '/familie/huis', label: tt('Home Memory'), icoon: 'vandaag' },
  { to: '/familie/fotos', label: tt('Herinneringen'), icoon: 'fotos', perm: ['memories.read'] },
  { to: '/familie/weetjes', label: tt('Weetjes'), icoon: 'weetjes', perm: ['notes.read'] },
  { to: '/familie/berichten', label: tt('Berichten'), icoon: 'praten', perm: ['message.family.read'] },
  { to: '/familie/taken', label: tt('Taken'), icoon: 'taken', perm: ['task.manage'] },
  { to: '/familie/boodschappen', label: tt('Boodschappen'), icoon: 'boodschappen', perm: ['shopping.read'] },
  { to: '/familie/analyse', label: tt('Analyse'), icoon: 'dashboard', perm: ['care_log.read', 'medication_log.read'] },
  { to: '/familie/indeling', label: tt('Indeling'), icoon: 'instellingen', perm: ['household.write'] },
  { to: '/familie/logboek', label: tt('Zorglogboek'), icoon: 'logboek', perm: ['care_log.read', 'care_log.write'] },
  { to: '/familie/documenten', label: tt('Documenten'), icoon: 'documenten', perm: ['document.read'] },
  { to: '/familie/delen', label: tt('Wie ziet wat'), icoon: 'wie' },
  { to: '/familie/instellingen', label: tt('Instellingen'), icoon: 'instellingen' },
]

/**
 * Wat iemand te zien krijgt. Zijn de rechten (nog) niet bekend — migratie
 * 49 niet gedraaid, of nog aan het laden — dan alles, zoals voorheen.
 */
export function zichtbareNav(nav: NavItem[], toegang: { bekend: boolean; can: (p: string) => boolean }): NavItem[] {
  // Zonder werkende `can` (oude cache): alles tonen, nooit vastlopen.
  if (!toegang.bekend || typeof toegang.can !== 'function') return nav
  return nav.filter((n) => !n.perm || n.perm.some((p) => toegang.can(p)))
}
