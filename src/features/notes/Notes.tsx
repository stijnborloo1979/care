import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CATEGORIEEN } from '../../services/notes'
import { useHousehold } from '../household/useHousehold'
import { spreek } from '../voice/useSpeech'
import { useNotes } from './useNotes'

/**
 * Weetjes zijn korte antwoorden op vragen die terugkomen: waar de
 * reservesleutel ligt, hoe de koffie moet, wie er op zondag komt. Eén
 * kaart per weetje, met een knop om het te laten voorlezen.
 */
export default function Notes() {
  const { household } = useHousehold()
  const { data, isLoading } = useNotes(household?.household_id ?? '')
  const [zoek, setZoek] = useState('')

  const lijst = (data ?? []).filter((n) =>
    zoek ? (n.title + ' ' + n.body).toLowerCase().includes(zoek.toLowerCase()) : true,
  )

  return (
    <main className="mx-auto max-w-[36rem] px-5 pb-28 pt-6">
      <Link to="/memory" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ In huis
      </Link>

      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">Weetjes</h1>
      <p className="mt-1 text-lg text-ink-soft">Dingen die je familie voor je noteerde.</p>

      <input
        value={zoek}
        onChange={(e) => setZoek(e.target.value)}
        placeholder="Zoeken"
        className="mt-5 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4 text-lg"
      />

      {isLoading ? <p className="mt-6 text-ink-soft">Bezig met laden…</p> : null}

      {CATEGORIEEN.map((c) => {
        const notities = lijst.filter((n) => n.category === c.waarde)
        if (notities.length === 0) return null
        return (
          <section key={c.waarde} className="mt-7">
            <h2 className="text-lg font-bold">
              {c.emoji} {c.label}
            </h2>
            <ul className="mt-3 space-y-3">
              {notities.map((n) => (
                <li key={n.id} className="rounded-card border border-line bg-surface p-5 shadow-card">
                  <p className="text-lg font-bold">{n.title}</p>
                  <p className="mt-1 text-lg text-ink-soft">{n.body}</p>
                  <button
                    onClick={() => spreek(`${n.title}. ${n.body}`)}
                    className="mt-3 min-h-[2.6rem] rounded-pill border-[1.5px] border-line-strong px-4 font-semibold"
                  >
                    🔊 Voorlezen
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {!isLoading && lijst.length === 0 ? (
        <p className="mt-6 text-lg text-ink-soft">
          {zoek ? 'Daar vind ik niets over.' : 'Er staan nog geen weetjes.'}
        </p>
      ) : null}
    </main>
  )
}
