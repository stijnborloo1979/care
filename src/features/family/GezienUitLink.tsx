import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { dismissAlert } from '../../services/dashboard'

/**
 * Wie op de melding tikt, heeft ze gezien.
 *
 * De teller van herhalingen ("3e keer") bestaat om te zeggen dat er nog
 * niemand reageerde. Hij liep alleen terug wanneer iemand de melding in het
 * familiescherm met de hand wegklikte — en dat doet niemand die de melding
 * op zijn telefoon ziet, meteen terugbelt en verder gaat. Het gevolg was een
 * teller die eindeloos opliep: "18e keer" terwijl er al zes keer teruggebeld
 * was.
 *
 * De melding draagt daarom haar eigen nummer mee in de link. Tikt iemand
 * erop, dan komt hij binnen op /familie?gezien=<id> en is dat het signaal.
 * Precieser dan "het familiescherm is geopend": alleen de melding waar
 * werkelijk op getikt is, telt.
 *
 * De parameter verdwijnt meteen uit het adres. Anders zou verversen of een
 * bladwijzer hem opnieuw afvuren, en zou hij in een gedeelde link
 * terechtkomen.
 */
export default function GezienUitLink() {
  const [params, setParams] = useSearchParams()
  const queryClient = useQueryClient()

  useEffect(() => {
    const id = params.get('gezien')
    if (!id) return

    setParams(
      (huidig) => {
        const volgende = new URLSearchParams(huidig)
        volgende.delete('gezien')
        return volgende
      },
      { replace: true },
    )

    dismissAlert(id)
      .then(() => queryClient.invalidateQueries({ queryKey: ['summary'] }))
      .catch(() => {
        // Al weggeklikt, of een melding die intussen vervangen is. Geen
        // reden om iets te tonen: hij kwam hier om het bericht te lezen,
        // niet om te horen dat het afvinken mislukte.
      })
  }, [params, setParams, queryClient])

  return null
}
