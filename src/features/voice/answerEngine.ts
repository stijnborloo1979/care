import type { AgendaEvent } from '../../services/agenda'
import type { Item } from '../../services/homeMemory'
import type { PersonCard } from '../../services/people'
import type { MemoryNote } from '../../services/notes'
import type { QuickNote } from '../../services/quickNotes'
import type { MedMoment } from '../../services/medsToday'
import { hhmm, localDateKey } from '../../lib/time'
import { locale, t, taal } from '../../lib/i18n'
import { patronen } from './patronen'
import { whatNow } from '../today/whatNow'

export interface Answer {
  vraag: string
  titel: string
  regels: string[]
  /** Waar de knop onder het antwoord naartoe gaat, als die er is. */
  link?: { naar: string; label: string }
  bellen?: { naam: string; nummer: string }
  /** Waar het antwoord vandaan komt. Zo weet de persoon wie het schreef. */
  bron?: string
  /** Medicatiemomenten die de persoon vanuit het antwoord kan bevestigen. */
  bevestig?: string[]
  /** Een opdracht voor de radio, uit te voeren door het scherm. */
  radio?: { actie: 'aan' | 'uit'; zenderId?: string }
}

export interface Kennis {
  events: AgendaEvent[]
  items: Item[]
  people: PersonCard[]
  notes: MemoryNote[]
  /** Wat de persoon zelf heeft laten onthouden, nieuwste eerst. */
  onthouden?: QuickNote[]
  /** De medicatiemomenten van vandaag. */
  medicatie?: MedMoment[]
  /** De gekozen radiozenders, favoriet eerst. */
  zenders?: { id: string; name: string }[]
  tz: string
}

// De vaste teksten staan in het woordenboek; de patronen per taal in
// patronen.ts. Deze motor kent dus geen enkel Nederlands woord meer.

function normaliseer(s: string) {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Apostrofs en koppeltekens worden spaties: "j'ai" en "est-ce que"
      // moeten op dezelfde woorden uitkomen als "j ai" en "est ce que".
      .replace(/['’\u2019-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function vindItem(vraag: string, items: Item[]): Item | null {
  const v = normaliseer(vraag)
  for (const i of items) {
    const naam = normaliseer(i.name)
    if (v.includes(naam)) return i
    const eerste = naam.split(' ')[0]
    if (eerste.length > 3 && v.includes(eerste)) return i
  }
  // Twee vaste bruggen: "tv" en een medicijnwoord komen in alle drie de
  // talen op hetzelfde ding uit.
  if (/\btv\b|telev/.test(v)) {
    return items.find((i) => normaliseer(i.name).includes('tele')) ?? null
  }
  if (patronen(taal()).medicatie.test(v)) {
    return items.find((i) => normaliseer(i.name).includes('medic')) ?? null
  }
  return null
}

/** Woorden die niets zeggen over wát er gezocht wordt, per taal. */
function kernwoorden(vraag: string): string[] {
  const stop = new Set([
    ...patronen(taal()).stopwoorden,
    'waar', 'heb', 'hebt', 'mijn', 'gelegd', 'gezet', 'gelaten', 'ligt', 'liggen',
    'staat', 'staan', 'zijn', 'deze', 'die', 'dat', 'het', 'een', 'de', 'ik', 'je',
    'is', 'al', 'nog', 'wat', 'moest', 'onthouden', 'weet', 'ook', 'weer', 'toch', 'eens',
  ])
  return normaliseer(vraag)
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stop.has(w))
}

/** "sleutels" moet ook "sleutel" vinden, en omgekeerd. */
function stam(w: string) {
  return w.replace(/(en|s)$/, '')
}

function wanneer(iso: string, tz: string, nu: Date): string {
  const d = new Date(iso)
  const dag = localDateKey(d, tz)
  const vandaag = localDateKey(nu, tz)
  const gisteren = localDateKey(new Date(nu.getTime() - 24 * 3600_000), tz)
  const uur = hhmm(d, tz)
  if (dag === vandaag) return t('ass.vandaagOm', { tijd: uur })
  if (dag === gisteren) return t('ass.gisterenOm', { tijd: uur })
  const datum = new Intl.DateTimeFormat(locale(), {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(d)
  return t('ass.opDatum', { datum })
}

/** De nieuwste eigen notitie waar een kernwoord van de vraag in staat. */
function vindOnthouden(vraag: string, lijst: QuickNote[]): QuickNote | null {
  const woorden = kernwoorden(vraag).map(stam).filter((w) => w.length > 2)
  if (woorden.length === 0) return null
  return (
    lijst.find((n) => {
      const tekst = normaliseer(n.body)
      return woorden.some((w) => tekst.includes(w))
    }) ?? null
  )
}

const ACTIVITEIT: { woorden: RegExp; zoek: (e: AgendaEvent) => boolean }[] = [
  { woorden: /ontbijt|ontbeten/, zoek: (e) => /ontbijt/i.test(e.title) },
  { woorden: /lunch|middageten|middag gegeten/, zoek: (e) => /lunch|middag/i.test(e.title) },
  { woorden: /avondeten|avondmaal|avond gegeten/, zoek: (e) => /avond/i.test(e.title) && e.kind === 'meal' },
  { woorden: /gegeten|eten/, zoek: (e) => e.kind === 'meal' },
  { woorden: /gewandeld|wandel/, zoek: (e) => /wandel/i.test(e.title) },
]

/**
 * "Heb ik dit al gedaan?" — de vraag die bij beginnende geheugenproblemen
 * het meest onrust geeft. Het antwoord komt uit wat er echt afgevinkt of
 * bevestigd is, met het tijdstip erbij. Nooit uit een gok.
 */
function alGedaan(vraag: string, k: Kennis, nu: Date): Answer | null {
  const v = normaliseer(vraag)

  if (patronen(taal()).medicatie.test(v)) {
    const momenten = (k.medicatie ?? []).filter(
      (m) => new Date(m.due_at).getTime() <= nu.getTime() + 30 * 60_000,
    )
    if ((k.medicatie ?? []).length === 0) {
      return { vraag, titel: t('ass.geenMedicatie'), regels: [] }
    }
    if (momenten.length === 0) {
      const eerste = (k.medicatie ?? [])[0]
      return {
        vraag,
        titel: t('ass.nogNietNodig'),
        regels: [t('ass.volgendeMedicatie', { tijd: hhmm(new Date(eerste.due_at), k.tz) })],
      }
    }

    const open = momenten.filter((m) => !m.taken_at)
    if (open.length === 0) {
      const laatste = momenten[momenten.length - 1]
      return {
        vraag,
        titel: t('ass.jaGedaan'),
        regels: [
          t('ass.medicatieGenomen', {
            tijd: hhmm(new Date(laatste.due_at), k.tz),
            wanneer: wanneer(laatste.taken_at!, k.tz, nu),
          }),
        ],
      }
    }

    const tijden = [...new Set(open.map((m) => hhmm(new Date(m.due_at), k.tz)))].join(
      t('ass.enTussen'),
    )
    return {
      vraag,
      titel: t('ass.nogNiet'),
      regels: [t('ass.medicatieOpen', { tijden })],
      bevestig: open.map((m) => m.id),
    }
  }

  for (const a of ACTIVITEIT) {
    if (!a.woorden.test(v)) continue
    const kandidaten = k.events
      .filter(a.zoek)
      .sort(
        (x, y) =>
          Math.abs(new Date(x.starts_at).getTime() - nu.getTime()) -
          Math.abs(new Date(y.starts_at).getTime() - nu.getTime()),
      )
    const e = kandidaten[0]
    if (!e) return null
    const uur = hhmm(new Date(e.starts_at), k.tz)
    if (e.done_at) {
      return {
        vraag,
        titel: t('ass.jaGedaan'),
        regels: [t('ass.isAfgevinkt', { wat: e.title, wanneer: wanneer(e.done_at, k.tz, nu) })],
      }
    }
    if (new Date(e.starts_at) > nu) {
      return {
        vraag,
        titel: t('ass.nogNiet'),
        regels: [t('ass.staatGepland', { wat: e.title, tijd: uur })],
      }
    }
    return {
      vraag,
      titel: t('ass.nogNietGedaan'),
      regels: [t('ass.wasGepland', { wat: e.title, tijd: uur })],
    }
  }

  return null
}

function vindPersoon(vraag: string, people: PersonCard[]): PersonCard | null {
  const v = normaliseer(vraag)
  return people.find((p) => p.kind !== 'self' && v.includes(normaliseer(p.name))) ?? null
}

/**
 * Antwoordt uitsluitend met wat familie heeft ingevuld. Vindt ze niets,
 * dan zegt ze dat — nooit iets aanvullen of gokken. Een app die verzint
 * waar de bril ligt, is erger dan een app die het niet weet.
 */
export function beantwoord(vraag: string, k: Kennis, nu = new Date()): Answer {
  const v = normaliseer(vraag)
  const P = patronen(taal())
  const leeg: Answer = {
    vraag,
    titel: t('ass.nietZeker'),
    regels: [t('ass.vraagFamilie')],
  }

  // bellen
  if (P.bellen.test(v)) {
    const p = vindPersoon(vraag, k.people)
    if (p?.phone) {
      return {
        vraag,
        titel: t('ass.bel', { naam: p.name }),
        regels: [`${p.relation} — ${p.phone}`],
        bellen: { naam: p.name, nummer: p.phone },
      }
    }
  }

  // radio
  if (P.radio.test(v) || (k.zenders ?? []).some((z) => v.includes(normaliseer(z.name)))) {
    const zenders = k.zenders ?? []
    if (P.radioUit.test(v)) {
      return { vraag, titel: t('ass.radioUit'), regels: [], radio: { actie: 'uit' } }
    }
    if (zenders.length === 0) {
      return {
        vraag,
        titel: t('ass.geenZenders'),
        regels: [t('ass.vraagZenders')],
      }
    }
    const gevraagd = zenders.find((z) => v.includes(normaliseer(z.name))) ?? zenders[0]
    return {
      vraag,
      titel: t('ass.speelt', { zender: gevraagd.name }),
      regels: [],
      radio: { actie: 'aan', zenderId: gevraagd.id },
    }
  }

  // heb ik dit al gedaan?
  if (P.hebIk.test(v) && P.al.test(v)) {
    const a = alGedaan(vraag, k, nu)
    if (a) return a
  }

  // wat moest ik onthouden?
  if (P.onthouden.test(v)) {
    const lijst = (k.onthouden ?? []).slice(0, 3)
    if (lijst.length > 0) {
      return {
        vraag,
        titel: t('ass.lietOnthouden'),
        regels: lijst.map((n) => `${n.body} — ${wanneer(n.created_at, k.tz, nu)}`),
        bron: t('ass.bronZelf'),
      }
    }
  }

  // wat moet ik nu doen
  if (P.watNu.test(v)) {
    const { current, next } = whatNow(k.events, nu)
    const regels: string[] = []
    if (current?.note) regels.push(current.note)
    if (!current) regels.push(t('ass.nietsMoet'))
    if (next) {
      regels.push(
        t('ass.daarna', { wat: next.title, tijd: hhmm(new Date(next.starts_at), k.tz) }),
      )
    }
    return {
      vraag,
      titel: current ? `${current.emoji ?? ''} ${current.title}`.trim() : t('watnu.rusten'),
      regels,
    }
  }

  // wie komt er
  if (P.wieKomt.test(v)) {
    const bezoek = k.events.filter((e) => e.person_id)
    if (bezoek.length > 0) {
      return {
        vraag,
        titel: t('vandaag.vandaag'),
        regels: bezoek.map((e) =>
          t('ass.staatGepland', { wat: e.title, tijd: hhmm(new Date(e.starts_at), k.tz) }),
        ),
      }
    }
    return { vraag, titel: t('ass.niemandLangs'), regels: [] }
  }

  // wanneer komt X
  if (P.wanneer.test(v)) {
    const p = vindPersoon(vraag, k.people)
    if (p) {
      const e = k.events.find((x) => x.person_id === p.id)
      if (e) {
        return {
          vraag,
          titel: t('ass.komtOm', { naam: p.name, tijd: hhmm(new Date(e.starts_at), k.tz) }),
          regels: e.note ? [e.note] : [],
        }
      }
      return {
        vraag,
        titel: t('ass.nietGepland', { naam: p.name }),
        regels: [t('ass.vraagFamilie')],
      }
    }
  }

  // waar ligt iets
  if (P.waar.test(v)) {
    const item = vindItem(vraag, k.items)

    // Wat de persoon zelf heeft laten onthouden, gaat voor. Dat is waar
    // het vandaag ligt; Home Memory zegt waar het normaal hoort te liggen.
    const eigen = vindOnthouden(vraag, k.onthouden ?? [])
    if (eigen) {
      const regels = [t('ass.datZeiJe', { wanneer: wanneer(eigen.created_at, k.tz, nu) })]
      if (item?.where_text) regels.push(t('ass.normaalLigt', { waar: item.where_text }))
      return { vraag, titel: eigen.body, regels, bron: t('ass.bronZelf') }
    }

    if (item) {
      return {
        vraag,
        titel: `${item.emoji ?? ''} ${item.name}`.trim(),
        regels: item.where_text ? [item.where_text] : [],
        link: { naar: `/memory/ding/${item.id}`, label: t('ass.toonUitleg') },
      }
    }
    const notitie = k.notes.find((n) => v.includes(normaliseer(n.title)))
    if (notitie) return { vraag, titel: notitie.title, regels: [notitie.body] }
  }

  // hoe werkt iets
  if (P.hoe.test(v)) {
    const item = vindItem(vraag, k.items)
    if (item) {
      return {
        vraag,
        titel: `${item.emoji ?? ''} ${item.name}`.trim(),
        regels: item.where_text ? [item.where_text] : [],
        link: { naar: `/memory/ding/${item.id}`, label: t('ass.stapVoorStap') },
      }
    }
  }

  // iemand
  const p = vindPersoon(vraag, k.people)
  if (p) {
    return {
      vraag,
      titel: p.name,
      regels: [p.description, p.detail].filter((r): r is string => !!r),
      link: { naar: `/wie/${p.id}`, label: t('ass.meerOver', { naam: p.name }) },
    }
  }

  // een weetje
  const notitie = k.notes.find(
    (n) => v.includes(normaliseer(n.title)) || normaliseer(n.body).includes(v),
  )
  if (notitie) return { vraag, titel: notitie.title, regels: [notitie.body] }

  return leeg
}

/** De voorbeeldvragen, per taal: ze moeten de patronen hierboven raken. */
const VOORBEELDEN: Record<string, string[]> = {
  nl: [
    'Wat moet ik nu doen?',
    'Heb ik mijn pillen al genomen?',
    'Wat moest ik onthouden?',
    'Wie komt er vandaag?',
    'Waar is mijn bril?',
    'Hoe zet ik de televisie aan?',
  ],
  fr: [
    'Que dois-je faire maintenant ?',
    'Est-ce que j’ai déjà pris mes médicaments ?',
    'Qu’est-ce que je voulais retenir ?',
    'Qui vient aujourd’hui ?',
    'Où sont mes lunettes ?',
    'Comment allumer la télévision ?',
  ],
  en: [
    'What should I do now?',
    'Have I already taken my pills?',
    'What did I want to remember?',
    'Who is coming today?',
    'Where are my glasses?',
    'How do I turn on the television?',
  ],
}

export function voorbeeldvragen(): string[] {
  return VOORBEELDEN[taal()] ?? VOORBEELDEN.nl
}
