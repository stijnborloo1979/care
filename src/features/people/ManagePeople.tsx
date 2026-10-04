import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Avatar from '../../components/Avatar'
import { deletePerson, savePerson, uploadPersonPhoto, type PersonCard } from '../../services/people'
import { usePeople } from './usePeople'
import DictateButton from '../../components/DictateButton'
import { tt } from '../../lib/uiTaal'

const SOORT: { waarde: PersonCard['kind']; label: string }[] = [
  { waarde: 'family', label: tt('Familie') },
  { waarde: 'care', label: tt('Zorg') },
  { waarde: 'contact', label: tt('Contact') },
]

/**
 * De beschrijving is het belangrijkste veld en tegelijk het veld dat
 * iedereen overslaat. Ze wordt letterlijk aan de persoon getoond, dus ze
 * is in de tweede persoon geschreven: "Els is je dochter."
 */
export default function ManagePeople({ householdId }: { householdId: string }) {
  const { data: people } = usePeople(householdId)
  const [open, setOpen] = useState<string | null>(null)

  return (
    <section className="rounded-card bg-surface p-6 shadow-card">
      <h2 className="text-lg font-bold">{tt('Wie is wie')}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {tt('Familie, zorgverleners en buren, met een zin die uitlegt wie ze zijn.')}
      </p>

      <ul className="mt-4 space-y-2">
        {(people ?? [])
          .filter((p) => p.kind !== 'self')
          .map((p) => (
            <li key={p.id} className="rounded-2xl border border-line bg-surface-soft p-3">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} photoPath={p.photo_path} color={p.color} size="s" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.name}</span>
                  <span className="block truncate text-sm text-ink-soft">
                    {p.relation}
                    {p.description ? ` — ${p.description}` : ''}
                  </span>
                </span>
                <button
                  onClick={() => setOpen(open === p.id ? null : p.id)}
                  className="min-h-[2.4rem] shrink-0 rounded-pill border-[1.5px] border-line-strong px-3 text-sm font-semibold"
                >
                  {open === p.id ? tt('Sluiten') : tt('Wijzigen')}
                </button>
              </div>

              {open === p.id ? (
                <PersonEditor
                  householdId={householdId}
                  person={p}
                  onDone={() => setOpen(null)}
                />
              ) : null}
            </li>
          ))}
      </ul>

      <div className="mt-4">
        {open === 'nieuw' ? (
          <PersonEditor householdId={householdId} onDone={() => setOpen(null)} />
        ) : (
          <button
            onClick={() => setOpen('nieuw')}
            className="flex min-h-touch w-full items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white"
          >
            {tt('+ Persoon toevoegen')}
          </button>
        )}
      </div>
    </section>
  )
}

function PersonEditor({
  householdId,
  person,
  onDone,
}: {
  householdId: string
  person?: PersonCard
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(person?.name ?? '')
  const [relation, setRelation] = useState(person?.relation ?? '')
  const [description, setDescription] = useState(person?.description ?? '')
  const [detail, setDetail] = useState(person?.detail ?? '')
  const [phone, setPhone] = useState(person?.phone ?? '')
  const [kind, setKind] = useState<PersonCard['kind']>(person?.kind ?? 'family')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ververs = () => queryClient.invalidateQueries({ queryKey: ['people', householdId] })

  const opslaan = useMutation({
    mutationFn: () =>
      savePerson({
        householdId,
        id: person?.id,
        name: name.trim(),
        relation: relation.trim(),
        description: description.trim(),
        detail: detail.trim(),
        phone: phone.trim(),
        kind,
      }),
    onSuccess: async () => {
      await ververs()
      onDone()
    },
    onError: (e) => setError(e instanceof Error ? e.message : tt('Opslaan lukte niet.')),
  })

  const verwijder = useMutation({
    mutationFn: () => deletePerson(person!.id),
    onSuccess: async () => {
      await ververs()
      onDone()
    },
  })

  async function kiesFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !person) return
    setUploading(true)
    try {
      await uploadPersonPhoto(householdId, person.id, file)
      await ververs()
    } catch (err) {
      setError(err instanceof Error ? err.message : tt('Foto uploaden lukte niet.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError(null)
        opslaan.mutate()
      }}
      className="mt-3 space-y-3 rounded-2xl border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap gap-3">
        <label className="min-w-[min(8rem,100%)] flex-1">
          <span className="text-sm font-semibold text-ink-soft">{tt('Naam')}</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
        <label className="min-w-[min(8rem,100%)] flex-1">
          <span className="text-sm font-semibold text-ink-soft">{tt('Relatie')}</span>
          <input
            required
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
            placeholder={tt('Dochter')}
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink-soft">{tt('Wie is dit? In de je-vorm')}</span>
          <DictateButton onTekst={(t) => setDescription(t)} />
        </div>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={tt('Els is je dochter. Ze woont in Leuven.')}
          className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
        />
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-ink-soft">{tt('Extra, mag leeg blijven')}</span>
        <input
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder={tt('Belt elke avond rond zeven uur.')}
          className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
        />
      </label>

      <div className="flex flex-wrap gap-3">
        <label className="min-w-[min(8rem,100%)] flex-1">
          <span className="text-sm font-semibold text-ink-soft">{tt('Telefoon')}</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
        <label className="min-w-[min(8rem,100%)] flex-1">
          <span className="text-sm font-semibold text-ink-soft">{tt('Soort')}</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as PersonCard['kind'])}
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          >
            {SOORT.map((s) => (
              <option key={s.waarde} value={s.waarde}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {person ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-h-[2.4rem] cursor-pointer overflow-hidden rounded-pill border-[1.5px] border-line-strong px-4 py-1 text-sm font-semibold">
            {uploading ? tt('Bezig…') : tt('Foto kiezen')}
            <input
              type="file"
              accept="image/*"
              onChange={kiesFoto}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              if (confirm(tt('"{naam}" verwijderen uit Wie is wie?', { naam: person.name }))) verwijder.mutate()
            }}
            className="min-h-[2.4rem] rounded-pill border-[1.5px] border-alert px-4 text-sm font-semibold text-alert"
          >
            {tt('Verwijderen')}
          </button>
        </div>
      ) : (
        <p className="text-xs text-ink-faint">{tt('Een foto kan je toevoegen zodra de persoon bewaard is.')}</p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={opslaan.isPending}
          className="flex min-h-touch flex-1 items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
        >
          {opslaan.isPending ? tt('Opslaan…') : tt('Opslaan')}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
        >
          {tt('Annuleren')}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-alert">
          {error}
        </p>
      ) : null}
    </form>
  )
}
