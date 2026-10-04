import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Icon from '../../components/Icon'
import Kanalen from './Kanalen'
import { getPushStatus, stuurTestmelding, zetMail } from './pushStatus'
import { tt } from '../../lib/uiTaal'

/**
 * Waarom komt die melding niet aan?
 *
 * Een melding heeft twee wegen naar familie, en beide vallen stil zonder een
 * spoor. Wie dat niet weet, zoekt zich blind — en concludeert dat de app
 * niet werkt.
 *
 * Dit blok zegt per stap wat er aan de hand is, in de volgorde waarin je ze
 * moet oplossen. Geen groene vinkjes voor de sier: alleen wat er nog in de
 * weg staat krijgt aandacht. En bovenaan de e-mail, want dat is de weg die
 * overal werkt: pushmeldingen in de browser zijn op iPhone en op beheerde
 * laptops vaak niet te krijgen, en dan is e-mail niet het vangnet maar het
 * hele net.
 */
/** Hoe een weg heet op het scherm, en welke sleutel hij nodig heeft. */
const NAAM: Record<string, string> = {
  mail: tt('E-mail'),
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
}

const SLEUTELS: Record<string, string> = {
  mail: 'RESEND_API_KEY of MAIL_FROM',
  whatsapp: 'WA_TOKEN, WA_PHONE_ID of WA_TEMPLATE',
  telegram: 'TG_BOT_TOKEN',
}

export default function PushNakijken({ householdId }: { householdId: string }) {
  const queryClient = useQueryClient()
  const [verstuurd, setVerstuurd] = useState(false)

  const { data } = useQuery({
    queryKey: ['push-status', householdId],
    queryFn: () => getPushStatus(householdId),
    enabled: !!householdId,
  })

  const vernieuw = () => queryClient.invalidateQueries({ queryKey: ['push-status', householdId] })

  const mail = useMutation({
    mutationFn: (aan: boolean) => zetMail(aan),
    onSuccess: vernieuw,
  })

  const test = useMutation({
    mutationFn: () => stuurTestmelding(householdId),
    onSuccess: () => {
      setVerstuurd(true)
      vernieuw()
    },
  })


  if (!data) return null

  const problemen: string[] = []
  const samenvatting: string[] = []
  if (data.mail_aan) samenvatting.push(tt('e-mail'))
  if (data.kanalen.whatsapp) samenvatting.push('WhatsApp')
  if (data.kanalen.telegram) samenvatting.push('Telegram')
  if (data.eigen_toestel && data.niveau_ok) samenvatting.push(tt('een melding op dit toestel'))

  const wegen = Object.keys(data.kanalen).length + (data.mail_aan ? 1 : 0)
  if (wegen === 0) {
    problemen.push(
      tt('Je hebt geen enkele weg aan staan buiten de app zelf. Zet e-mail aan, of vul hieronder een WhatsApp-nummer in — anders zie je een dringend bericht alleen wanneer LifeAngle open staat.'),
    )
  }
  if (!data.eigen_toestel) {
    problemen.push(
      tt('Dit toestel krijgt geen pushmeldingen. Toestemming geldt per toestel én per account: aanzetten op de tablet doet niets voor je telefoon. Op iPhone en iPad kan het alleen wanneer de app op het beginscherm staat.'),
    )
  }
  if (!data.niveau_ok) {
    problemen.push(
      tt('Pushmeldingen worden alleen verstuurd wanneer de ondersteuning op "ondersteund" staat. Dat kan je aanpassen bij Wie ziet wat. De e-mail bij dringende berichten gaat wel door.'),
    )
  }
  // Wachtende meldingen terwijl er een weg openstaat: dan is er niemand die
  // ze verstuurt. Dat is bijna altijd pg_cron.
  if (data.wachtend_weg > 0 || (data.wachtend > 0 && data.toestellen > 0 && data.niveau_ok)) {
    const aantal = data.wachtend_weg > 0 ? data.wachtend_weg : data.wachtend
    problemen.push(
      aantal === 1
        ? tt('Er wacht 1 melding die niet verstuurd raakt. Druk op "Stuur een testmelding" hieronder: dan zegt de app welke weg het laat afweten, in plaats van dat je moet raden.')
        : tt('Er wachten {n} meldingen die niet verstuurd raken. Druk op "Stuur een testmelding" hieronder: dan zegt de app welke weg het laat afweten, in plaats van dat je moet raden.', { n: aantal }),
    )
  }

  return (
    <div className="mt-4 rounded-card border border-line bg-surface-soft p-4">
      {/* De kop zegt wat er voor jóu openstaat, niet hoeveel toestellen er
          zijn: push is de minst betrouwbare weg van de vier, en hem
          bovenaan zetten gaf de indruk dat er niets werkte. */}
      <p className="font-semibold">
        {samenvatting.length === 0
          ? tt('Je krijgt dringende berichten alleen in de app')
          : tt('Dringende berichten komen bij jou aan via {wegen}', { wegen: samenvatting.join(` ${tt('en')} `) })}
      </p>

      {/* Eigen rij, geen waarschuwing: dit is een keuze, niet een fout. */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-surface p-4">
        <span className="min-w-[min(14rem,100%)] flex-1">
          <span className="block font-semibold">{tt('Ook per e-mail, bij dringende berichten')}</span>
          <span className="mt-0.5 block text-sm text-ink-soft">
            {tt('Alleen wanneer ze vraagt of je belt, of om hulp vraagt. E-mail werkt op elk toestel, zonder toestemming — dit is de weg die het altijd haalt.')}
          </span>
        </span>
        <button
          role="switch"
          aria-checked={data.mail_aan}
          aria-label={tt('Dringende meldingen ook per e-mail')}
          disabled={mail.isPending}
          onClick={() => mail.mutate(!data.mail_aan)}
          className={`relative h-9 w-16 shrink-0 rounded-pill border-[1.5px] transition-colors disabled:opacity-60 ${
            data.mail_aan ? 'border-accent bg-accent' : 'border-line-strong bg-surface-deep'
          }`}
        >
          <span
            className={`absolute left-0 top-1 h-6 w-6 rounded-full bg-surface shadow-card transition-transform ${
              data.mail_aan ? 'translate-x-8' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      <Kanalen householdId={householdId} status={data} opWijziging={vernieuw} />

      {problemen.length > 0 ? (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-soft">
          {problemen.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
          <Icon naam="gedaan" size={16} />
          {tt('Alles staat klaar.')}
        </p>
      )}

      <button
        onClick={() => test.mutate()}
        disabled={test.isPending}
        className="mt-3 min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold disabled:opacity-60"
      >
        {test.isPending ? tt('Bezig…') : tt('Stuur een testmelding')}
      </button>

      {verstuurd && test.data && test.data.uit.length === 0 && test.data.fouten.length === 0 ? (
        <p aria-live="polite" className="mt-2 text-sm text-ink-soft">
          {tt('Verstuurd, langs elke weg die aan staat. Komt er binnen een minuut niets aan, dan staat hierboven waarschijnlijk al waarom.')}
        </p>
      ) : null}

      {/* Twee verschillende dingen, die om iets heel anders vragen: een weg
          die de server niet eens kan proberen (de sleutel ontbreekt), en een
          weg die geprobeerd werd en geweigerd (het sjabloon klopt niet). Ze
          door elkaar halen kost een namiddag. */}
      {test.data?.uit.length ? (
        <div aria-live="polite" className="mt-2 rounded-2xl border border-line-strong bg-surface p-3">
          <p className="text-sm font-semibold">
            {test.data.uit.length === 1 ? tt('Deze weg staat uit bij de server:') : tt('Deze wegen staan uit bij de server:')}
          </p>
          <ul className="mt-1 space-y-1 text-sm text-ink-soft">
            {test.data.uit.map((w) => (
              <li key={w}>
                <span className="font-semibold">{NAAM[w] ?? w}</span> —{' '}
                {tt('{sleutels} ontbreekt nog bij Edge Functions → Secrets in Supabase.', { sleutels: SLEUTELS[w] ?? tt('de secrets') })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {test.data?.fouten.length ? (
        <div aria-live="polite" className="mt-2 rounded-2xl border border-alert bg-surface p-3">
          <p className="text-sm font-semibold">{tt('Een weg weigerde het bericht:')}</p>
          <ul className="mt-1 space-y-1 text-sm text-ink-soft">
            {test.data.fouten.map((f) => (
              <li key={f} className="break-words font-mono text-[0.8em]">
                {f}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mail.isError ? (
        <p role="alert" className="mt-2 text-sm text-alert">
          <MetCode zin={tt('Dat lukte niet. Draaide {bestand} al?')} code="35_mail.sql" />
        </p>
      ) : null}

      {test.isError ? (
        <p role="alert" className="mt-2 text-sm text-alert">
          <MetCode zin={tt('Dat lukte niet. Draaide {bestand} al?')} code="34_push_nakijken.sql" />
        </p>
      ) : null}
    </div>
  )
}

/** Een vertaalde zin met een bestandsnaam als <code> op de plaats van {bestand}. */
function MetCode({ zin, code }: { zin: string; code: string }) {
  const [voor, na = ''] = zin.split('{bestand}')
  return (
    <>
      {voor}
      <code>{code}</code>
      {na}
    </>
  )
}
