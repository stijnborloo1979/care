import {
  ArrowLeft,
  Brain,
  Calendar,
  Camera,
  Check,
  ChevronRight,
  FileText,
  House,
  LayoutDashboard,
  LifeBuoy,
  Mic,
  NotebookPen,
  Pill,
  Play,
  Plus,
  Repeat,
  Settings,
  Users,
  Video,
  Volume2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Eén plaats waar de iconen staan, zodat een scherm nooit hoeft te weten
 * uit welke bibliotheek ze komen. Emoji blijven alleen waar familie ze
 * zelf kiest, zoals bij een ding in huis: die renderen op elk toestel
 * anders en zijn niet uit te lijnen met de rest.
 */
const ICONEN = {
  vandaag: House,
  wie: Users,
  memory: Brain,
  help: LifeBuoy,
  praten: Mic,
  dashboard: LayoutDashboard,
  planning: Repeat,
  agenda: Calendar,
  medicatie: Pill,
  logboek: NotebookPen,
  documenten: FileText,
  fotos: Camera,
  weetjes: NotebookPen,
  instellingen: Settings,
  bellen: Video,
  afspelen: Play,
  voorlezen: Volume2,
  gedaan: Check,
  verder: ChevronRight,
  terug: ArrowLeft,
  nieuw: Plus,
} satisfies Record<string, LucideIcon>

export type IconNaam = keyof typeof ICONEN

export default function Icon({
  naam,
  size = 22,
  className = '',
}: {
  naam: IconNaam
  size?: number
  className?: string
}) {
  const Component = ICONEN[naam]
  // Overal dezelfde lijndikte: dat is wat een set samenhangend maakt.
  return <Component size={size} strokeWidth={1.75} className={className} aria-hidden="true" />
}
