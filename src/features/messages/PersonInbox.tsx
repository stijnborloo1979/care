import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPersonInbox, markRead, signedUrl, type InboxMessage } from './messages'
import StoragePhoto from '../../components/StoragePhoto'
import { locale } from '../../lib/i18n'

/**
 * Eén bericht als één grote knop. Indrukken, afspelen, klaar.
 * Geen lijst om door te scrollen, geen tekst om te lezen.
 */
export function MessageButton({ message }: { message: InboxMessage }) {
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  async function speel() {
    if (playing) {
      audioRef.current?.pause()
      setPlaying(false)
      return
    }

    setError(null)

    if (!message.audio_path) {
      // Een tekstbericht: laten voorlezen door het toestel zelf.
      if (message.body && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(message.body)
        u.lang = locale()
        u.rate = 0.92
        window.speechSynthesis.speak(u)
      }
      await bevestig()
      return
    }

    setBusy(true)
    try {
      const url = await signedUrl(message.audio_path)
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => setPlaying(false)
      audio.onerror = () => {
        setPlaying(false)
        setError('Het bericht kan nu niet afgespeeld worden.')
      }
      await audio.play()
      setPlaying(true)
      await bevestig()
    } catch {
      setError('Het bericht kan nu niet afgespeeld worden.')
    } finally {
      setBusy(false)
    }
  }

  async function bevestig() {
    if (message.seen) return
    try {
      await markRead(message.id)
      await queryClient.invalidateQueries({ queryKey: ['inbox', message.household_id] })
    } catch {
      // Een mislukte leesbevestiging mag het afspelen nooit in de weg staan.
    }
  }

  const naam = message.author_name ?? 'Familie'

  // Een foto zonder opname is niets om af te spelen: die tonen we gewoon,
  // groot genoeg om er iets aan te hebben.
  if (message.photo_path && !message.audio_path) {
    return (
      <div className="rounded-card border-[1.5px] border-accent bg-accent-soft p-4 shadow-card">
        <p className="text-xl font-bold">Foto van {naam}</p>
        <div className="mt-3 overflow-hidden rounded-2xl">
          <StoragePhoto bucket="messages" path={message.photo_path} alt={`Foto van ${naam}`} />
        </div>
        {message.body ? <p className="mt-3 text-lg">{message.body}</p> : null}
        {!message.seen ? (
          <button
            onClick={bevestig}
            className="mt-3 min-h-touch w-full rounded-pill bg-accent-ink px-5 text-lg font-bold text-white"
          >
            Gezien
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <button
      onClick={speel}
      disabled={busy}
      aria-pressed={playing}
      aria-label={`Bericht van ${naam} ${playing ? 'pauzeren' : 'afspelen'}`}
      className="flex min-h-big w-full items-center gap-4 rounded-card border-[1.5px] border-accent bg-accent-soft p-5 text-left shadow-card"
    >
      <span
        aria-hidden="true"
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent-ink text-3xl text-white"
      >
        {playing ? '⏸' : '▶'}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-xl font-bold">Bericht van {naam}</span>
        <span className="block text-ink-soft">
          {message.audio_path
            ? playing
              ? 'Aan het afspelen…'
              : message.seen
                ? 'Druk om nog eens te luisteren'
                : `Druk om te luisteren${message.audio_seconds ? ` · ${message.audio_seconds} sec` : ''}`
            : message.body}
        </span>
        {error ? (
          <span role="alert" className="mt-1 block text-alert">
            {error}
          </span>
        ) : null}
      </span>

      {!message.seen ? (
        <span className="shrink-0 rounded-pill bg-accent-ink px-3 py-1 text-sm font-semibold text-white">
          nieuw
        </span>
      ) : null}
    </button>
  )
}

/**
 * Alles wat nu voor de persoon klaarstaat. De view person_inbox filtert
 * zelf al op vervaldatum, dus hier zit geen logica.
 */
export default function PersonInbox({ householdId }: { householdId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['inbox', householdId],
    queryFn: () => getPersonInbox(householdId),
    refetchInterval: 60_000,
  })

  if (isLoading) return <p className="text-ink-soft">Berichten laden…</p>
  if (isError) return <p className="text-ink-soft">Berichten zijn nu niet te zien.</p>
  if (!data || data.length === 0) return null

  return (
    <section className="space-y-3" aria-label="Berichten voor jou">
      {data.map((m) => (
        <MessageButton key={m.id} message={m} />
      ))}
    </section>
  )
}
