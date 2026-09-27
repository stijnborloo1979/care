import { create } from 'zustand'

/** Of de spraakassistent open staat. Eén overlay voor de hele app. */
export const useVoice = create<{ open: boolean; openen: () => void; sluiten: () => void }>()((set) => ({
  open: false,
  openen: () => set({ open: true }),
  sluiten: () => set({ open: false }),
}))
