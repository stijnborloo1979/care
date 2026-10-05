/**
 * Een lijst uit Excel lezen: geplakt (tabs) of als CSV (; of ,).
 * Geen bibliotheek nodig: Excel kopiëren-en-plakken geeft tabs, en
 * "Opslaan als CSV" geeft in België puntkomma's.
 */
export function leesTabel(tekst: string): string[][] {
  const t = tekst.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const eerste = t.split('\n').find((r) => r.trim()) ?? ''
  const scheiding = eerste.includes('\t') ? '\t' : eerste.includes(';') ? ';' : ','
  const rijen: string[][] = []
  let rij: string[] = []
  let veld = ''
  let inAanhaling = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inAanhaling) {
      if (c === '"' && t[i + 1] === '"') {
        veld += '"'
        i++
      } else if (c === '"') inAanhaling = false
      else veld += c
    } else if (c === '"' && veld === '') inAanhaling = true
    else if (c === scheiding) {
      rij.push(veld)
      veld = ''
    } else if (c === '\n') {
      rij.push(veld)
      rijen.push(rij)
      rij = []
      veld = ''
    } else veld += c
  }
  if (veld !== '' || rij.length) {
    rij.push(veld)
    rijen.push(rij)
  }
  return rijen.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ''))
}

const normaal = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z]/g, '')

/** Welke kolom is wat? Herkent Nederlandse, Franse en Engelse koppen. */
const KOPPEN: Record<string, string[]> = {
  naam: ['naam', 'bewoner', 'volledigenaam', 'nom', 'resident', 'name', 'fullname', 'nomcomplet'],
  voornaam: ['voornaam', 'prenom', 'firstname'],
  achternaam: ['achternaam', 'familienaam', 'nomdefamille', 'lastname', 'surname'],
  afdeling: ['afdeling', 'unite', 'departement', 'service', 'unit', 'department', 'ward'],
  kamer: ['kamer', 'kamernummer', 'chambre', 'room', 'roomnumber'],
  familie: ['familie', 'emailfamilie', 'familieemail', 'emailcontact', 'contactpersoon', 'famille', 'emailfamille', 'family', 'familyemail'],
  email: ['email', 'emailadres', 'mail', 'adresseemail', 'courriel'],
  rol: ['rol', 'functie', 'role', 'fonction'],
}

export interface Kolommen {
  heeftKop: boolean
  index: Partial<Record<keyof typeof KOPPEN, number>>
}

export function herkenKolommen(kop: string[]): Kolommen {
  const index: Kolommen['index'] = {}
  kop.forEach((k, i) => {
    const n = normaal(k)
    for (const [veld, namen] of Object.entries(KOPPEN) as [keyof typeof KOPPEN, string[]][]) {
      if (index[veld] === undefined && namen.includes(n)) {
        index[veld] = i
        return
      }
    }
  })
  return { heeftKop: Object.keys(index).length > 0, index }
}

export interface BewonerRij {
  naam: string
  afdeling: string
  kamer: string
  familie: string
}

/** Bewoners: zonder kop is de volgorde naam, afdeling, kamer, e-mail familie. */
export function naarBewoners(tabel: string[][]): BewonerRij[] {
  if (tabel.length === 0) return []
  const k = herkenKolommen(tabel[0])
  const rijen = k.heeftKop ? tabel.slice(1) : tabel
  const i = k.heeftKop ? k.index : { naam: 0, afdeling: 1, kamer: 2, familie: 3 }
  const veld = (r: string[], n: number | undefined) => (n === undefined ? '' : (r[n] ?? '').trim())
  return rijen.map((r) => {
    const volledig = veld(r, i.naam)
    const naam = volledig || [veld(r, i.voornaam), veld(r, i.achternaam)].filter(Boolean).join(' ')
    const familie = veld(r, i.familie) || veld(r, i.email)
    return { naam, afdeling: veld(r, i.afdeling), kamer: veld(r, i.kamer), familie }
  })
}

export type ImportRol = 'org_admin' | 'coordinator' | 'caregiver'

/** "beheerder", "coördinateur", "caregiver", … → een rol; leeg = zorgkundige. */
export function herkenRol(s: string): ImportRol | null {
  const n = normaal(s)
  if (!n) return 'caregiver'
  if (['beheerder', 'admin', 'administrateur', 'gestionnaire', 'orgadmin', 'directie', 'directeur', 'director', 'manager'].includes(n)) return 'org_admin'
  if (['coordinator', 'coordinatrice', 'coordinateur', 'hoofdverpleegkundige', 'teamleider'].includes(n)) return 'coordinator'
  if (['zorgkundige', 'zorgmedewerker', 'verpleegkundige', 'medewerker', 'caregiver', 'carer', 'nurse', 'soignant', 'soignante', 'aidesoignant', 'aidesoignante', 'infirmier', 'infirmiere', 'staff'].includes(n)) return 'caregiver'
  return null
}

export interface MedewerkerRij {
  email: string
  rolTekst: string
  rol: ImportRol | null
}

/** Medewerkers: zonder kop is de volgorde e-mail, rol. */
export function naarMedewerkers(tabel: string[][]): MedewerkerRij[] {
  if (tabel.length === 0) return []
  const k = herkenKolommen(tabel[0])
  const rijen = k.heeftKop ? tabel.slice(1) : tabel
  const i = k.heeftKop ? k.index : { email: 0, rol: 1 }
  return rijen.map((r) => {
    const email = (i.email !== undefined ? r[i.email] : '')?.trim() ?? ''
    const rolTekst = (i.rol !== undefined ? r[i.rol] : '')?.trim() ?? ''
    return { email, rolTekst, rol: herkenRol(rolTekst) }
  })
}

export const geldigAdres = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

/** Een voorbeeldbestand voor Excel (puntkomma, met BOM). */
export function sjabloon(soort: 'bewoners' | 'medewerkers'): string {
  const regels =
    soort === 'bewoners'
      ? ['Naam;Afdeling;Kamer;E-mail familie', 'Rita Peeters;Linde;101;els.peeters@voorbeeld.be', 'Jos Maes;Linde;102;']
      : ['E-mail;Rol', 'an.janssens@voorbeeld.be;zorgkundige', 'piet.claes@voorbeeld.be;coördinator']
  return '﻿' + regels.join('\r\n')
}
