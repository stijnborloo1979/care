import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, MessageCircleQuestion } from 'lucide-react'
import { antwoordAanBewoner, berichtenVan, draden, markeerGezien } from './bewonerBerichten'
import { Fout, Kaart, Leeg, dagEnUur, knop, knopKlein, tekstvak } from './ui'

/**
 * Wat de bewoner zelf vanaf zijn tablet aan het zorgteam vroeg (68).
 * Gezien markeren en kort antwoorden; de bewoner ziet beide op zijn tablet.
 */
export default function BerichtenVanBewoner({ hh, naam }: { hh: string; naam: string }) {
  const queryClient = useQueryClient()
  const lijst = useQuery({
    queryKey: ['zorg', 'bewoner-berichten', hh],
    queryFn: () => berichtenVan(hh, 40),
    refetchInterval: 60_000,
  })
  const ververs = () => {
    queryClient.invalidateQueries({ queryKey: ['zorg', 'bewoner-berichten', hh] })
    queryClient.invalidateQueries({ queryKey: ['zorg', 'ongezien'] })
  }
  const gezien = useMutation({ mutationFn: markeerGezien, onSuccess: ververs })
  const antwoord = useMutation({
    mutationFn: (p: { id: string; tekst: string }) => antwoordAanBewoner(p.id, p.tekst),
    onSuccess: () => {
      setOpen(null)
      setTekst('')
      ververs()
    },
  })
  const [open, setOpen] = useState<string | null>(null)
  const [tekst, setTekst] = useState('')

  const items = draden(lijst.data ?? []).slice(0, 10)
  const nieuw = items.filter((d) => !d.vraag.gezien_at).length

  return (
    <Kaart
      titel={
        <>
          <MessageCircleQuestion size={20} strokeWidth={1.75} aria-hidden="true" /> Vragen van {naam}
          {nieuw > 0 ? (
            <span className="ml-1 rounded-pill bg-alert px-2 py-0.5 text-xs font-bold text-white">{nieuw} nieuw</span>
          ) : null}
        </>
      }
    >
      {lijst.data && items.length === 0 ? (
        <Leeg>Nog geen vragen. {naam} kan op de tablet iets vragen aan het zorgteam.</Leeg>
      ) : null}
      <ul className="space-y-3">
        {items.map(({ vraag, antwoorden }) => (
          <li
            key={vraag.id}
            className={`rounded-2xl p-4 ${vraag.gezien_at ? 'bg-surface-soft' : 'border-[1.5px] border-alert/40 bg-surface'}`}
          >
            <p className="text-sm text-ink-soft">{dagEnUur(vraag.created_at)}</p>
            <p className="mt-1 break-words text-lg">{vraag.body}</p>
            {antwoorden.map((a) => (
              <p key={a.id} className="mt-2 break-words rounded-xl bg-accent-soft px-3 py-2">
                <span className="block text-xs font-semibold text-accent-ink">Antwoord · {dagEnUur(a.created_at)}</span>
                {a.body}
              </p>
            ))}
            {open === vraag.id ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (tekst.trim()) antwoord.mutate({ id: vraag.id, tekst })
                }}
                className="mt-3"
              >
                <label className="sr-only" htmlFor={`antwoord-${vraag.id}`}>
                  Antwoord aan {naam}
                </label>
                <textarea
                  id={`antwoord-${vraag.id}`}
                  value={tekst}
                  onChange={(e) => setTekst(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  autoFocus
                  placeholder="Kort en eenvoudig, bv. 'Ik kom om 15 uur.'"
                  className={tekstvak}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="submit" disabled={!tekst.trim() || antwoord.isPending} className={knop}>
                    Antwoord sturen
                  </button>
                  <button type="button" onClick={() => setOpen(null)} className={knopKlein}>
                    Annuleren
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {vraag.gezien_at ? (
                  <span className="inline-flex items-center gap-1 text-sm text-ink-soft">
                    <CheckCheck size={16} strokeWidth={2} aria-hidden="true" /> Gezien
                  </span>
                ) : (
                  <button onClick={() => gezien.mutate(vraag.id)} disabled={gezien.isPending} className={`${knopKlein} inline-flex items-center gap-1`}>
                    <CheckCheck size={15} strokeWidth={2} aria-hidden="true" /> Gezien
                  </button>
                )}
                <button
                  onClick={() => {
                    setOpen(vraag.id)
                    setTekst('')
                  }}
                  className={knopKlein}
                >
                  Antwoorden
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <Fout fout={gezien.error ?? antwoord.error ?? lijst.error} />
    </Kaart>
  )
}
