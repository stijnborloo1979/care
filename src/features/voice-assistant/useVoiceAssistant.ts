import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { hhmm, localDateKey } from '../../lib/time'
import { locale, t, taal } from '../../lib/i18n'
import { useHousehold } from '../household/useHousehold'
import { huidigePrefs, magBellen } from '../settings/useDisplayPrefs'
import { useKennis } from '../voice/useKennis'
import { beantwoord as regelAntwoord } from '../voice/answerEngine'
import { addStory, setShared } from '../../services/stories'
import { sendTextMessage } from '../messages/messages'
import { confirmMoments } from '../../services/medsToday'
import { addShoppingItems } from '../../services/shopping'
import { getKomende, voiceAddEvent } from '../../services/voiceActions'
import { ActionEngine, openMedicatie, vindPersoon, type ActieContext, type Diensten } from './actionEngine'
import { maakIntentService } from './aiIntentService'
import { RUST, verwerk, type Antwoord, type Beurt, type GesprekDiensten, type Invoer, type Stand } from './gesprek'
import { luister, SpraakFout, zeg, zwijg, type Luisteren } from './spraak'
import { useDagboekOpname } from './useDagboekOpname'
import { useVoice } from './voiceStore'
import type { Gevalideerd } from './valideer'

/**
 * - stil:     overlay dicht
 * - luistert: de microfoon staat open
 * - verwerkt: de zin wordt begrepen of de actie uitgevoerd
 * - spreekt:  LifeAngle zegt iets
 * - wacht:    klaar, of wacht op een tik
 * - opname:   het dagboek neemt op
 * - bewaart:  de opname wordt bewaard
 */
export type Fase = 'stil' | 'luistert' | 'verwerkt' | 'spreekt' | 'wacht' | 'opname' | 'bewaart'

/** Na zoveel keer niets verstaan stopt de microfoon vanzelf. */
const MAX_STILTE = 2

function nieuwId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // Oudere browsers: goed genoeg als actie-id.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function useVoiceAssistant() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const tz = household?.timezone ?? 'Europe/Brussels'
  const { kennis } = useKennis(hh, tz, household?.home_id ?? hh)
  const queryClient = useQueryClient()
  const { open, sluiten } = useVoice()
  const opname = useDagboekOpname()

  const [fase, setFase] = useState<Fase>('stil')
  const [beurt, setBeurt] = useState<Beurt | null>(null)
  const [gehoord, setGehoord] = useState<string>('')
  const [geenSpraak, setGeenSpraak] = useState(false)

  const standRef = useRef<Stand>(RUST)
  const sessieRef = useRef(0)
  const luisterRef = useRef<Luisteren | null>(null)
  const stilteRef = useRef(0)
  const geenSpraakRef = useRef(false)
  const dagboekAfgebrokenRef = useRef(false)
  const kennisRef = useRef(kennis)
  kennisRef.current = kennis
  const hhRef = useRef({ hh, tz, household })
  hhRef.current = { hh, tz, household }

  const diensten: Diensten = useMemo(
    () => ({
      voegAfspraakToe: (p) => voiceAddEvent(p),
      voegBoodschappenToe: (p) => addShoppingItems(p.householdId, p.namen, p.actieId),
      bewaarDagboek: (p) =>
        addStory({
          householdId: p.householdId,
          vraag: t('voice.dagboekTitel'),
          tekst: p.tekst,
          blob: p.audio?.blob,
          seconden: p.audio?.seconden,
          mimeType: p.audio?.mimeType,
          delen: p.delen,
          soort: 'dagboek',
          titel: p.titel,
        }),
      stuurBericht: (p) => sendTextMessage(p.householdId, 'person', p.tekst),
      bevestigMedicatie: (ids) => confirmMoments(ids),
    }),
    [],
  )
  const engine = useMemo(() => new ActionEngine(diensten), [diensten])
  const service = useMemo(() => maakIntentService(), [])

  const actieContext = useCallback((): ActieContext => {
    const k = kennisRef.current
    const { hh, tz } = hhRef.current
    return {
      householdId: hh,
      tz,
      nu: new Date(),
      mensen: k.people
        .filter((p) => p.kind !== 'self')
        .map((p) => ({ naam: p.name, telefoon: p.phone })),
      medicatie: (k.medicatie ?? []).map((m) => ({ id: m.id, due_at: m.due_at, taken_at: m.taken_at })),
      magBellen: magBellen(huidigePrefs()),
      // Verhalen zijn standaard gedeeld met familie, in elke fase. De
      // bewoner kan een fragment daarna nog privé zetten.
      dagboekDelen: true,
    }
  }, [])

  const beantwoord = useCallback(async (v: Gevalideerd, tekst: string): Promise<Antwoord> => {
    const k = kennisRef.current
    const { hh, tz } = hhRef.current

    if (v.intent === 'get_upcoming_events') {
      const lijst = await getKomende(hh)
      if (lijst.length === 0) return { zeg: t('voice.komendeLeeg') }
      const fmt = new Intl.DateTimeFormat(locale(), { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })
      const regels = lijst.map((e) => `${fmt.format(new Date(e.starts_at))}, ${hhmm(new Date(e.starts_at), tz)} — ${e.title}`)
      return { zeg: `${t('voice.komende')} ${regels.slice(0, 3).join('. ')}.`, regels }
    }

    if (v.intent === 'get_today_schedule') {
      const nu = new Date()
      const vandaag = localDateKey(nu, tz)
      const nog = k.events.filter(
        (e) =>
          !e.done_at &&
          localDateKey(new Date(e.starts_at), tz) === vandaag &&
          new Date(e.starts_at).getTime() > nu.getTime() - 30 * 60_000,
      )
      if (nog.length === 0) return { zeg: t('voice.niets') }
      const regels = nog.map((e) => `${hhmm(new Date(e.starts_at), tz)} — ${e.title}`)
      return { zeg: regels.slice(0, 4).join('. ') + '.', regels, link: { naar: '/', label: t('nav.vandaag') } }
    }

    // Een vraag: eerst de eigen regels (offline, uit wat familie invulde),
    // dan pas de bestaande edge function `ask`. Die antwoordt alleen uit
    // eigen gegevens, of zegt dat ze het niet weet.
    const a = regelAntwoord(tekst, k)
    if (a.titel !== t('ass.nietZeker')) {
      return { zeg: [a.titel, ...a.regels].join(' '), regels: a.regels, bellen: a.bellen, link: a.link }
    }
    try {
      const { data, error } = await supabase.functions.invoke('ask', {
        body: { household_id: hh, vraag: tekst, taal: taal() },
      })
      if (!error && data?.titel) {
        const regels: string[] = data.regels ?? []
        return { zeg: [data.titel, ...regels].join(' '), regels }
      }
    } catch {
      /* laag 1 blijft staan */
    }
    return { zeg: [a.titel, ...a.regels].join(' '), regels: a.regels }
  }, [])

  const gesprekDiensten = useCallback((): GesprekDiensten => {
    const { hh, tz } = hhRef.current
    return {
      nu: () => new Date(),
      tz,
      taal: taal(),
      nieuwId,
      interpreteer: async (tekst, lopend) =>
        (await service.interpreteer({ tekst, householdId: hh, taal: taal(), tz, nu: new Date(), lopend })).resultaat,
      voerUit: (v, actieId, audio) =>
        engine.voerUit(v, actieId, audio ? { ...actieContext(), audio } : actieContext()),
      beantwoord,
      bevestigDetails: (v) => {
        const ctx = actieContext()
        if (v.intent === 'mark_medication_taken') {
          const tijden = openMedicatie(ctx).map((m) => hhmm(new Date(m.due_at), tz))
          return { tijden: tijden.join(', ') }
        }
        if (v.intent === 'call_contact' && v.parameters.contact) {
          return { naam: vindPersoon(v.parameters.contact, ctx.mensen)?.naam }
        }
        return {}
      },
    }
  }, [service, engine, actieContext, beantwoord])

  // ------------------------------------------------------------------
  //  De lus: luisteren → verwerken → spreken → (weer luisteren)
  // ------------------------------------------------------------------

  const luisterNuRef = useRef<() => Promise<void>>(async () => {})

  const neemOp = useCallback(
    async (sessie: number) => {
      setFase('opname')
      dagboekAfgebrokenRef.current = false
      const o = await opname.start()
      if (sessie !== sessieRef.current || dagboekAfgebrokenRef.current) return
      if (!o) {
        standRef.current = RUST
        setBeurt({ stand: RUST, zeg: t('voice.actieMislukt'), status: 'mislukt', luisterNa: false })
        setFase('wacht')
        return
      }
      setFase('bewaart')
      await stuurRef.current({ soort: 'opname', ...o })
    },
    [opname],
  )

  const stuur = useCallback(
    async (invoer: Invoer) => {
      const sessie = sessieRef.current
      setFase('verwerkt')
      const b = await verwerk(standRef.current, invoer, gesprekDiensten())
      if (sessie !== sessieRef.current) return
      standRef.current = b.stand
      setBeurt(b)
      stilteRef.current = invoer.soort === 'nietVerstaan' ? stilteRef.current + 1 : 0
      for (const sleutel of b.ververs ?? []) queryClient.invalidateQueries({ queryKey: [sleutel] })

      setFase('spreekt')
      await zeg(b.zeg)
      if (sessie !== sessieRef.current) return

      if (b.bellen) window.location.href = `tel:${b.bellen.nummer.replace(/\s/g, '')}`
      if (b.status === 'dagboek') return neemOp(sessie)
      if (b.luisterNa && stilteRef.current < MAX_STILTE && !geenSpraakRef.current) return luisterNuRef.current()
      setFase('wacht')
    },
    [gesprekDiensten, queryClient, neemOp],
  )
  const stuurRef = useRef(stuur)
  stuurRef.current = stuur

  const luisterNu = useCallback(async () => {
    const sessie = sessieRef.current
    zwijg()
    luisterRef.current?.stop()
    setFase('luistert')
    const l = luister()
    luisterRef.current = l
    try {
      const tekst = await l.klaar
      if (sessie !== sessieRef.current || luisterRef.current !== l) return
      luisterRef.current = null
      if (!tekst) return stuurRef.current({ soort: 'nietVerstaan' })
      setGehoord(tekst)
      return stuurRef.current({ soort: 'tekst', tekst })
    } catch (e) {
      if (sessie !== sessieRef.current) return
      luisterRef.current = null
      if (e instanceof SpraakFout && e.soort !== 'fout') {
        geenSpraakRef.current = true
        setGeenSpraak(true)
        const zin = e.soort === 'geweigerd' ? t('spraak.micVerbodenTyp') : t('voice.geenSpraak')
        setBeurt({ stand: standRef.current, zeg: zin, status: 'mislukt', luisterNa: false })
        setFase('wacht')
        return
      }
      return stuurRef.current({ soort: 'nietVerstaan' })
    }
  }, [])
  luisterNuRef.current = luisterNu

  // Openen: begroeten en meteen luisteren, zoals in de auto.
  useEffect(() => {
    if (!open) return
    const sessie = ++sessieRef.current
    standRef.current = RUST
    stilteRef.current = 0
    setGehoord('')
    const naam = huidigePrefs().assistentNaam
    const hallo = naam ? t('voice.halloNaam', { naam }) : t('voice.hallo')
    setBeurt({ stand: RUST, zeg: hallo, status: 'vraag', luisterNa: true })
    setFase('spreekt')
    void (async () => {
      await zeg(hallo)
      if (sessie !== sessieRef.current) return
      if (geenSpraakRef.current) setFase('wacht')
      else void luisterNu()
    })()
    return () => {
      sessieRef.current++
      luisterRef.current?.stop()
      luisterRef.current = null
      opname.annuleer()
      zwijg()
      standRef.current = RUST
      setFase('stil')
    }
    // opname.annuleer is stabiel; luisterNu ook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Klaar en niets meer te doen: na een paar seconden vanzelf dicht.
  useEffect(() => {
    if (fase !== 'wacht' || !beurt) return
    if (beurt.status !== 'gelukt' && beurt.status !== 'geannuleerd') return
    if (beurt.bellen || beurt.regels?.length) return
    // Na een dagboekfragment langer open: de bewoner kan het nog privé zetten.
    const id = window.setTimeout(sluiten, beurt.dagboekId ? 20000 : 6000)
    return () => window.clearTimeout(id)
  }, [fase, beurt, sluiten])

  const knop = useCallback((k: 'ja' | 'nee' | 'aanpassen') => {
    luisterRef.current?.stop()
    luisterRef.current = null
    zwijg()
    void stuurRef.current({ soort: 'knop', knop: k })
  }, [])

  const typ = useCallback((tekst: string) => {
    luisterRef.current?.stop()
    luisterRef.current = null
    zwijg()
    setGehoord(tekst)
    void stuurRef.current({ soort: 'tekst', tekst })
  }, [])

  const microfoon = useCallback(() => {
    if (fase === 'luistert') {
      // Nog eens tikken = ik ben klaar met praten.
      luisterRef.current?.stop()
      return
    }
    stilteRef.current = 0
    void luisterNu()
  }, [fase, luisterNu])

  const [prive, setPrive] = useState<'nee' | 'bezig' | 'ja' | 'fout'>('nee')
  useEffect(() => setPrive('nee'), [beurt])

  const maakPrive = useCallback(async () => {
    if (!beurt?.dagboekId) return
    setPrive('bezig')
    try {
      await setShared(beurt.dagboekId, false)
      setPrive('ja')
      queryClient.invalidateQueries({ queryKey: ['stories'] })
      void zeg(t('voice.priveGedaan'))
    } catch {
      setPrive('fout')
    }
  }, [beurt, queryClient])

  return {
    open,
    sluiten,
    prive,
    maakPrive,
    fase,
    beurt,
    gehoord,
    geenSpraak,
    knop,
    typ,
    microfoon,
    dagboekKlaar: opname.stop,
    dagboekStop: () => {
      dagboekAfgebrokenRef.current = true
      opname.annuleer()
      void stuurRef.current({ soort: 'knop', knop: 'nee' })
    },
    opnameSeconden: opname.seconden,
    stand: standRef.current,
  }
}
