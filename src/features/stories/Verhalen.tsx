import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Pause } from 'lucide-react'
import { deleteStory, getStories, storyAudioUrl, type LifeStory } from '../../services/stories'

/**
 * Wat de persoon vertelde, in zijn eigen stem. Voor familie misschien het
 * waardevolste wat de app bewaart.
 */
export default function Verhalen({ householdId, naam }: { householdId: string; naam: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['stories', householdId],
    queryFn: () => getStories(householdId),
    enabled: !!householdId,
  })

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">Verhalen van {naam}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Elke dag stelt de app {naam} één vraag over het eigen leven. Wat gedeeld wordt, staat hier.
      </p>

      {isLoading ? <p className="mt-4 text-ink-soft">Bezig met laden…</p> : null}

      {!isLoading && (data ?? []).length === 0 ? (
        <p className="mt-4 text-ink-soft">
          Nog geen verhalen. Ze verschijnen hier zodra {naam} een vraag beantwoordt.
        </p>
      ) : null}

      <ul className="mt-4 space-y-3">
        {(data ?? []).map((v) => (
          <Verhaal key={v.id} verhaal={v} householdId={householdId} />
        ))}
      </ul>
    </section>
  )
}

function Verhaal({ verhaal, householdId }: { verhaal: LifeStory; householdId: string }) {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [speelt, setSpeelt] = useState(false)
  const queryClient = useQueryClient()

  const wis = useMutation({
    mutationFn: () => deleteStory(verhaal),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stories', householdId] }),
  })

  async function speel() {
    if (speelt && audio) {
      audio.pause()
      setSpeelt(false)
      return
    }
    const a = audio ?? new Audio(await storyAudioUrl(verhaal.audio_path!))
    a.onended = () => setSpeelt(false)
    setAudio(a)
    await a.play()
    setSpeelt(true)
  }

  return (
    <li className="rounded-2xl bg-surface-soft p-4">
      <p className="font-semibold">{verhaal.question}</p>
      {verhaal.body ? <p className="mt-2 whitespace-pre-line text-ink-soft">{verhaal.body}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {verhaal.audio_path ? (
          <button
            onClick={speel}
            className="inline-flex min-h-[2.6rem] items-center gap-2 rounded-pill bg-accent-ink px-4 text-sm font-semibold text-white"
          >
            {speelt ? <Pause size={16} strokeWidth={2} /> : <Play size={16} strokeWidth={2} />}
            {speelt ? 'Pauze' : `Beluisteren${verhaal.audio_seconds ? ` · ${verhaal.audio_seconds} sec` : ''}`}
          </button>
        ) : null}
        <span className="text-sm text-ink-faint">
          {new Date(verhaal.created_at).toLocaleDateString('nl-BE', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </span>
        <button
          onClick={() => {
            if (confirm('Dit verhaal verwijderen? Dat kan niet ongedaan gemaakt worden.')) wis.mutate()
          }}
          className="ml-auto text-sm font-semibold text-ink-faint underline underline-offset-4"
        >
          Verwijderen
        </button>
      </div>
    </li>
  )
}
