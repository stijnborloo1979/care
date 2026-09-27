import { supabase } from './supabase'

/** Alle buckets zijn privé, dus elk bestand heeft een tijdelijke link nodig. */
export async function signedUrl(bucket: string, path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds)
  if (error) throw error
  return data.signedUrl
}

/**
 * Dezelfde foto, dezelfde link — en dat is waar het om draait.
 *
 * Elke ondertekende link is uniek. Vraag je er bij elke keer tonen een nieuwe
 * op, dan ziet de browser telkens een ander adres en haalt hij de foto
 * opnieuw op, ook al staat diezelfde foto al in zijn cache. Op de tablet
 * betekende dat: bij elk terugkeren naar het scherm opnieuw wachten, met een
 * emoji op de plaats van de foto. Twee keer traag dus — een extra ronde naar
 * de server om de link te maken, en daarna een download die nergens voor
 * nodig was.
 *
 * Hier wordt de link bewaard en hergebruikt zolang hij geldig is. Dan klopt
 * het adres, en de tweede keer komt de foto meteen uit de cache van de
 * browser.
 *
 * Bewust niet in localStorage: een link die zijn tijd uitzit hoort te
 * verdwijnen wanneer de app sluit, niet als kapotte foto terug te komen.
 */
const GELDIG = 4 * 3600
/** Ruim voor het verlopen vernieuwen; een foto halverwege laden mag niet mislukken. */
const HERGEBRUIK = 3 * 3600 * 1000

const linken = new Map<string, { url: string; tot: number }>()
const onderweg = new Map<string, Promise<string>>()

export async function signedUrlCached(bucket: string, path: string): Promise<string> {
  const sleutel = `${bucket}/${path}`
  const bewaard = linken.get(sleutel)
  if (bewaard && bewaard.tot > Date.now()) return bewaard.url

  // Staan er tien foto's op een scherm, dan vragen die niet tien keer
  // hetzelfde tegelijk op.
  const bezig = onderweg.get(sleutel)
  if (bezig) return bezig

  const belofte = signedUrl(bucket, path, GELDIG)
    .then((url) => {
      linken.set(sleutel, { url, tot: Date.now() + HERGEBRUIK })
      return url
    })
    .finally(() => onderweg.delete(sleutel))

  onderweg.set(sleutel, belofte)
  return belofte
}

/** Een link die niet meer werkt weggooien, zodat de volgende poging een verse maakt. */
export function vergeetLink(bucket: string, path: string) {
  linken.delete(`${bucket}/${path}`)
}
