/**
 * Fully Kiosk Browser (Android) geeft een pagina toegang tot het toestel
 * via `window.fully`, als in Fully de JavaScript-interface aanstaat
 * (Advanced Web Settings → Enable JavaScript Interface).
 *
 * Alles is optioneel: zonder Fully doet dit bestand niets, en een methode
 * die in een oudere versie ontbreekt, wordt stil overgeslagen.
 */
interface Fully {
  turnScreenOn?: () => void
  setScreenBrightness?: (waarde: number) => void
  getScreenBrightness?: () => number | string
}

function fully(): Fully | null {
  const f = (window as unknown as { fully?: Fully }).fully
  return f && typeof f === 'object' ? f : null
}

export function heeftFully(): boolean {
  return fully() !== null
}

let helderheidOverdag: number | null = null

/** 's Nachts de echte helderheid omlaag, overdag terug naar wat ze was. */
export function nachtHelderheid(nacht: boolean) {
  const f = fully()
  if (!f?.setScreenBrightness) return
  try {
    if (nacht) {
      if (helderheidOverdag === null && f.getScreenBrightness) {
        const nu = Number(f.getScreenBrightness())
        helderheidOverdag = Number.isFinite(nu) && nu > 20 ? nu : 180
      }
      // Laag genoeg om een slaapkamer niet te verlichten, hoog genoeg om
      // de klok te lezen wie 's nachts wakker wordt.
      f.setScreenBrightness(8)
    } else if (helderheidOverdag !== null) {
      f.setScreenBrightness(helderheidOverdag)
      helderheidOverdag = null
    }
  } catch {
    // Fully weigert soms zonder rechten om systeeminstellingen te wijzigen.
  }
}

/** Het scherm aanzetten, voor een melding terwijl het toestel sliep. */
export function schermAan() {
  try {
    fully()?.turnScreenOn?.()
  } catch {
    // Niet erg: dan blijft het bij het lichtsignaal op het scherm.
  }
}
