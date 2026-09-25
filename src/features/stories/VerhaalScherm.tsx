import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getStories, storyAudioUrl } from '../../services/stories'
import { useHousehold } from '../household/useHousehold'

/**
 * Eén verhaal, na het scannen van de code in het boek.
 *
 * Bewust een gewoon scherm van de app en geen publieke pagina: wie de
 * code scant moet ingelogd zijn en bij het huishouden horen. Zo blijft
 * een boek dat rondgaat in de familie veilig, ook als het ooit bij iemand
 * anders terechtkomt.
 */
export default function VerhaalScherm() {
  const { id } = useParams()
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['stories', hh],
    queryFn: () => getStories(hh),
    enabled: !!hh,
  })

  const verhaal = (data ?? []).find((v) => v.id === id)

  return (
    <main className="mx-auto max-w-[36rem] px-5 py-10">
      <Link to="/levensboek" className="font-semibold underline underline-offset-4">
        ‹ Het boek
      </Link>

      {isLoading ? <p className="mt-8 text-ink-soft">Bezig met laden…</p> : null}

      {!isLoading && !verhaal ? (
        <p className="mt-8 text-ink-soft">
          Dit verhaal is er niet meer, of het hoort bij een ander huishouden.
        </p>
      ) : null}

      {verhaal ? (
        <article className="mt-8">
          <h1 className="text-2xl font-bold text-ink-soft">{verhaal.question}</h1>

          {verhaal.audio_path ? (
            <Speler pad={verhaal.audio_path} seconden={verhaal.audio_seconds} />
          ) : null}

          {verhaal.body ? (
            <p className="mt-6 whitespace-pre-wrap text-xl leading-relaxed">{verhaal.body}</p>
          ) : null}
        </article>
      ) : null}
    </main>
  )
}

function Speler({ pad, seconden }: { pad: string; seconden: number | null }) {
  const [speelt, setSpeelt] = useState(false)
  const [bezig, setBezig] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)

  useEffect(() => () => audio.current?.pause(), [])

  async function wissel() {
    if (speelt) {
      audio.current?.pause()
      setSpeelt(false)
      return
    }

    setBezig(true)
    try {
      const url = await storyAudioUrl(pad)
      const speler = new Audio(url)
      audio.current = speler
      speler.onended = () => setSpeelt(false)
      await speler.play()
      setSpeelt(true)
    } catch {
      setSpeelt(false)
    } finally {
      setBezig(false)
    }
  }

  return (
    <button
      onClick={wissel}
      disabled={bezig}
      className="mt-6 flex min-h-big w-full items-center gap-4 rounded-card border-[1.5px] border-accent bg-accent-soft p-5 text-left shadow-card"
    >
      <span
        aria-hidden="true"
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent-ink text-3xl text-white"
      >
        {speelt ? '⏸' : '▶'}
      </span>
      <span>
        <span className="block text-xl font-bold">
          {speelt ? 'Aan het spelen' : 'In eigen stem'}
        </span>
        {seconden ? <span className="text-ink-soft">{seconden} seconden</span> : null}
      </span>
    </button>
  )
}
