import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Mic, Trash2 } from 'lucide-react'
import { t } from '../../lib/i18n'
import { tt } from '../../lib/uiTaal'
import { useHousehold } from '../household/useHousehold'
import { addShoppingItems, deleteShoppingItem, getShopping, setBought, type ShoppingItem } from '../../services/shopping'
import { useVoice } from '../voice-assistant/voiceStore'
import { splitsProducten } from '../voice-assistant/lokaleRegels'

/**
 * De boodschappenlijst. Voor de persoon: groot, en afvinken met één tik.
 * Familie ziet dezelfde lijst, zodat wie naar de winkel gaat weet wat er
 * nodig is.
 */
export default function ShoppingList({ familie = false }: { familie?: boolean }) {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const queryClient = useQueryClient()
  const openen = useVoice((s) => s.openen)
  const [nieuw, setNieuw] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shopping', hh],
    queryFn: () => getShopping(hh),
    enabled: !!hh,
  })

  const ververs = () => queryClient.invalidateQueries({ queryKey: ['shopping', hh] })

  const vink = useMutation({
    mutationFn: (i: ShoppingItem) => setBought(i.id, !i.done_at),
    onMutate: async (i) => {
      await queryClient.cancelQueries({ queryKey: ['shopping', hh] })
      queryClient.setQueryData<ShoppingItem[]>(['shopping', hh], (oud) =>
        (oud ?? []).map((x) => (x.id === i.id ? { ...x, done_at: x.done_at ? null : new Date().toISOString() } : x)),
      )
    },
    onSettled: ververs,
  })

  const wis = useMutation({ mutationFn: (id: string) => deleteShoppingItem(id), onSettled: ververs })
  const voegToe = useMutation({
    mutationFn: (namen: string[]) => addShoppingItems(hh, namen),
    onSuccess: () => setNieuw(''),
    onSettled: ververs,
  })

  const open = (data ?? []).filter((i) => !i.done_at)
  const gekocht = (data ?? []).filter((i) => i.done_at)

  return (
    <main className={familie ? 'space-y-5' : 'mx-auto max-w-[36rem] px-5 pb-28 pt-6'}>
      <h1 className="text-[2rem] font-extrabold leading-tight tracking-tight">🛒 {t('voice.boodschappen')}</h1>

      {!familie ? (
        <button
          onClick={openen}
          className="mt-4 flex min-h-touch w-full items-center justify-center gap-2 rounded-pill bg-accent-ink px-5 text-lg font-semibold text-white"
        >
          <Mic size={22} aria-hidden="true" />
          Zeg wat je nodig hebt
        </button>
      ) : null}

      {isLoading ? <p className="mt-6 text-lg text-ink-soft">{familie ? tt('Even geduld…') : 'Even geduld…'}</p> : null}
      {isError ? (
        <p role="alert" className="mt-6 text-lg text-alert">
          {familie ? tt('De lijst kon niet geladen worden.') : 'De lijst kon niet geladen worden.'}
        </p>
      ) : null}

      {!isLoading && !isError && open.length === 0 ? (
        <p className="mt-6 rounded-card bg-surface-soft p-5 text-lg text-ink-soft">{t('voice.boodschappenLeeg')}</p>
      ) : null}

      <ul className="mt-6 space-y-3">
        {open.map((i) => (
          <Rij key={i.id} item={i} onVink={() => vink.mutate(i)} onWis={familie ? () => wis.mutate(i.id) : undefined} />
        ))}
      </ul>

      {gekocht.length > 0 ? (
        <>
          <h2 className="mt-8 text-base font-bold text-ink-faint">{t('voice.gekocht')}</h2>
          <ul className="mt-3 space-y-2">
            {gekocht.map((i) => (
              <Rij key={i.id} item={i} onVink={() => vink.mutate(i)} onWis={familie ? () => wis.mutate(i.id) : undefined} />
            ))}
          </ul>
        </>
      ) : null}

      <form
        className="mt-8 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const namen = splitsProducten(nieuw)
          if (namen.length) voegToe.mutate(namen)
        }}
      >
        <input
          value={nieuw}
          onChange={(e) => setNieuw(e.target.value)}
          placeholder={familie ? tt('Bijvoorbeeld: melk, brood') : 'Bijvoorbeeld: melk, brood'}
          aria-label={familie ? tt('Product toevoegen') : 'Product toevoegen'}
          className="min-h-touch min-w-0 flex-1 rounded-pill border-[1.5px] border-line-strong bg-surface px-5 text-lg"
        />
        <button
          type="submit"
          disabled={voegToe.isPending}
          className="min-h-touch rounded-pill bg-accent-ink px-5 text-lg font-bold text-white disabled:opacity-60"
        >
          {familie ? tt('Toevoegen') : 'Toevoegen'}
        </button>
      </form>
      {voegToe.isError ? (
        <p role="alert" className="mt-2 text-alert">
          {familie ? tt('Dat is niet gelukt. Probeer het opnieuw.') : 'Dat is niet gelukt. Probeer het opnieuw.'}
        </p>
      ) : null}
    </main>
  )
}

function Rij({ item, onVink, onWis }: { item: ShoppingItem; onVink: () => void; onWis?: () => void }) {
  const klaar = !!item.done_at
  return (
    <li className="flex items-center gap-2">
      <button
        onClick={onVink}
        role="checkbox"
        aria-checked={klaar}
        className={`flex min-h-[4rem] flex-1 items-center gap-4 rounded-card border border-line p-4 text-left text-xl shadow-card ${
          klaar ? 'bg-surface-soft text-ink-faint line-through' : 'bg-surface font-semibold'
        }`}
      >
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 ${
            klaar ? 'border-ok bg-ok text-white' : 'border-line-strong'
          }`}
        >
          {klaar ? <Check size={22} aria-hidden="true" /> : null}
        </span>
        {item.name}
      </button>
      {/* Alleen familie krijgt een wisknop, dus deze tekst volgt de taal van familie. */}
      {onWis ? (
        <button
          onClick={onWis}
          aria-label={tt('{naam} verwijderen', { naam: item.name })}
          className="grid min-h-touch min-w-[3rem] place-items-center rounded-full text-ink-faint"
        >
          <Trash2 size={20} aria-hidden="true" />
        </button>
      ) : null}
    </li>
  )
}
