import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircleHeart, Mic, Square } from 'lucide-react'
import { addStory, getStories } from '../../services/stories'
import { useVoiceRecorder } from '../messages/useVoiceRecorder'
import { localDateKey } from '../../lib/time'
import { huidigePrefs } from '../settings/useDisplayPrefs'
import { spreek } from '../voice/useSpeech'
import { vraagVanVandaag } from './vragen'

const NIET_VANDAAG = 'thuis.vertel.niet'

/**
 * Eén vraag per dag over het eigen leven. Het antwoord wordt bewaard, bij
 * voorkeur in de eigen stem. Het is het enige deel van de app waar de
 * persoon niet iets ontvangt, maar iets geeft.
 *
 * Nooit opdringerig: "niet vandaag" verbergt de vraag tot morgen, en er is
 * geen teller, geen reeks, niets om achter te lopen.
 */
export default function VertelEens({
  householdId,
  timezone,
  extraVraag,
  onKlaar,
}: {
  householdId: string
  timezone: string
  /** Een vraag die van buitenaf komt, zoals over een foto van vandaag. */
  extraVraag?: string | null
  onKlaar?: () => void
}) {
  const dag = localDateKey(new Date(), timezone)
  const queryClient = useQueryClient()
  const [overslaan, setOverslaan] = useState(0)
  const [typen, setTypen] = useState(false)
  const [tekst, setTekst] = useState('')
  const [delen, setDelen] = useState(true)
  const [bedankt, setBedankt] = useState(false)
  const [verborgen, setVerborgen] = useState(() => {
    try {
      return localStorage.getItem(NIET_VANDAAG) === dag
    } catch {
      return false
    }
  })

  const { data: verhalen } = useQuery({
    queryKey: ['stories', householdId],
    queryFn: () => getStories(householdId),
    enabled: !!householdId,
  })

  const opname = useVoiceRecorder()

  const beantwoord = new Set((verhalen ?? []).map((v) => v.question))
  const vraag = extraVraag ?? vraagVanVandaag(dag, beantwoord, overslaan)

  const bewaar = useMutation({
    mutationFn: () =>
      addStory({
        householdId,
        vraag: vraag!,
        tekst: typen ? tekst : undefined,
        blob: opname.recording?.blob,
        seconden: opname.recording?.seconds,
        mimeType: opname.recording?.mimeType,
        delen,
      }),
    onSuccess: async () => {
      opname.reset()
      setTekst('')
      setTypen(false)
      setBedankt(true)
      await queryClient.invalidateQueries({ queryKey: ['stories', householdId] })
      if (huidigePrefs().voice) spreek('Dank je. Dat verhaal is bewaard.')
      onKlaar?.()
    },
  })

  if (!vraag || (verborgen && !extraVraag)) return null

  if (bedankt && !extraVraag) {
    return (
      <section className="rounded-card bg-surface p-5 shadow-card">
        <p className="text-lg font-bold">Dank je wel.</p>
        <p className="mt-1 text-ink-soft">
          Je verhaal is bewaard.{delen ? ' Je familie kan het beluisteren.' : ''} Morgen is er een
          nieuwe vraag.
        </p>
      </section>
    )
  }

  const heeftAntwoord = !!opname.recording || (typen && tekst.trim().length > 0)

  return (
    <section
      aria-labelledby="vertel"
      className="rounded-card bg-surface p-6 shadow-card"
    >
      <h2 id="vertel" className="flex items-center gap-2 text-base font-bold text-ink-faint">
        <MessageCircleHeart size={20} strokeWidth={1.75} aria-hidden="true" />
        Vertel eens
      </h2>
      <p className="mt-2 text-2xl font-bold leading-snug tracking-tight">{vraag}</p>

      {/* Opnemen is de hoofdweg: een stem vertelt meer dan getypte tekst. */}
      {!typen ? (
        <div className="mt-4">
          {opname.state === 'recording' ? (
            <button
              onClick={opname.stop}
              className="flex min-h-[3.4rem] w-full items-center justify-center gap-2 rounded-pill bg-alert text-lg font-semibold text-white"
            >
              <Square size={20} strokeWidth={2} />
              Stop — {opname.seconds} sec
            </button>
          ) : opname.recording ? (
            <div className="space-y-2">
              <audio src={opname.recording.url} controls className="w-full" />
              <button
                onClick={opname.reset}
                className="text-sm font-semibold text-ink-soft underline underline-offset-4"
              >
                Opnieuw opnemen
              </button>
            </div>
          ) : (
            <button
              onClick={opname.start}
              className="flex min-h-[3.4rem] w-full items-center justify-center gap-2 rounded-pill bg-accent-ink text-lg font-semibold text-white"
            >
              <Mic size={20} strokeWidth={1.75} />
              Vertel het
            </button>
          )}
          {opname.error ? <p className="mt-2 text-sm text-alert">{opname.error}</p> : null}
        </div>
      ) : (
        <textarea
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          rows={4}
          autoFocus
          placeholder="Schrijf zoveel of zo weinig als je wil."
          className="mt-4 w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 py-3 text-lg"
        />
      )}

      {heeftAntwoord ? (
        <div className="mt-4 space-y-3">
          <label className="flex items-center gap-3 text-ink-soft">
            <input
              type="checkbox"
              checked={delen}
              onChange={(e) => setDelen(e.target.checked)}
              className="h-5 w-5"
            />
            Mijn familie mag dit beluisteren
          </label>
          <button
            onClick={() => bewaar.mutate()}
            disabled={bewaar.isPending}
            className="flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white disabled:opacity-60"
          >
            {bewaar.isPending ? 'Bewaren…' : 'Bewaar mijn verhaal'}
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-semibold text-ink-soft">
        <button
          onClick={() => {
            setTypen(!typen)
            opname.reset()
          }}
          className="underline underline-offset-4"
        >
          {typen ? 'Liever inspreken' : 'Liever typen'}
        </button>
        {!extraVraag ? (
          <button onClick={() => setOverslaan(overslaan + 1)} className="underline underline-offset-4">
            Andere vraag
          </button>
        ) : null}
        <button
          onClick={() => {
            if (extraVraag) {
              onKlaar?.()
              return
            }
            try {
              localStorage.setItem(NIET_VANDAAG, dag)
            } catch {
              // Niet erg: dan verschijnt de vraag gewoon opnieuw.
            }
            setVerborgen(true)
          }}
          className="underline underline-offset-4"
        >
          Niet vandaag
        </button>
      </div>

      {bewaar.error ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          Bewaren lukte niet. Probeer het straks opnieuw.
        </p>
      ) : null}
    </section>
  )
}
