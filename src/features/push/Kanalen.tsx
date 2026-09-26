import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { telegramChats, zetKanaal, type Kanaal, type PushStatus } from './pushStatus'

/**
 * Waar wil jij een dringend bericht krijgen?
 *
 * Alleen voor "bel me eens" en "ik heb hulp nodig" — de twee berichten die
 * de persoon zelf verstuurt. Een kanaal dat volloopt met afgevinkte
 * ontbijten wordt genegeerd, en dan valt het ene bericht dat telt niet meer
 * op.
 *
 * Elk familielid stelt dit voor zichzelf in; niemand ziet het nummer van een
 * ander. Dat zit in de database (row level security), niet alleen hier.
 *
 * Bewust twee losse velden in plaats van een keuzelijst: het zijn geen
 * alternatieven. Wie zowel WhatsApp als mail wil, krijgt beide.
 */
const UITLEG: Record<Kanaal, { label: string; onder: string; plaats: string }> = {
  whatsapp: {
    label: 'WhatsApp',
    onder: 'Je telefoonnummer. Komt op je vergrendelscherm, ook met de app dicht.',
    plaats: '+32475123456',
  },
  telegram: {
    label: 'Telegram',
    onder: 'Stuur de bot eerst "start" in Telegram, en zoek dan hieronder je chat-id op.',
    plaats: '123456789',
  },
}

export default function Kanalen({
  householdId,
  status,
  opWijziging,
}: {
  householdId: string
  status: PushStatus
  opWijziging: () => void
}) {
  return (
    <div className="mt-3 space-y-2">
      {(Object.keys(UITLEG) as Kanaal[]).map((soort) => (
        <KanaalRij
          key={soort}
          soort={soort}
          householdId={householdId}
          huidig={status.kanalen[soort] ?? ''}
          opWijziging={opWijziging}
        />
      ))}
    </div>
  )
}

function KanaalRij({
  soort,
  householdId,
  huidig,
  opWijziging,
}: {
  soort: Kanaal
  householdId: string
  huidig: string
  opWijziging: () => void
}) {
  const [waarde, setWaarde] = useState(huidig)

  // Wat de database ervan maakte, is wat er staat: 0475 12 34 56 wordt
  // +32475123456. Zonder dit blijft het veld de ruwe tekst tonen en lijkt
  // het alsof het niet bewaard is.
  useEffect(() => setWaarde(huidig), [huidig])

  const bewaar = useMutation({
    mutationFn: (adres: string) => zetKanaal(householdId, soort, adres),
    onSuccess: opWijziging,
  })

  // Een bot antwoordt niet uit zichzelf, dus zonder dit heeft niemand een
  // manier om zijn chat-id te weten te komen.
  const zoek = useMutation({ mutationFn: telegramChats })

  const u = UITLEG[soort]
  const gewijzigd = waarde.trim() !== huidig

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <label className="block">
        <span className="block font-semibold">{u.label}</span>
        <span className="mt-0.5 block text-sm text-ink-soft">{u.onder}</span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type={soort === 'whatsapp' ? 'tel' : 'text'}
            inputMode={soort === 'whatsapp' ? 'tel' : 'numeric'}
            value={waarde}
            onChange={(e) => setWaarde(e.target.value)}
            placeholder={u.plaats}
            className="min-w-[min(10rem,100%)] flex-1 rounded-pill border-[1.5px] border-line-strong bg-surface px-4 py-2"
          />
          <button
            type="button"
            onClick={() => bewaar.mutate(waarde)}
            disabled={bewaar.isPending || !gewijzigd}
            className="min-h-touch shrink-0 rounded-pill border-[1.5px] border-line-strong px-5 font-semibold disabled:opacity-40"
          >
            {bewaar.isPending ? 'Bezig…' : huidig && !waarde.trim() ? 'Weghalen' : 'Bewaren'}
          </button>
        </span>
      </label>

      {/* De database geeft een leesbare zin terug — "Zet het nummer in
          internationaal formaat" — dus die tonen we gewoon. */}
      {bewaar.isError ? (
        <p role="alert" className="mt-2 text-sm text-alert">
          {bewaar.error instanceof Error ? bewaar.error.message : 'Dat lukte niet.'}
        </p>
      ) : null}

      {soort === 'telegram' ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => zoek.mutate()}
            disabled={zoek.isPending}
            className="min-h-touch rounded-pill border border-line px-4 text-sm font-semibold disabled:opacity-60"
          >
            {zoek.isPending ? 'Zoeken…' : 'Zoek mijn chat-id'}
          </button>

          {zoek.data?.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {zoek.data.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setWaarde(c.id)}
                    className="min-h-touch rounded-pill border-[1.5px] border-accent bg-accent-soft px-4 text-sm font-semibold"
                  >
                    {c.naam} · {c.id}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {zoek.isSuccess && zoek.data.length === 0 ? (
            <p className="mt-2 text-sm text-ink-soft">
              Niemand gevonden. Stuur de bot eerst "start" in Telegram en probeer het opnieuw —
              of TG_BOT_TOKEN ontbreekt nog bij de secrets in Supabase.
            </p>
          ) : null}

          {zoek.isError ? (
            <p role="alert" className="mt-2 text-sm text-alert">
              Dat lukte niet. Draait push-notify al met de nieuwe code?
            </p>
          ) : null}
        </div>
      ) : null}

      {bewaar.isSuccess && !gewijzigd ? (
        <p aria-live="polite" className="mt-2 text-sm text-ink-soft">
          {huidig ? 'Bewaard.' : 'Weggehaald.'}
        </p>
      ) : null}
    </div>
  )
}
