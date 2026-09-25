import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon'
import { useHousehold } from '../household/useHousehold'
import { useDisplayPrefs } from '../settings/useDisplayPrefs'
import { getIndeling, setIndeling } from '../../services/layout'
import {
  MODULES,
  RUSTIG_TOT,
  moduleVan,
  magSchuiven,
  schuif,
  STANDAARD,
  type Indeling as IndelingT,
  type Tegel,
} from './modules'

/**
 * Familie stelt het dagscherm van de persoon samen.
 *
 * Tikken, niet slepen. Slepen is op een telefoon lastig, met een
 * toetsenbord onmogelijk en met de voorleesfunctie niet te doen — en
 * familie zit vaak op een telefoon. Tik een tegel om hem te kiezen, tik
 * een module om hem toe te voegen.
 *
 * Wat hier niet kan, kan bewust niet: "Wat nu?" verplaatsen of weghalen,
 * en halve tegels bij grote tekst. Het aantal tegels is géén grens meer,
 * alleen een raad: familie kent het huishouden beter dan de app.
 *
 * De regels staan in modules.ts en draaien ook op het scherm van de
 * persoon zelf, zodat een oude indeling daar nooit iets kapots oplevert.
 */
export default function Indeling() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const voornaam = household?.person_name.split(' ')[0] ?? 'de persoon'
  const queryClient = useQueryClient()

  const { prefs } = useDisplayPrefs(hh)
  const groteTekst = prefs.simple || prefs.scale === '1.3' || prefs.scale === '1.5'

  const { data, isLoading } = useQuery({
    queryKey: ['indeling', hh],
    queryFn: () => getIndeling(hh),
    enabled: !!hh,
  })

  const [tegels, setTegels] = useState<Tegel[]>([])
  const [gekozen, setGekozen] = useState<string | null>(null)

  useEffect(() => {
    if (data) setTegels(data.tegels)
  }, [data])

  const bewaar = useMutation({
    mutationFn: (nieuw: Tegel[]) => setIndeling(hh, { versie: 1, tegels: nieuw } as IndelingT),
    onSuccess: (schoon) => {
      setTegels(schoon.tegels)
      queryClient.setQueryData(['indeling', hh], schoon)
    },
  })

  function pas(nieuw: Tegel[]) {
    setTegels(nieuw)
    bewaar.mutate(nieuw)
  }

  const index = tegels.findIndex((t) => t.id === gekozen)
  const tegel = index === -1 ? null : tegels[index]
  const def = tegel ? moduleVan(tegel.id) : null
  const beschikbaar = MODULES.filter((m) => !tegels.some((t) => t.id === m.id))
  const lang = tegels.length > RUSTIG_TOT

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Indeling</h1>
          <p className="mt-1 max-w-[52ch] text-ink-soft">
            Wat er op het dagscherm van {voornaam} staat, in welke volgorde en hoe groot. Het
            verandert meteen op haar tablet; je hoeft die niet aan te raken.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span
            aria-live="polite"
            className="inline-flex items-center gap-2 text-sm font-semibold text-ok"
          >
            {bewaar.isPending ? (
              <span className="text-ink-soft">Bezig met opslaan…</span>
            ) : bewaar.isError ? (
              <span className="text-alert">Niet opgeslagen — probeer opnieuw</span>
            ) : (
              <>
                <Icon naam="gedaan" size={16} />
                Opgeslagen
              </>
            )}
          </span>
          <button
            onClick={() => {
              setGekozen(null)
              pas(STANDAARD.tegels)
            }}
            className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
          >
            Terugzetten
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        {/* Het voorbeeld */}
        <section className="rounded-card bg-surface p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-bold">Zo ziet haar scherm eruit</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Tik een tegel om hem aan te passen.{' '}
            <Link to="/persoon" className="font-semibold underline underline-offset-4">
              Het echte scherm bekijken
            </Link>
          </p>

          {isLoading ? (
            <p className="mt-4 text-ink-soft">Bezig met laden…</p>
          ) : (
            <ul className="mt-4 grid list-none grid-cols-2 gap-3 p-0">
              {tegels.map((t) => {
                const m = moduleVan(t.id)
                if (!m) return null
                const aan = t.id === gekozen
                return (
                  <li key={t.id} className={t.maat === 'vol' ? 'col-span-2' : 'col-span-2 sm:col-span-1'}>
                    <button
                      onClick={() => setGekozen(aan ? null : t.id)}
                      aria-pressed={aan}
                      className={`flex h-full w-full flex-col items-start gap-1.5 rounded-card border-[1.5px] p-4 text-left ${
                        m.vast ? 'border-accent-ink bg-accent-soft' : 'border-line bg-surface-soft'
                      } ${aan ? 'outline outline-[3px] outline-offset-2 outline-accent' : ''}`}
                    >
                      <span className="flex w-full items-center gap-2">
                        <Icon naam={m.icoon} size={20} />
                        <span className="font-bold">{m.naam}</span>
                        {m.vast ? (
                          <span className="ml-auto rounded-pill bg-accent-ink px-2 py-0.5 text-xs font-bold text-white">
                            vast
                          </span>
                        ) : (
                          <span className="ml-auto text-xs font-semibold uppercase tracking-wider text-ink-faint">
                            {t.maat}
                          </span>
                        )}
                      </span>
                      <span className="text-sm leading-snug text-ink-soft">{m.uitleg}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <p className="mt-4 text-sm text-ink-faint">
            {tegels.length} {tegels.length === 1 ? 'tegel' : 'tegels'}. De leesvolgorde is van boven
            naar beneden — precies wat de voorleesfunctie aanhoudt.
          </p>

          {/* Een opmerking, geen blokkade. Hoeveel rustig is, weet jij
              beter dan de app. */}
          {lang ? (
            <p className="mt-2 text-sm text-ink-soft">
              Dit zijn er meer dan {RUSTIG_TOT}. Dat kan, maar elke tegel erbij is één keuze meer
              die {voornaam} tegelijk ziet. Kijk gerust of er eentje bij kan die je niet mist.
            </p>
          ) : null}
        </section>

        <div className="space-y-6">
          {/* Wat je met de gekozen tegel kan */}
          <section className="rounded-card bg-surface p-5 shadow-card">
            {tegel && def ? (
              <>
                <p className="text-sm font-bold uppercase tracking-wider text-ink-soft">
                  Gekozen tegel
                </p>
                <p className="mt-1 text-xl font-bold">{def.naam}</p>

                <p className="mt-4 text-sm font-bold">Grootte</p>
                <div className="mt-2 flex gap-2">
                  <Maatknop
                    label="Vol"
                    aan={tegel.maat === 'vol'}
                    uit={!!def.altijdVol}
                    onClick={() => pas(zetMaat(tegels, index, 'vol'))}
                  />
                  <Maatknop
                    label="Half"
                    aan={tegel.maat === 'half'}
                    uit={!!def.altijdVol || groteTekst}
                    onClick={() => pas(zetMaat(tegels, index, 'half'))}
                  />
                </div>
                {def.altijdVol ? (
                  <p className="mt-2 text-sm text-ink-soft">
                    Deze tegel is altijd vol-breed; half wordt hier onleesbaar.
                  </p>
                ) : groteTekst ? (
                  <p className="mt-2 text-sm text-ink-soft">
                    Halve tegels kunnen niet zolang de tekst op groot staat — dan blijven er drie
                    woorden per regel over.
                  </p>
                ) : null}

                <p className="mt-4 text-sm font-bold">Volgorde</p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => pas(schuif(tegels, index, -1))}
                    disabled={!magSchuiven(tegels, index, -1)}
                    className="min-h-touch flex-1 rounded-pill border-[1.5px] border-line-strong font-semibold disabled:opacity-45"
                  >
                    Omhoog
                  </button>
                  <button
                    onClick={() => pas(schuif(tegels, index, 1))}
                    disabled={!magSchuiven(tegels, index, 1)}
                    className="min-h-touch flex-1 rounded-pill border-[1.5px] border-line-strong font-semibold disabled:opacity-45"
                  >
                    Omlaag
                  </button>
                </div>

                {def.vast ? (
                  <p className="mt-4 text-sm text-ink-soft">
                    "Wat nu?" staat altijd bovenaan en kan niet weg. Dat is de vraag waar de app om
                    draait; die hoort niet per huishouden ergens anders te staan.
                  </p>
                ) : (
                  <button
                    onClick={() => {
                      setGekozen(null)
                      pas(tegels.filter((x) => x.id !== tegel.id))
                    }}
                    className="mt-4 min-h-touch w-full rounded-pill border-[1.5px] border-alert/50 font-semibold text-alert"
                  >
                    Van het scherm halen
                  </button>
                )}
              </>
            ) : (
              <p className="text-ink-soft">
                Tik hierboven een tegel om hem groter te maken, te verplaatsen of weg te halen.
              </p>
            )}
          </section>

          {/* Toevoegen */}
          <section className="rounded-card bg-surface p-5 shadow-card">
            <h2 className="text-lg font-bold">Toevoegen</h2>

            {beschikbaar.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">Alles staat er al op.</p>
            ) : (
              <ul className="mt-3 list-none space-y-2 p-0">
                {beschikbaar.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => {
                        setGekozen(m.id)
                        pas([...tegels, { id: m.id, maat: m.altijdVol || groteTekst ? 'vol' : 'half' }])
                      }}
                      className="flex w-full items-center gap-3 rounded-card border-[1.5px] border-line bg-surface-soft p-3 text-left"
                    >
                      <Icon naam={m.icoon} size={20} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{m.naam}</span>
                        <span className="block text-sm leading-snug text-ink-soft">{m.uitleg}</span>
                      </span>
                      <Icon naam="nieuw" size={18} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function zetMaat(tegels: Tegel[], index: number, maat: 'vol' | 'half'): Tegel[] {
  const kopie = tegels.slice()
  kopie[index] = { ...kopie[index], maat }
  return kopie
}

function Maatknop({
  label,
  aan,
  uit,
  onClick,
}: {
  label: string
  aan: boolean
  uit: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={uit}
      aria-pressed={aan}
      className={`min-h-touch flex-1 rounded-pill border-[1.5px] font-bold disabled:opacity-45 ${
        aan ? 'border-accent-ink bg-accent-ink text-white' : 'border-line-strong bg-surface'
      }`}
    >
      {label}
    </button>
  )
}
