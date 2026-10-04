import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Check, HeartHandshake, Trash2, X } from 'lucide-react'
import DictateButton from '../../components/DictateButton'
import StoragePhoto from '../../components/StoragePhoto'
import { useAuth } from '../auth/AuthProvider'
import { getPeople } from '../../services/people'
import {
  FOTO_BUCKET,
  bezoekZin,
  legBezoekVast,
  recenteBezoeken,
  uploadBezoekFoto,
  wisBezoek,
  type Bezoek,
} from '../../services/bezoek'
import { hhmm, localDateKey, plusDagen, zonedToUtc } from '../../lib/time'
import { tt, uiLocale } from '../../lib/uiTaal'

type Moment = 'nu' | 'vandaag' | 'gisteren'

function foutTekstBezoek(e: unknown): string {
  const code = (e as { code?: string } | null)?.code
  if (code === 'PGRST205' || code === '42P01') return tt('Het bezoekboek staat nog niet aan. Vraag de beheerder om de update te installeren.')
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return tt('Het bezoek kon niet bewaard worden.')
}

/** Het moment van het bezoek, als echte tijd. Pure functie, getest. */
export function momentNaarTijd(m: Moment, uur: string, tz: string, nu: Date = new Date()): Date {
  if (m === 'nu') return nu
  const vandaag = localDateKey(nu, tz)
  const dag = m === 'vandaag' ? vandaag : plusDagen(vandaag, -1)
  const t = zonedToUtc(dag, uur || '12:00', tz)
  // Een uur later dan nu, vandaag: dan bedoelt iemand "net".
  return t.getTime() > nu.getTime() ? nu : t
}

const DAG = (iso: string, tz: string) =>
  new Intl.DateTimeFormat(uiLocale(), { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso))

/**
 * "Ik was op bezoek": in twintig seconden vastgelegd, zodat de persoon het
 * de rest van de dag op haar scherm ziet en het niet kan vergeten.
 *
 * Familie: met foto en een keuze uit de familiekaarten. Zorgteam (WZC):
 * zonder foto, met een vrije naam (de kapster, een vrijwilliger).
 */
export default function BezoekVastleggen({
  householdId,
  personName,
  timezone,
  vorm,
}: {
  householdId: string
  personName: string
  timezone: string
  vorm: 'familie' | 'zorgteam'
}) {
  const queryClient = useQueryClient()
  const { session } = useAuth()
  const ik = session?.user.id ?? ''
  const mensen = useQuery({
    queryKey: ['people', householdId],
    queryFn: () => getPeople(householdId),
    enabled: !!householdId && vorm === 'familie',
    staleTime: 5 * 60_000,
  })
  const lijst = useQuery({
    queryKey: ['bezoeken', householdId, 7],
    queryFn: () => recenteBezoeken(householdId, 7),
    enabled: !!householdId,
  })

  const familie = useMemo(() => (mensen.data ?? []).filter((p) => p.kind !== 'self'), [mensen.data])
  const mijnKaart = familie.find((p) => p.profile_id === ik)

  const [open, setOpen] = useState(false)
  const [kaart, setKaart] = useState<string>('') // '' = iemand anders
  const [naam, setNaam] = useState('')
  const [notitie, setNotitie] = useState('')
  const [moment, setMoment] = useState<Moment>('nu')
  const [uur, setUur] = useState('')
  const [foto, setFoto] = useState<File | null>(null)
  const [voorbeeld, setVoorbeeld] = useState<string | null>(null)
  const [klaar, setKlaar] = useState<string | null>(null)
  const [zonderFoto, setZonderFoto] = useState(false)


  useEffect(() => {
    if (!foto) {
      setVoorbeeld(null)
      return
    }
    const url = URL.createObjectURL(foto)
    setVoorbeeld(url)
    return () => URL.revokeObjectURL(url)
  }, [foto])

  const gekozenNaam = kaart ? familie.find((p) => p.id === kaart)?.name ?? '' : naam.trim()

  const bewaar = useMutation({
    mutationFn: async () => {
      const wanneer = momentNaarTijd(moment, uur, timezone)
      const id = await legBezoekVast({
        hh: householdId,
        naam: gekozenNaam,
        kaart: kaart || null,
        notitie,
        wanneer,
        auteur: ik,
      })
      // Het bezoek staat er al. Mislukt de foto, dan blijft het bezoek
      // bewaard; opnieuw "Bewaren" zou het anders twee keer vastleggen.
      let zonderFoto = false
      if (foto) {
        try {
          await uploadBezoekFoto(householdId, id, foto)
        } catch {
          zonderFoto = true
        }
      }
      const zin = bezoekZin({ visitor_name: gekozenNaam, visited_at: wanneer.toISOString() }, timezone)
      return { zin, zonderFoto }
    },
    onSuccess: ({ zin, zonderFoto }) => {
      setKlaar(zin)
      setZonderFoto(zonderFoto)
      setOpen(false)
      setNotitie('')
      setFoto(null)
      setMoment('nu')
      setUur('')
      queryClient.invalidateQueries({ queryKey: ['bezoeken', householdId] })
    },
  })
  const wis = useMutation({
    mutationFn: wisBezoek,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bezoeken', householdId] }),
  })

  const keuze = 'flex min-h-[2.75rem] items-center rounded-pill border-[1.5px] px-4 font-semibold'
  const aan = 'border-accent-ink bg-accent-soft text-accent-ink'
  const uit = 'border-line bg-surface'
  const bezoeken: Bezoek[] = lijst.data ?? []

  return (
    <section className="rounded-card bg-surface p-6 shadow-card" aria-labelledby="bezoek-kop">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="bezoek-kop" className="flex items-center gap-2 text-lg font-bold">
            <HeartHandshake size={20} strokeWidth={1.75} aria-hidden="true" /> {tt('Wie was er hier?')}
          </h2>
          <p className="mt-1 text-ink-soft">
            {vorm === 'familie'
              ? tt('Leg je bezoek vast, dan ziet {naam} het de rest van de dag op het scherm en vergeet het niet.', { naam: personName })
              : tt('Wie kwam er langs bij {naam}? De familie en {naam} zien het.', { naam: personName })}
          </p>
        </div>
        {!open ? (
          <button
            onClick={() => {
              setOpen(true)
              setKlaar(null)
              // Eén keer bij het openen: wie zelf een kaart heeft, staat al gekozen.
              if (mijnKaart) {
                setKaart(mijnKaart.id)
                setNaam('')
              }
            }}
            className="min-h-touch shrink-0 rounded-pill bg-accent-ink px-5 font-semibold text-white"
          >
            {vorm === 'familie' ? tt('Ik was op bezoek') : tt('Bezoek vastleggen')}
          </button>
        ) : null}
      </div>

      {klaar ? (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-2xl bg-accent-soft p-4 text-accent-ink">
          <Check size={20} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            {tt('Bewaard. {naam} ziet op het scherm:', { naam: personName })} <strong>“{klaar}”</strong>
            {zonderFoto ? ' ' + tt('De foto kon niet mee; het bezoek staat er wel.') : null}
          </span>
        </p>
      ) : null}

      {open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (gekozenNaam) bewaar.mutate()
          }}
          className="mt-4 space-y-4 rounded-2xl border border-line p-4"
        >
          <fieldset>
            <legend className="text-sm font-semibold">{tt('Wie?')}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {familie.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => {
                    setKaart(p.id)
                    setNaam('')
                  }}
                  aria-pressed={kaart === p.id}
                  className={`${keuze} ${kaart === p.id ? aan : uit}`}
                >
                  {p.name}
                </button>
              ))}
              {familie.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setKaart('')}
                  aria-pressed={kaart === ''}
                  className={`${keuze} ${kaart === '' ? aan : uit}`}
                >
                  {tt('Iemand anders')}
                </button>
              ) : null}
            </div>
            {kaart === '' ? (
              <label className="mt-2 block">
                <span className="sr-only">{tt('Naam')}</span>
                <input
                  value={naam}
                  onChange={(e) => setNaam(e.target.value)}
                  maxLength={80}
                  placeholder={vorm === 'familie' ? tt('Naam, bv. Tante Lea') : tt('Bv. de kapster, een vrijwilliger')}
                  className="block min-h-touch w-full rounded-2xl border border-line-strong bg-surface px-4 text-lg"
                />
              </label>
            ) : null}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">{tt('Wanneer?')}</legend>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {(['nu', 'vandaag', 'gisteren'] as Moment[]).map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setMoment(m)}
                  aria-pressed={moment === m}
                  className={`${keuze} ${moment === m ? aan : uit}`}
                >
                  {m === 'nu' ? tt('Net') : m === 'vandaag' ? tt('Eerder vandaag') : tt('Gisteren')}
                </button>
              ))}
              {moment !== 'nu' ? (
                <label className="flex items-center gap-2">
                  <span className="text-sm text-ink-soft">{tt('om')}</span>
                  <input
                    type="time"
                    value={uur}
                    onChange={(e) => setUur(e.target.value)}
                    className="min-h-[2.75rem] rounded-2xl border border-line-strong bg-surface px-3"
                  />
                </label>
              ) : null}
            </div>
          </fieldset>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="bezoek-notitie" className="text-sm font-semibold">
                {tt('Wat deden jullie?')} <span className="font-normal text-ink-soft">{tt('(mag leeg)')}</span>
              </label>
              <DictateButton onTekst={(t) => setNotitie(t.slice(0, 300))} label={tt('Inspreken')} />
            </div>
            <input
              id="bezoek-notitie"
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              maxLength={300}
              placeholder={tt('Samen koffie gedronken en over Spanje gepraat.')}
              className="mt-1 block min-h-touch w-full rounded-2xl border border-line-strong bg-surface px-4 text-lg"
            />
          </div>

          {vorm === 'familie' ? (
            <div>
              {voorbeeld ? (
                <div className="relative w-40">
                  <img src={voorbeeld} alt={tt('Gekozen foto')} className="aspect-[4/3] w-40 rounded-2xl object-cover" />
                  <button
                    type="button"
                    onClick={() => setFoto(null)}
                    aria-label={tt('Foto weghalen')}
                    className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full bg-surface shadow-card"
                  >
                    <X size={16} strokeWidth={2} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <label className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-pill border-[1.5px] border-line-strong px-4 font-semibold">
                  <Camera size={18} strokeWidth={1.75} aria-hidden="true" />
                  {tt('Foto toevoegen')}
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => {
                      setFoto(e.target.files?.[0] ?? null)
                      e.target.value = ''
                    }}
                  />
                </label>
              )}
              <p className="mt-1 text-sm text-ink-soft">{tt('Een foto van jullie samen helpt het meest om het te onthouden.')}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!gekozenNaam || bewaar.isPending}
              className="min-h-touch flex-1 rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-50 sm:flex-none"
            >
              {bewaar.isPending ? tt('Bezig…') : tt('Bewaren')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
            >
              {tt('Annuleren')}
            </button>
          </div>
          {bewaar.error ? (
            <p role="alert" className="text-sm text-alert">
              {foutTekstBezoek(bewaar.error)}
            </p>
          ) : null}
        </form>
      ) : null}

      {bezoeken.length > 0 ? (
        <div className="mt-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{tt('Deze week')}</h3>
          <ul className="mt-2 space-y-2">
            {bezoeken.map((b) => {
              const wisbaar = b.author_id === ik && Date.now() - new Date(b.created_at).getTime() < 24 * 3600_000
              return (
                <li key={b.id} className="flex items-center gap-3 rounded-2xl bg-surface-soft p-3">
                  {b.photo_path ? (
                    <StoragePhoto path={b.photo_path} bucket={FOTO_BUCKET} alt="" className="h-14 w-14 shrink-0 rounded-xl" />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{b.visitor_name}</span>
                    <span className="block text-sm text-ink-soft">
                      {DAG(b.visited_at, timezone)} · {hhmm(new Date(b.visited_at), timezone)}
                      {b.note ? ` · ${b.note}` : ''}
                    </span>
                  </span>
                  {wisbaar ? (
                    <button
                      onClick={() => {
                        if (confirm(tt('Dit bezoek wissen?'))) wis.mutate(b)
                      }}
                      aria-label={tt('Bezoek van {naam} wissen', { naam: b.visitor_name })}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-surface"
                    >
                      <Trash2 size={17} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : lijst.data ? (
        <p className="mt-4 rounded-2xl bg-surface-soft px-4 py-3 text-ink-soft">{tt('Deze week nog geen bezoek vastgelegd.')}</p>
      ) : null}
    </section>
  )
}
