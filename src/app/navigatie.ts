import type { IconNaam } from '../components/Icon'

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
  { to: '/familie', end: true, label: 'Dashboard', icoon: 'dashboard' },
  { to: '/familie/kalender', label: 'Kalender', icoon: 'agenda', perm: ['agenda.read'] },
  { to: '/familie/planning', label: 'Routines', icoon: 'planning', perm: ['routine.read'] },
  { to: '/familie/medicatie', label: 'Medicatie', icoon: 'medicatie', perm: ['medication.read'] },
  { to: '/familie/wie', label: 'Familie', icoon: 'wie', perm: ['people.read'] },
  { to: '/familie/week', label: 'De week samen', icoon: 'wie', perm: ['agenda.read'] },
  { to: '/familie/huis', label: 'Home Memory', icoon: 'vandaag' },
  { to: '/familie/fotos', label: 'Herinneringen', icoon: 'fotos', perm: ['memories.read'] },
  { to: '/familie/weetjes', label: 'Weetjes', icoon: 'weetjes', perm: ['notes.read'] },
  { to: '/familie/berichten', label: 'Berichten', icoon: 'praten', perm: ['message.family.read'] },
  { to: '/familie/taken', label: 'Taken', icoon: 'taken', perm: ['task.manage'] },
  { to: '/familie/boodschappen', label: 'Boodschappen', icoon: 'boodschappen', perm: ['shopping.read'] },
  { to: '/familie/analyse', label: 'Analyse', icoon: 'dashboard', perm: ['care_log.read', 'medication_log.read'] },
  { to: '/familie/indeling', label: 'Indeling', icoon: 'instellingen', perm: ['household.write'] },
  { to: '/familie/logboek', label: 'Zorglogboek', icoon: 'logboek', perm: ['care_log.read', 'care_log.write'] },
  { to: '/familie/documenten', label: 'Documenten', icoon: 'documenten', perm: ['document.read'] },
  { to: '/familie/delen', label: 'Wie ziet wat', icoon: 'wie' },
  { to: '/familie/instellingen', label: 'Instellingen', icoon: 'instellingen' },
]

/**
 * Wat iemand te zien krijgt. Zijn de rechten (nog) niet bekend — migratie
 * 49 niet gedraaid, of nog aan het laden — dan alles, zoals voorheen.
 */
export function zichtbareNav(nav: NavItem[], toegang: { bekend: boolean; can: (p: string) => boolean }): NavItem[] {
  if (!toegang.bekend) return nav
  return nav.filter((n) => !n.perm || n.perm.some((p) => toegang.can(p)))
}
