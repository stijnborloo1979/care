import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  getActiviteit,
  getDagritme,
  getDekking,
  getRapportKeuze,
  getWeekpatroon,
  helften,
  watStabielBleef,
} from '../../services/analyse'
import {
  getSamenvatting,
  getSchemaWijzigingen,
  periode,
  type SamenvattingRij,
} from '../../services/medicationHistory'
import { getCareLog } from '../../services/careLog'

/**
 * Alle cijfers voor het analysescherm en voor het verslag, uit één plek.
 *
 * Het verslag is een afdruk van wat op het scherm staat, niet een tweede
 * berekening. Zou het zijn eigen queries doen, dan gaan die twee vroeg of
 * laat uiteen lopen en klopt het blad dat bij de arts ligt niet meer met
 * wat familie zag.
 */
export function useAnalyse(hh: string, dagen: number) {
  const { van, tot } = useMemo(() => periode(dagen), [dagen])
  const aan = { enabled: !!hh }

  const dekking = useQuery({ ...aan, queryKey: ['an-dekking', hh, dagen], queryFn: () => getDekking(hh, van, tot) })
  const medicatie = useQuery({ ...aan, queryKey: ['an-medicatie', hh, dagen], queryFn: () => getSamenvatting(hh, van, tot) })
  const dagritme = useQuery({ ...aan, queryKey: ['an-dagritme', hh, dagen], queryFn: () => getDagritme(hh, van, tot) })
  const week = useQuery({ ...aan, queryKey: ['an-week', hh, dagen], queryFn: () => getWeekpatroon(hh, van, tot) })
  const activiteit = useQuery({ ...aan, queryKey: ['an-uur', hh, dagen], queryFn: () => getActiviteit(hh, van, tot) })
  const wijzigingen = useQuery({ ...aan, queryKey: ['an-wijzigingen', hh, dagen], queryFn: () => getSchemaWijzigingen(hh, van) })
  const notities = useQuery({ ...aan, queryKey: ['an-notities', hh, dagen], queryFn: () => getCareLog(hh, dagen) })
  const keuze = useQuery({ ...aan, queryKey: ['rapportkeuze', hh], queryFn: () => getRapportKeuze(hh) })

  // Twee keer dezelfde samenvatting, over de eerste en de tweede helft. Dat
  // is wat "bleef gelijk" betekent; één getal over de hele periode kan dat
  // niet zeggen.
  const h = useMemo(() => helften(dagen), [dagen])
  const eersteHelft = useQuery({
    ...aan,
    queryKey: ['an-helft1', hh, dagen],
    queryFn: () => getSamenvatting(hh, h.eerste.van, h.eerste.tot),
  })
  const tweedeHelft = useQuery({
    ...aan,
    queryKey: ['an-helft2', hh, dagen],
    queryFn: () => getSamenvatting(hh, h.tweede.van, h.tweede.tot),
  })

  const totaal = (medicatie.data ?? []).find((r) => r.tijdstip === 'alles')
  const perTijdstip = useMemo(
    () => (medicatie.data ?? []).filter((r) => r.tijdstip !== 'alles'),
    [medicatie.data],
  )

  const nacht = useMemo(
    () => (activiteit.data ?? []).filter((u) => u.uur >= 1 && u.uur <= 5),
    [activiteit.data],
  )
  const nachtTotaal = nacht.reduce((n, u) => n + u.aantal, 0)

  const stabiel = useMemo(() => {
    const pct = (rij?: SamenvattingRij) =>
      rij && rij.momenten > 0 ? (rij.bevestigd / rij.momenten) * 100 : 0
    const zoek = (rijen: SamenvattingRij[] | undefined, tijdstip: string) =>
      (rijen ?? []).find((r) => r.tijdstip === tijdstip)

    return watStabielBleef(
      perTijdstip.map((r) => {
        const een = zoek(eersteHelft.data, r.tijdstip)
        const twee = zoek(tweedeHelft.data, r.tijdstip)
        return {
          tijdstip: r.tijdstip,
          eerste: pct(een),
          laatste: pct(twee),
          momentenEerste: een?.momenten ?? 0,
          momentenTweede: twee?.momenten ?? 0,
        }
      }),
      dagritme.data ?? [],
    )
  }, [perTijdstip, eersteHelft.data, tweedeHelft.data, dagritme.data])

  // Per blok: valt er iets te tonen? Dit bepaalt zowel of het vinkje
  // aangeklikt kan worden als wat er onderaan het verslag bij "niet
  // opgenomen" komt te staan.
  const leeg: Record<string, boolean> = {
    medicatie: !totaal,
    dagritme: (dagritme.data ?? []).length === 0,
    weekpatroon: (week.data ?? []).every((w) => w.med_momenten === 0 && w.agenda_items === 0),
    nacht: nachtTotaal === 0,
    schema: (wijzigingen.data ?? []).length === 0,
    notities: (notities.data ?? []).length === 0,
  }

  const bezig =
    dekking.isLoading || medicatie.isLoading || dagritme.isLoading || week.isLoading || keuze.isLoading

  return {
    van,
    tot,
    bezig,
    dekking: dekking.data ?? null,
    totaal,
    perTijdstip,
    dagritme: dagritme.data ?? [],
    week: week.data ?? [],
    nacht,
    nachtTotaal,
    wijzigingen: wijzigingen.data ?? [],
    notities: notities.data ?? [],
    keuze: keuze.data ?? null,
    stabiel,
    leeg,
  }
}

export type AnalyseData = ReturnType<typeof useAnalyse>
