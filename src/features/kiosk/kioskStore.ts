import { useEffect } from 'react'
import { create } from 'zustand'

/**
 * Houdt bij of er iets bezig is dat de kioskmodus niet mag onderbreken:
 * een videogesprek, een opname, de spraakherkenning. Een teller en geen
 * vlag, omdat er meer dan één tegelijk kan lopen.
 */
export const useKioskStore = create<{ bezig: number; plus: () => void; min: () => void }>(
  (set) => ({
    bezig: 0,
    plus: () => set((s) => ({ bezig: s.bezig + 1 })),
    min: () => set((s) => ({ bezig: Math.max(0, s.bezig - 1) })),
  }),
)

/** Eén regel in een component: zolang `actief` waar is, blijft de kiosk eraf. */
export function useKioskBezig(actief: boolean) {
  useEffect(() => {
    if (!actief) return
    useKioskStore.getState().plus()
    return () => useKioskStore.getState().min()
  }, [actief])
}
