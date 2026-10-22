import { useQuery } from '@tanstack/react-query'
import { menuVan } from './menuApi'
import { datumVandaag, leesAllergenen, menuVoorBewoners } from './menuPuur'
import { tt } from '../../lib/uiTaal'

/**
 * Het menu van vandaag, groot genoeg voor een tablet in de gang (108).
 * Alleen een bevestigd menu van vandaag. Staat er niets, dan zegt de plek
 * dat het nog niet is ingevuld, in plaats van te verdwijnen.
 */
export default function MenuVandaag({ orgId }: { orgId: string }) {
  const vandaag = datumVandaag(new Date())
  const menu = useQuery({
    queryKey: ['zorg', 'menu-vandaag', orgId, vandaag],
    queryFn: () => menuVan(orgId, vandaag, vandaag),
    enabled: !!orgId,
    refetchInterval: 2 * 60_000,
  })
  const rij = menuVoorBewoners(menu.data ?? [], vandaag)
  const datum = new Date(`${vandaag}T12:00:00Z`).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Brussels' })

  const gerechten = rij
    ? [
        { soort: tt('Soep'), gerecht: rij.soep, allergenen: rij.soep_allergenen },
        { soort: tt('Middagmaal'), gerecht: rij.middag, allergenen: rij.middag_allergenen },
        { soort: tt('Dessert'), gerecht: rij.dessert, allergenen: rij.dessert_allergenen },
      ].filter((g) => g.gerecht)
    : []

  return (
    <section aria-labelledby="menu-vandaag-titel" className="rounded-card bg-surface p-6 shadow-card">
      <p className="text-sm font-bold uppercase tracking-wider text-accent-ink">{tt('Menu van vandaag')}</p>
      <h2 id="menu-vandaag-titel" className="mt-1 text-3xl font-bold capitalize">{datum}</h2>

      {!rij ? (
        <p className="mt-4 text-lg text-ink-soft">{tt('Het menu voor vandaag is nog niet ingevuld.')}</p>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {gerechten.map((g) => (
            <li key={g.soort} className="space-y-2 rounded-2xl bg-surface-soft p-5">
              <p className="text-sm font-bold uppercase tracking-wider text-accent-ink">{g.soort}</p>
              <p className="text-2xl font-semibold leading-snug">{g.gerecht}</p>
              <p className="text-base text-ink-soft">
                {leesAllergenen(g.allergenen).length > 0
                  ? `${tt('Allergenen')}: ${leesAllergenen(g.allergenen).join(', ')}`
                  : tt('Allergenen: vraag het aan de keuken.')}
              </p>
            </li>
          ))}
        </ul>
      )}
      {rij?.notitie ? <p className="mt-4 text-lg">{rij.notitie}</p> : null}
    </section>
  )
}
