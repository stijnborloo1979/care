import { create } from 'zustand'

export interface Speelbaar {
  id: string
  name: string
  stream_url: string
}

type Reden = 'gesprek' | 'handmatig'

interface RadioState {
  lijst: Speelbaar[]
  zender: Speelbaar | null
  speelt: boolean
  laden: boolean
  fout: string | null
  volume: number
  /** Waarom de radio even stil ligt; die reden bepaalt of hij weer mag starten. */
  pauzeReden: Reden | null
  zetLijst: (l: Speelbaar[]) => void
  speel: (z: Speelbaar) => void
  speelFavoriet: () => void
  stop: () => void
  toggle: (z?: Speelbaar) => void
  zetVolume: (v: number) => void
  pauzeerVoorGesprek: () => void
  hervatNaGesprek: () => void
  demp: (aan: boolean) => void
}

// Eén audio-element voor de hele app: zo speelt de radio door wanneer je
// van scherm wisselt, en kan elk deel van de app hem stilzetten.
let audio: HTMLAudioElement | null = null
let geprobeerd = new Set<string>()

function speler() {
  if (!audio) {
    audio = new Audio()
    audio.preload = 'none'
  }
  return audio
}

export const useRadio = create<RadioState>((set, get) => ({
  lijst: [],
  zender: null,
  speelt: false,
  laden: false,
  fout: null,
  volume: 0.8,
  pauzeReden: null,

  zetLijst: (l) => set({ lijst: l }),

  speel: (z) => {
    const a = speler()
    geprobeerd.add(z.id)
    set({ zender: z, laden: true, fout: null, pauzeReden: null })
    a.src = z.stream_url
    a.volume = get().volume

    a.onplaying = () => {
      geprobeerd = new Set()
      set({ speelt: true, laden: false })
    }
    a.onerror = () => {
      // Speelt deze zender niet, dan de volgende uit de lijst — één ronde,
      // zodat een kapotte lijst niet eindeloos blijft proberen.
      const volgende = get().lijst.find((x) => !geprobeerd.has(x.id))
      if (volgende) {
        set({ fout: `${z.name} speelt nu niet. Ik probeer ${volgende.name}.` })
        get().speel(volgende)
      } else {
        geprobeerd = new Set()
        set({ speelt: false, laden: false, fout: 'De radio speelt nu niet. Probeer het straks opnieuw.' })
      }
    }

    a.play().catch(() => {
      // Een browser weigert geluid tot iemand het scherm heeft aangeraakt.
      set({ speelt: false, laden: false, fout: 'Tik nog eens op de radio om te starten.' })
    })
  },

  speelFavoriet: () => {
    const eerste = get().lijst[0]
    if (eerste) get().speel(eerste)
  },

  stop: () => {
    const a = speler()
    a.pause()
    // De bron loslaten: een radiostream blijft anders op de achtergrond
    // data binnenhalen, ook als niemand luistert.
    a.removeAttribute('src')
    a.load()
    set({ speelt: false, laden: false, pauzeReden: 'handmatig' })
  },

  toggle: (z) => {
    const s = get()
    const doel = z ?? s.zender ?? s.lijst[0]
    if (!doel) return
    if (s.speelt && s.zender?.id === doel.id) s.stop()
    else s.speel(doel)
  },

  zetVolume: (v) => {
    speler().volume = v
    set({ volume: v })
  },

  pauzeerVoorGesprek: () => {
    if (!get().speelt) return
    speler().pause()
    set({ speelt: false, pauzeReden: 'gesprek' })
  },

  hervatNaGesprek: () => {
    const s = get()
    if (s.pauzeReden === 'gesprek' && s.zender) s.speel(s.zender)
  },

  // Zachter tijdens een gesproken herinnering, en daarna weer normaal.
  demp: (aan) => {
    if (!get().speelt) return
    speler().volume = aan ? Math.min(0.15, get().volume) : get().volume
  },
}))
