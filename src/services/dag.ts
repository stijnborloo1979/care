import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * De dag klaarzetten.
 *
 * De agenda van de persoon wordt 's nachts gemaakt uit haar routines, door
 * een job op pg_cron. Staat die niet aan, dan gebeurt er nooit iets — en
 * dat faalt stil: haar tijdlijn blijft leeg, "Wat nu?" weet niets, en er is
 * geen medicatiemoment om te bevestigen. Niets wijst naar de oorzaak.
 *
 * Een app die alleen werkt als iemand een databasejob heeft ingesteld, is
 * stuk. Dit is het vangnet: familie zet de dag klaar zonder het te weten.
 */
export async function zetDagKlaar(householdId: string): Promise<number> {
  const { data, error } = await supabase.rpc('dag_klaarzetten', { hh: householdId })
  if (error) throw error
  return (data as number) ?? 0
}

const LOKAAL = 'thuis.dagklaar'

/**
 * Eén keer per dag, wanneer familie de app opent.
 *
 * Niet bij elke render: dat zou een schrijfactie maken van het openen van
 * een scherm. De datum in localStorage is genoeg — mislukt het, dan
 * proberen we het de volgende keer gewoon opnieuw, want dan staat de dag
 * van vandaag er nog niet in.
 */
export function useDagKlaar(householdId: string, isFamilie: boolean) {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!householdId || !isFamilie) return

    const vandaag = new Date().toISOString().slice(0, 10)
    const sleutel = `${LOKAAL}.${householdId}`
    try {
      if (localStorage.getItem(sleutel) === vandaag) return
    } catch {
      // Geen opslag: dan draait het elke keer. Dat mag — de functie is
      // idempotent en doet niets als de dag al klaarstaat.
    }

    let weg = false
    zetDagKlaar(householdId)
      .then((toegevoegd) => {
        if (weg) return
        try {
          localStorage.setItem(sleutel, vandaag)
        } catch {
          // Niets aan te doen; volgende keer opnieuw.
        }
        // Alleen verversen als er echt iets bijkwam.
        if (toegevoegd > 0) {
          for (const k of ['agenda', 'summary', 'meds-today']) {
            queryClient.invalidateQueries({ queryKey: [k, householdId] })
          }
        }
      })
      .catch(() => {
        // Stil: dit is een vangnet, geen handeling van de gebruiker. Wie het
        // met de hand wil doen, heeft de knop bij Planning.
      })

    return () => {
      weg = true
    }
  }, [householdId, isFamilie, queryClient])
}
