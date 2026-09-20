import { Link, useParams } from 'react-router-dom'
import StoragePhoto from '../../components/StoragePhoto'
import { useItem } from './useHomeMemory'

/**
 * Waar het ding ligt, en hoe het werkt. Eén stap per kaart, grote tekst,
 * en een knop die alles voorleest — want lezen is precies wat moeilijk
 * wordt.
 */
export default function ItemDetail() {
  const { itemId = '' } = useParams()
  const { data: item, isLoading } = useItem(itemId)

  function leesVoor() {
    if (!item || !('speechSynthesis' in window)) return
    const tekst = [
      item.name,
      item.where_text ?? '',
      ...item.item_step.map((s, i) => `Stap ${i + 1}: ${s.body}`),
    ].join('. ')
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(tekst)
    u.lang = 'nl-BE'
    u.rate = 0.92
    window.speechSynthesis.speak(u)
  }

  if (isLoading) return <p className="p-6 text-ink-soft">Bezig met laden…</p>
  if (!item) return <p className="p-6 text-ink-soft">Dit ding bestaat niet meer.</p>

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <Link
        to={`/memory/${item.room_id}`}
        className="font-semibold text-accent-ink underline underline-offset-4"
      >
        ‹ Terug
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">
        {item.emoji ? `${item.emoji} ` : ''}
        {item.name}
      </h1>

      <div className="mt-5">
        <StoragePhoto path={item.photo_path} emoji={item.emoji} alt={item.name} />
      </div>

      {item.where_text ? (
        <div className="mt-5 rounded-card border border-line bg-surface-soft p-5">
          <p className="text-base font-bold text-ink-faint">Waar</p>
          <p className="mt-1 text-xl">{item.where_text}</p>
        </div>
      ) : null}

      {item.item_step.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-bold">Stap voor stap</h2>
          <ol className="mt-3 space-y-3">
            {item.item_step.map((s, i) => (
              <li
                key={s.id}
                className="flex items-start gap-4 rounded-card border border-line bg-surface p-5"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[1.5px] border-accent bg-accent-soft text-lg font-extrabold text-accent-ink">
                  {i + 1}
                </span>
                <span className="text-xl leading-snug">{s.body}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <button
        onClick={leesVoor}
        className="mt-6 flex min-h-touch w-full items-center justify-center gap-2 rounded-pill border-[1.5px] border-line-strong px-5 text-lg font-semibold"
      >
        🔊 Lees dit voor
      </button>
    </main>
  )
}
