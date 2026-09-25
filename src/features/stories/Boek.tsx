import { useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getStories, storyAudioUrl, type LifeStory } from '../../services/stories'
import { getPhotos, type MemoryPhoto } from '../../services/memories'
import { useHousehold } from '../household/useHousehold'
import { hoofdstukVanFoto, inHoofdstukken, type Hoofdstuk } from './hoofdstukken'
import StoragePhoto from '../../components/StoragePhoto'
import VerhaalQR from './VerhaalQR'
import { locale } from '../../lib/i18n'

/**
 * Het levensboek.
 *
 * "Vertel eens" verzamelt elke dag één antwoord. Los zijn dat losse
 * opnames; samen is het iets om te bewaren. Deze pagina zet ze in
 * hoofdstukken, met een titelblad en een inhoudsopgave, en drukt af als
 * een boek — of wordt een PDF via "Opslaan als PDF" in het printvenster.
 *
 * Bewust geen eigen PDF-generator: elke browser kan dit al, het werkt op
 * een beheerde computer zonder installatie, en familie ziet vooraf wat
 * ze krijgt.
 *
 * Wat alleen in eigen stem bestaat, krijgt in het boek een regel met de
 * vraag en de duur, plus een QR-code. Het geluid zelf blijft in de app.
 */
export default function Boek() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const naam = household?.person_name ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['stories', hh],
    queryFn: () => getStories(hh),
    enabled: !!hh,
  })

  const { data: fotos } = useQuery({
    queryKey: ['photos', hh],
    queryFn: () => getPhotos(hh),
    enabled: !!hh,
  })

  const verhalen = useMemo(() => data ?? [], [data])
  const hoofdstukken = useMemo(() => inHoofdstukken(verhalen), [verhalen])
  const metGeluid = verhalen.filter((v) => v.audio_path)

  // De foto's uit de tijdlijn bij het hoofdstuk waar ze over gaan. Wat we
  // niet kunnen plaatsen, komt achteraan in het album: beter daar dan op
  // een gokje in het verkeerde hoofdstuk.
  const fotoPerHoofdstuk = useMemo(() => {
    const kaart = new Map<Hoofdstuk, MemoryPhoto[]>()
    const rest: MemoryPhoto[] = []
    for (const f of fotos ?? []) {
      if (!f.photo_path) continue
      const h = hoofdstukVanFoto(f.title, f.story)
      if (!h) rest.push(f)
      else kaart.set(h, [...(kaart.get(h) ?? []), f])
    }
    return { kaart, rest }
  }, [fotos])

  const vandaag = new Intl.DateTimeFormat(locale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())

  return (
    <div className="boek min-h-screen bg-bg">
      {/* Alles in deze balk verdwijnt bij het afdrukken. */}
      <div className="niet-printen sticky top-0 z-10 border-b border-line bg-surface px-5 py-3">
        <div className="mx-auto flex max-w-[52rem] flex-wrap items-center gap-3">
          <Link to="/familie/fotos" className="font-semibold underline underline-offset-4">
            ‹ Terug
          </Link>
          <span className="text-ink-soft">
            {verhalen.length} {verhalen.length === 1 ? 'verhaal' : 'verhalen'}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            {metGeluid.length > 0 ? <LuisterAlles verhalen={metGeluid} /> : null}
            <button
              onClick={() => window.print()}
              className="min-h-touch rounded-pill bg-accent-ink px-5 font-bold text-white"
            >
              Afdrukken of opslaan als PDF
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[52rem] px-8 py-12">
        {isLoading ? <p className="text-ink-soft">Bezig met laden…</p> : null}

        {!isLoading && verhalen.length === 0 ? (
          <p className="text-ink-soft">
            Er zijn nog geen verhalen. Ze verschijnen hier zodra er een vraag beantwoord is.
          </p>
        ) : null}

        {verhalen.length > 0 ? (
          <>
            <header className="titelblad flex min-h-[70vh] flex-col justify-center text-center">
              <p className="text-lg uppercase tracking-[0.3em] text-ink-faint">Het leven van</p>
              <h1 className="mt-6 text-6xl font-extrabold tracking-tight">{naam}</h1>
              <p className="mt-8 text-xl text-ink-soft">In eigen woorden verteld</p>
              <p className="mt-2 text-ink-faint">{vandaag}</p>
            </header>

            <nav aria-label="Inhoud" className="na-pagina pt-10">
              <h2 className="text-2xl font-bold">Inhoud</h2>
              <ol className="mt-4 space-y-2 text-lg">
                {hoofdstukken.map((h, i) => (
                  <li key={h.titel} className="flex gap-3">
                    <span className="text-ink-faint">{i + 1}.</span>
                    <span>{h.titel}</span>
                    <span className="text-ink-faint">
                      {h.verhalen.length} {h.verhalen.length === 1 ? 'verhaal' : 'verhalen'}
                    </span>
                  </li>
                ))}
              </ol>
            </nav>

            {hoofdstukken.map((h) => (
              <section key={h.titel} className="na-pagina pt-10">
                <h2 className="text-3xl font-extrabold tracking-tight">{h.titel}</h2>

                <div className="mt-6 space-y-8">
                  {h.verhalen.map((v) => (
                    <VerhaalInBoek key={v.id} verhaal={v} />
                  ))}
                </div>

                <Fotos fotos={fotoPerHoofdstuk.kaart.get(h.titel) ?? []} />
              </section>
            ))}

            {fotoPerHoofdstuk.rest.length > 0 ? (
              <section className="na-pagina pt-10">
                <h2 className="text-3xl font-extrabold tracking-tight">Uit het album</h2>
                <Fotos fotos={fotoPerHoofdstuk.rest} />
              </section>
            ) : null}

            <footer className="mt-16 border-t border-line pt-6 text-center text-ink-faint">
              Verteld door {naam}, bewaard door de familie.
            </footer>
          </>
        ) : null}
      </main>
    </div>
  )
}

/** Foto's met hun jaartal en bijschrift, twee naast elkaar. */
function Fotos({ fotos }: { fotos: MemoryPhoto[] }) {
  if (fotos.length === 0) return null

  return (
    <div className="mt-8 grid grid-cols-2 gap-5">
      {fotos.map((f) => (
        <figure key={f.id} className="heel-houden m-0">
          <div className="overflow-hidden rounded-2xl">
            <StoragePhoto bucket="memories" path={f.photo_path} alt={f.title} />
          </div>
          <figcaption className="mt-2 text-sm text-ink-soft">
            {f.year ? <span className="font-bold">{f.year} · </span> : null}
            {f.title}
          </figcaption>
        </figure>
      ))}
    </div>
  )
}

function VerhaalInBoek({ verhaal }: { verhaal: LifeStory }) {
  const duur = verhaal.audio_seconds ?? 0
  const minuten = Math.floor(duur / 60)
  const seconden = duur % 60

  return (
    <article className="heel-houden flex gap-5">
      <div className="min-w-0 flex-1">
        <h3 className="text-xl font-bold text-ink-soft">{verhaal.question}</h3>

        {verhaal.body ? (
          <p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed">{verhaal.body}</p>
        ) : (
          <p className="mt-2 text-lg italic text-ink-soft">
            Verteld in eigen stem
            {duur > 0 ? ` — ${minuten > 0 ? `${minuten} min ` : ''}${seconden} sec` : ''}.
          </p>
        )}
      </div>

      {/* De code staat naast het verhaal, niet eronder: zo blijft het
          blad rustig en hoort de code zichtbaar bij dít verhaal. */}
      {verhaal.audio_path ? (
        <figure className="m-0 w-[108px] flex-none text-center">
          <VerhaalQR id={verhaal.id} />
          <figcaption className="mt-1 text-xs leading-tight text-ink-faint">
            Scan om te horen
          </figcaption>
        </figure>
      ) : null}
    </article>
  )
}

/**
 * Alles na elkaar beluisteren, zoals een luisteralbum. Eén knop, geen
 * lijst met bedieningen: wie wil kiezen, doet dat op het verhalenscherm.
 */
function LuisterAlles({ verhalen }: { verhalen: LifeStory[] }) {
  const [speelt, setSpeelt] = useState(false)
  const [nummer, setNummer] = useState(0)
  const audio = useRef<HTMLAudioElement | null>(null)

  function stop() {
    audio.current?.pause()
    audio.current = null
    setSpeelt(false)
  }

  async function speel(index: number) {
    const pad = verhalen[index]?.audio_path
    if (!pad) return stop()

    try {
      const url = await storyAudioUrl(pad)
      audio.current?.pause()
      const speler = new Audio(url)
      audio.current = speler
      setNummer(index)
      setSpeelt(true)
      // Bij het einde meteen door naar het volgende verhaal; na het
      // laatste stopt het vanzelf.
      speler.onended = () => {
        if (index + 1 < verhalen.length) void speel(index + 1)
        else stop()
      }
      speler.onerror = stop
      await speler.play()
    } catch {
      stop()
    }
  }

  return (
    <button
      onClick={() => (speelt ? stop() : void speel(0))}
      className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
    >
      {speelt ? `Stop (${nummer + 1}/${verhalen.length})` : `Luister alles (${verhalen.length})`}
    </button>
  )
}
