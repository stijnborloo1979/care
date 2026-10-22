/**
 * Het weekmenu zonder React en zonder database (108). Hier zit alles wat
 * fouten kan maken: het inlezen van het bestand, de datums en de allergenen.
 * Zo is het met tests te controleren en blijft het bij het opslaan hetzelfde.
 */

/** De 14 allergenen uit de EU-verordening (1169/2011). */
export const ALLERGENEN = [
  'gluten', 'schaaldieren', 'eieren', 'vis', 'pinda', 'soja', 'melk', 'noten',
  'selderij', 'mosterd', 'sesam', 'sulfiet', 'lupine', 'weekdieren',
] as const

export interface MenuDag {
  datum: string // yyyy-mm-dd
  soep: string | null
  soep_allergenen: string | null
  middag: string | null
  middag_allergenen: string | null
  dessert: string | null
  dessert_allergenen: string | null
  notitie: string | null
}

export interface MenuImport {
  dagen: MenuDag[]
  fouten: string[]
  waarschuwingen: string[]
}

const ZONDER_ACCENT: Record<string, string> = { é: 'e', è: 'e', ë: 'e', ï: 'i', ö: 'o', ü: 'u', ç: 'c' }

/** Kolomnamen vergelijken we zonder hoofdletters, accenten en dubbele spaties. */
export function kolomNaam(tekst: string): string {
  return tekst
    .toLowerCase()
    .replace(/[éèëïöüç]/g, (c) => ZONDER_ACCENT[c] ?? c)
    .replace(/\s+/g, ' ')
    .trim()
}

/** Eén CSV-regel splitsen, met aanhalingstekens. Puntkomma of komma. */
function splitsRegel(regel: string, scheiding: string): string[] {
  const velden: string[] = []
  let veld = ''
  let aangehaald = false
  for (let i = 0; i < regel.length; i++) {
    const c = regel[i]
    if (aangehaald) {
      if (c === '"' && regel[i + 1] === '"') {
        veld += '"'
        i++
      } else if (c === '"') {
        aangehaald = false
      } else {
        veld += c
      }
    } else if (c === '"') {
      aangehaald = true
    } else if (c === scheiding) {
      velden.push(veld)
      veld = ''
    } else {
      veld += c
    }
  }
  velden.push(veld)
  return velden.map((v) => v.trim())
}

/** Puntkomma of komma: wat de kopregel het meest gebruikt. */
export function scheidingsteken(eersteRegel: string): string {
  const puntkomma = (eersteRegel.match(/;/g) ?? []).length
  const komma = (eersteRegel.match(/,/g) ?? []).length
  return puntkomma >= komma ? ';' : ','
}

/** Een datum als yyyy-mm-dd, dd-mm-yyyy of dd/mm/yyyy. Null als het geen echte datum is. */
export function leesDatum(tekst: string): string | null {
  const t = tekst.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  const bel = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t)
  let j = 0
  let m = 0
  let d = 0
  if (iso) {
    j = Number(iso[1])
    m = Number(iso[2])
    d = Number(iso[3])
  } else if (bel) {
    d = Number(bel[1])
    m = Number(bel[2])
    j = Number(bel[3])
  } else {
    return null
  }
  const dat = new Date(Date.UTC(j, m - 1, d))
  if (dat.getUTCFullYear() !== j || dat.getUTCMonth() !== m - 1 || dat.getUTCDate() !== d) return null
  return `${j}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Allergenen als lijst: gescheiden door komma's of puntkomma's, zonder dubbele. */
export function leesAllergenen(tekst: string | null | undefined): string[] {
  if (!tekst) return []
  const lijst = tekst
    .split(/[,;]/)
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(lijst)]
}

/** Welke genoemde allergenen staan niet in de lijst van de 14? Dat is een waarschuwing, geen fout. */
export function onbekendeAllergenen(lijst: string[]): string[] {
  return lijst.filter((a) => !(ALLERGENEN as readonly string[]).includes(a))
}

/** Het bestand inlezen en controleren. Geeft ook terug wat niet kon worden opgeslagen. */
export function leesMenuBestand(tekst: string, { magAllergenen }: { magAllergenen: boolean }): MenuImport {
  const fouten: string[] = []
  const waarschuwingen: string[] = []
  const regels = tekst
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((r) => r.trim() !== '')

  if (regels.length === 0) {
    return { dagen: [], fouten: ['Het bestand is leeg.'], waarschuwingen }
  }

  const scheiding = scheidingsteken(regels[0])
  const kop = splitsRegel(regels[0], scheiding).map(kolomNaam)
  const kolom = (namen: string[]) => kop.findIndex((k) => namen.includes(k))
  const idx = {
    datum: kolom(['datum', 'dag']),
    soep: kolom(['soep']),
    soepAll: kolom(['allergenen soep']),
    middag: kolom(['middagmaal', 'middag']),
    middagAll: kolom(['allergenen middagmaal', 'allergenen middag']),
    dessert: kolom(['dessert']),
    dessertAll: kolom(['allergenen dessert']),
    notitie: kolom(['notitie', 'opmerking']),
  }

  if (idx.datum < 0) {
    fouten.push('De kolom "Datum" ontbreekt. Gebruik het sjabloon uit de handleiding.')
    return { dagen: [], fouten, waarschuwingen }
  }

  if (!magAllergenen && (idx.soepAll >= 0 || idx.middagAll >= 0 || idx.dessertAll >= 0)) {
    waarschuwingen.push('De allergenenkolommen worden overgeslagen. Die vult de keuken of een coördinator in.')
  }

  const gezien = new Set<string>()
  const dagen: MenuDag[] = []

  regels.slice(1).forEach((regel, i) => {
    const regelNr = i + 2
    const velden = splitsRegel(regel, scheiding)
    const cel = (k: number) => (k >= 0 && k < velden.length ? velden[k] : '')
    const waarde = (k: number) => {
      const v = cel(k)
      return v === '' ? null : v
    }

    const ruw = cel(idx.datum)
    const datum = leesDatum(ruw)
    if (!datum) {
      fouten.push(`Regel ${regelNr}: "${ruw}" is geen geldige datum.`)
      return
    }
    if (gezien.has(datum)) {
      fouten.push(`Regel ${regelNr}: ${datum} komt twee keer voor.`)
      return
    }
    gezien.add(datum)

    const soep = waarde(idx.soep)
    const middag = waarde(idx.middag)
    const dessert = waarde(idx.dessert)
    if (!soep && !middag && !dessert) {
      // Een lege dag is geen fout: de keuken serveert die dag misschien niets.
      waarschuwingen.push(`Regel ${regelNr}: ${datum} heeft geen gerechten.`)
    }

    const alle = [idx.soepAll, idx.middagAll, idx.dessertAll]
      .map((k) => leesAllergenen(waarde(k)))
      .flat()
    const onbekend = onbekendeAllergenen(alle)
    if (onbekend.length > 0) {
      waarschuwingen.push(`Regel ${regelNr}: onbekende allergeen "${[...new Set(onbekend)].join('", "')}". Controleer de spelling.`)
    }

    const allergeenTekst = (k: number) => (magAllergenen ? waarde(k) : null)
    dagen.push({
      datum,
      soep,
      soep_allergenen: allergeenTekst(idx.soepAll),
      middag,
      middag_allergenen: allergeenTekst(idx.middagAll),
      dessert,
      dessert_allergenen: allergeenTekst(idx.dessertAll),
      notitie: waarde(idx.notitie),
    })
  })

  dagen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0))
  if (dagen.length === 0 && fouten.length === 0) {
    fouten.push('Er staat geen enkele dag in het bestand.')
  }
  return { dagen, fouten, waarschuwingen }
}

/** Maandag van de week waarin deze datum valt (yyyy-mm-dd). */
export function maandagVan(datum: string): string {
  const [j, m, d] = datum.split('-').map(Number)
  const dat = new Date(Date.UTC(j, m - 1, d))
  const weekdag = (dat.getUTCDay() + 6) % 7 // maandag = 0
  dat.setUTCDate(dat.getUTCDate() - weekdag)
  return dat.toISOString().slice(0, 10)
}

/** De zeven dagen van een week, te beginnen op de maandag. */
export function weekDagen(maandag: string): string[] {
  const [j, m, d] = maandag.split('-').map(Number)
  return Array.from({ length: 7 }, (_, i) => {
    const dat = new Date(Date.UTC(j, m - 1, d + i))
    return dat.toISOString().slice(0, 10)
  })
}

/** De datum van vandaag in een tijdzone, als yyyy-mm-dd. Niet met toISOString: dat geeft UTC. */
export function datumVandaag(nu: Date, tijdzone = 'Europe/Brussels'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tijdzone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu)
}

/** Het menu van vandaag voor op de tablet: alleen als het bevestigd is en van vandaag. */
export function menuVoorBewoners<T extends { datum: string; status: string }>(rijen: T[], vandaag: string): T | null {
  return rijen.find((r) => r.datum === vandaag && r.status === 'gepubliceerd') ?? null
}
