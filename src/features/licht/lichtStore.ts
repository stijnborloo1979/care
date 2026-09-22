import { create } from 'zustand'

export type Signaal = 'oproep' | 'bericht' | 'medicatie' | 'afspraak'

// Hoe dringend, zodat een oproep een bericht kan overnemen en niet omgekeerd.
const RANG: Record<Signaal, number> = { oproep: 3, medicatie: 2, bericht: 1, afspraak: 0 }

// Warme kleuren, nooit rood: rood leest als alarm en maakt onrustig.
export const KLEUR: Record<Signaal, string> = {
  oproep: '240, 150, 60',
  medicatie: '235, 165, 110',
  bericht: '224, 164, 78',
  afspraak: '214, 176, 110',
}

// Hoe lang het licht hoogstens blijft pulseren. Een melding die niemand
// ziet, mag niet de hele dag doorgaan.
const DUUR: Record<Signaal, number> = {
  oproep: 60_000,
  medicatie: 10 * 60_000,
  bericht: 10 * 60_000,
  afspraak: 3 * 60_000,
}

/**
 * Een uitgang is alles wat licht kan geven. Het scherm is de eerste; een
 * ledbalk of een slimme lamp kan later als tweede uitgang aansluiten,
 * zonder dat de rest van de app daar iets van moet weten.
 */
export type Uitgang = (signaal: Signaal | null) => void

interface LichtState {
  actief: Signaal | null
  tot: number | null
  uitgangen: Uitgang[]
  start: (s: Signaal) => void
  stop: (s?: Signaal) => void
  voegUitgangToe: (u: Uitgang) => () => void
}

let timer: number | null = null

export const useLicht = create<LichtState>((set, get) => ({
  actief: null,
  tot: null,
  uitgangen: [],

  start: (s) => {
    const huidig = get().actief
    if (huidig && RANG[huidig] > RANG[s]) return
    if (timer) window.clearTimeout(timer)
    timer = window.setTimeout(() => get().stop(), DUUR[s])
    set({ actief: s, tot: Date.now() + DUUR[s] })
    get().uitgangen.forEach((u) => u(s))
  },

  // Zonder argument stopt alles; met een signaal alleen als dat het
  // actieve is, zodat een afgelopen oproep geen bericht uitdooft.
  stop: (s) => {
    if (s && get().actief !== s) return
    if (timer) window.clearTimeout(timer)
    timer = null
    set({ actief: null, tot: null })
    get().uitgangen.forEach((u) => u(null))
  },

  voegUitgangToe: (u) => {
    set({ uitgangen: [...get().uitgangen, u] })
    return () => set({ uitgangen: get().uitgangen.filter((x) => x !== u) })
  },
}))
