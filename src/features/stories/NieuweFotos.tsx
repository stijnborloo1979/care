import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getPhotos, type MemoryPhoto } from '../../services/memories'
import { getStories } from '../../services/stories'
import StoragePhoto from '../../components/StoragePhoto'
import VertelEens from './VertelEens'
import { nieuweFotos } from './nieuweFotos'
import { tt } from '../../lib/uiTaal'

/**
 * De persoon vertelt over foto's die familie heeft toegevoegd. Eén grote
 * foto tegelijk: eerst kijken, dan vertellen. Een verhaal dat niet bij een
 * foto hoort, kan ook: "Iets vertellen".
 *
 * Bewust geen bestanden kiezen: op een kiosk-tablet werkt dat niet. Alles
 * gaat via de eigen stem, zoals bij "Vertel eens".
 */
export default function NieuweFotos({ hh, timezone }: { hh: string; timezone: string }) {
  const [gekozen, setGekozen] = useState<MemoryPhoto | null>(null)
  const [vrij, setVrij] = useState(false)
  const [bewaard, setBewaard] = useState(false)

  const { data: fotos } = useQuery({
    queryKey: ['photos', hh],
    queryFn: () => getPhotos(hh),
    enabled: !!hh,
  })
  const { data: verhalen } = useQuery({
    queryKey: ['stories', hh],
    queryFn: () => getStories(hh),
    enabled: !!hh,
  })

  const nieuw = useMemo(() => nieuweFotos(fotos ?? [], verhalen ?? []), [fotos, verhalen])

  if (gekozen) {
    return (
      <section className="niet-printen mb-10 space-y-5 rounded-card bg-surface p-6 shadow-card">
        <button
          type="button"
          onClick={() => setGekozen(null)}
          className="min-h-touch font-semibold underline underline-offset-4"
        >
          ‹ {tt('Terug')}
        </button>
        <div className="overflow-hidden rounded-2xl">
          <StoragePhoto bucket="memories" path={gekozen.photo_path} alt={gekozen.title} />
        </div>
        <VertelEens
          householdId={hh}
          timezone={timezone}
          fotoId={gekozen.id}
          extraVraag={tt('Wat zie je op deze foto?')}
          onKlaar={() => {
            setGekozen(null)
            setBewaard(true)
          }}
        />
      </section>
    )
  }

  if (vrij) {
    return (
      <section className="niet-printen mb-10 space-y-5">
        <button
          type="button"
          onClick={() => setVrij(false)}
          className="min-h-touch font-semibold underline underline-offset-4"
        >
          ‹ {tt('Terug')}
        </button>
        <VertelEens
          householdId={hh}
          timezone={timezone}
          extraVraag={tt('Wat wil je vertellen?')}
          onKlaar={() => {
            setVrij(false)
            setBewaard(true)
          }}
        />
      </section>
    )
  }

  return (
    <section className="niet-printen mb-10 space-y-5">
      {nieuw.length > 0 ? (
        <>
          <h2 className="text-2xl font-extrabold">{tt("Nieuwe foto's")}</h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {nieuw.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => setGekozen(f)}
                  className="w-full overflow-hidden rounded-card bg-surface text-left shadow-card"
                >
                  <StoragePhoto bucket="memories" path={f.photo_path} alt={f.title} />
                  <span className="block px-5 py-4 text-xl font-bold">{tt('Vertel wat je ziet')}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-lg text-ink-soft">{tt('Er zijn geen nieuwe foto\'s.')}</p>
      )}

      <button
        type="button"
        onClick={() => setVrij(true)}
        className="min-h-big w-full rounded-pill bg-accent-ink px-8 text-xl font-bold text-white"
      >
        {tt('Iets vertellen')}
      </button>

      {bewaard ? <p className="text-lg font-semibold text-ink-soft">{tt('Dank je, bewaard.')}</p> : null}
    </section>
  )
}
