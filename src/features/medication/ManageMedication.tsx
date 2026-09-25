import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Pill, Plus, X } from 'lucide-react'
import StoragePhoto from '../../components/StoragePhoto'
import { useHousehold } from '../household/useHousehold'
import Innamegeschiedenis from './Innamegeschiedenis'
import { dagenVoorraad, setVoorraad } from '../../services/medicationHistory'
import {
  deleteMedicijn,
  getMedicijnen,
  saveMedicijn,
  tijdenVan,
  uploadMedicijnFoto,
  type Medicijn,
} from '../../services/medication'

/**
 * Het medicatieschema. Wat hier staat, verschijnt als herinnering op het
 * scherm van de persoon, en als "genomen / nog niet" in het dashboard.
 *
 * Thuis stelt geen diagnose en geeft geen medisch advies: het schema komt
 * van de huisarts of apotheker, deze app helpt alleen onthouden.
 */
export default function ManageMedication() {
  const { household } = useHousehold()
  const hh = household?.household_id ?? ''
  const [open, setOpen] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['medicijnen', hh],
    queryFn: () => getMedicijnen(hh),
    enabled: !!hh,
  })

  const actief = (data ?? []).filter((m) => m.active)
  const gestopt = (data ?? []).filter((m) => !m.active)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Medicatie</h1>
        <p className="mt-1 text-ink-soft">
          Het schema zoals de huisarts of apotheker het voorschreef. Thuis herinnert eraan, maar
          stelt geen diagnose en geeft geen medisch advies.
        </p>
      </header>

      {isLoading ? <p className="text-ink-soft">Bezig met laden…</p> : null}

      <ul className="space-y-3">
        {actief.map((m) => (
          <MedRij key={m.id} m={m} hh={hh} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
        ))}
      </ul>

      {open === 'nieuw' ? (
        <MedEditor hh={hh} onKlaar={() => setOpen(null)} />
      ) : (
        <button
          onClick={() => setOpen('nieuw')}
          className="flex min-h-touch items-center gap-2 rounded-pill bg-accent-ink px-5 font-semibold text-white"
        >
          <Plus size={18} strokeWidth={1.75} />
          Medicijn toevoegen
        </button>
      )}

      <Innamegeschiedenis />

      {gestopt.length > 0 ? (
        <section>
          <h2 className="text-lg font-bold text-ink-soft">Gestopt</h2>
          <p className="mt-1 text-sm text-ink-faint">
            Blijven bewaard met hun geschiedenis. Zet ze weer aan als ze terug nodig zijn.
          </p>
          <ul className="mt-3 space-y-3">
            {gestopt.map((m) => (
              <MedRij key={m.id} m={m} hh={hh} open={open === m.id} onToggle={() => setOpen(open === m.id ? null : m.id)} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

function MedRij({
  m,
  hh,
  open,
  onToggle,
}: {
  m: Medicijn
  hh: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <li className={`rounded-card bg-surface p-5 shadow-card ${m.active ? '' : 'opacity-70'}`}>
      <div className="flex items-center gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-accent-soft text-accent-ink">
          <Pill size={22} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-bold">
            {m.name}
            {m.dose ? <span className="font-normal text-ink-soft"> — {m.dose}</span> : null}
          </span>
          <span className="block text-sm text-ink-soft">
            {tijdenVan(m).join(' · ')}
            {m.instruction ? ` · ${m.instruction}` : ''}
          </span>
          <VoorraadBadge m={m} />
        </span>
        <button
          onClick={onToggle}
          className="min-h-[2.4rem] shrink-0 rounded-pill border-[1.5px] border-line-strong px-3 text-sm font-semibold"
        >
          {open ? 'Sluiten' : 'Wijzigen'}
        </button>
      </div>
      {open ? <MedEditor hh={hh} m={m} onKlaar={onToggle} /> : null}
    </li>
  )
}

function MedEditor({ hh, m, onKlaar }: { hh: string; m?: Medicijn; onKlaar: () => void }) {
  const queryClient = useQueryClient()
  const [naam, setNaam] = useState(m?.name ?? '')
  const [dosis, setDosis] = useState(m?.dose ?? '')
  const [tijden, setTijden] = useState<string[]>(m ? tijdenVan(m) : ['08:00'])
  const [instructie, setInstructie] = useState(m?.instruction ?? '')
  const [bezigFoto, setBezigFoto] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const ververs = async () => {
    for (const k of ['medicijnen', 'summary', 'meds-today']) {
      await queryClient.invalidateQueries({ queryKey: [k, hh] })
    }
  }

  const bewaar = useMutation({
    mutationFn: (actief: boolean) =>
      saveMedicijn({
        householdId: hh,
        id: m?.id,
        naam: naam.trim(),
        dosis: dosis.trim(),
        tijden,
        instructie: instructie.trim(),
        actief,
      }),
    onSuccess: async () => {
      await ververs()
      onKlaar()
    },
    onError: (e) => setFout(e instanceof Error ? e.message : 'Opslaan lukte niet.'),
  })

  const wis = useMutation({
    mutationFn: () => deleteMedicijn(hh, m!.id),
    onSuccess: async () => {
      await ververs()
      onKlaar()
    },
  })

  async function kiesFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f || !m) return
    setBezigFoto(true)
    try {
      await uploadMedicijnFoto(hh, m.id, f)
      await ververs()
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'Foto uploaden lukte niet.')
    } finally {
      setBezigFoto(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setFout(null)
        if (!naam.trim()) return setFout('Geef het medicijn een naam.')
        if (tijden.length === 0) return setFout('Kies minstens één tijdstip.')
        bewaar.mutate(m?.active ?? true)
      }}
      className="mt-4 space-y-3 rounded-2xl bg-surface-soft p-4"
    >
      <div className="flex flex-wrap gap-3">
        <label className="min-w-[10rem] flex-1">
          <span className="text-sm font-semibold text-ink-soft">Naam</span>
          <input
            value={naam}
            onChange={(e) => setNaam(e.target.value)}
            placeholder="Zoals op de verpakking"
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
        <label className="w-40">
          <span className="text-sm font-semibold text-ink-soft">Dosis</span>
          <input
            value={dosis}
            onChange={(e) => setDosis(e.target.value)}
            placeholder="1 tablet"
            className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
          />
        </label>
      </div>

      {m ? <VoorraadVeld m={m} onKlaar={ververs} /> : null}

      <div>
        <span className="text-sm font-semibold text-ink-soft">Wanneer</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {tijden.map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-pill border border-line bg-surface pl-2">
              <input
                type="time"
                value={t}
                onChange={(e) => setTijden(tijden.map((x, j) => (j === i ? e.target.value : x)))}
                aria-label={`Tijdstip ${i + 1}`}
                className="min-h-[2.4rem] bg-transparent"
              />
              <button
                type="button"
                onClick={() => setTijden(tijden.filter((_, j) => j !== i))}
                aria-label="Tijdstip weghalen"
                className="grid h-9 w-9 place-items-center rounded-full text-ink-faint"
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => setTijden([...tijden, '20:00'])}
            className="min-h-[2.4rem] rounded-pill border border-dashed border-line-strong px-3 text-sm font-semibold text-ink-soft"
          >
            + Nog een tijdstip
          </button>
        </div>
      </div>

      <label className="block">
        <span className="text-sm font-semibold text-ink-soft">Hoe innemen?</span>
        <input
          value={instructie}
          onChange={(e) => setInstructie(e.target.value)}
          placeholder="Bij het ontbijt, met een glas water."
          className="mt-1 min-h-touch w-full rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
        />
        <span className="mt-1 block text-xs text-ink-faint">
          Zo verschijnt het bij de herinnering. Neem over wat de huisarts of apotheker zei.
        </span>
      </label>

      {m ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-20">
            <StoragePhoto path={m.photo_path} bucket="home-memory" emoji="💊" alt={m.name} />
          </span>
          <label className="relative min-h-[2.4rem] cursor-pointer overflow-hidden rounded-pill border-[1.5px] border-line-strong px-4 py-1 text-sm font-semibold">
            {bezigFoto ? 'Bezig…' : 'Foto van de verpakking'}
            <input type="file" accept="image/*" capture="environment" onChange={kiesFoto} className="absolute inset-0 opacity-0" />
          </label>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="submit"
          disabled={bewaar.isPending}
          className="flex min-h-touch flex-1 items-center justify-center rounded-pill bg-accent-ink px-5 font-semibold text-white disabled:opacity-60"
        >
          {bewaar.isPending ? 'Opslaan…' : 'Opslaan'}
        </button>
        {m ? (
          <button
            type="button"
            onClick={() => bewaar.mutate(!m.active)}
            className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-5 font-semibold"
          >
            {m.active ? 'Stoppen' : 'Opnieuw starten'}
          </button>
        ) : null}
      </div>

      {m ? (
        <button
          type="button"
          onClick={() => {
            if (
              confirm(
                `"${m.name}" helemaal verwijderen? Ook de geschiedenis van wat wanneer genomen werd, verdwijnt. Stoppen bewaart die wel.`,
              )
            )
              wis.mutate()
          }}
          className="text-sm font-semibold text-alert underline underline-offset-4"
        >
          Verwijderen, met geschiedenis
        </button>
      ) : null}

      {fout ? (
        <p role="alert" className="rounded-2xl bg-alert-soft p-3 text-sm text-alert">
          {fout}
        </p>
      ) : null}
    </form>
  )
}

/**
 * Hoeveel er nog in huis is. Alleen zichtbaar als familie het bijhoudt:
 * een leeg getal betekent dat niemand de doos telt, en dat is een
 * legitieme keuze.
 */
function VoorraadBadge({ m }: { m: Medicijn }) {
  const dagen = dagenVoorraad(m.stock_doses, tijdenVan(m).length)
  if (dagen === null || !m.active) return null

  const bijna = dagen <= 7
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-sm font-semibold ${
        bijna ? 'bg-warn-soft text-warn' : 'text-ink-faint'
      }`}
    >
      {bijna ? <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" /> : null}
      Nog {dagen} {dagen === 1 ? 'dag' : 'dagen'} voorraad
    </span>
  )
}

/**
 * De voorraad zetten. Elke bevestiging trekt er vanzelf één af, dus dit
 * is het getal van een nieuwe doos, niet iets om dagelijks bij te houden.
 */
function VoorraadVeld({ m, onKlaar }: { m: Medicijn; onKlaar: () => Promise<void> }) {
  const [waarde, setWaarde] = useState(m.stock_doses === null ? '' : String(m.stock_doses))
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const dagen = dagenVoorraad(m.stock_doses, tijdenVan(m).length)

  async function bewaar() {
    setBezig(true)
    setFout(null)
    try {
      const n = waarde.trim() === '' ? null : Number(waarde)
      if (n !== null && (!Number.isFinite(n) || n < 0)) throw new Error('Geef een aantal van 0 of meer.')
      await setVoorraad(m.id, n)
      await onKlaar()
    } catch (e) {
      setFout(e instanceof Error ? e.message : 'De voorraad bijwerken lukte niet.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div>
      <span className="text-sm font-semibold text-ink-soft">Voorraad</span>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          value={waarde}
          onChange={(e) => setWaarde(e.target.value)}
          placeholder="aantal"
          aria-label="Aantal doses in huis"
          className="min-h-touch w-28 rounded-2xl border-[1.5px] border-line-strong bg-surface px-4"
        />
        <button
          type="button"
          onClick={bewaar}
          disabled={bezig}
          className="min-h-touch rounded-pill border-[1.5px] border-line-strong px-4 font-semibold disabled:opacity-60"
        >
          {bezig ? 'Bezig…' : 'Bijwerken'}
        </button>
        <span className="text-sm text-ink-faint">
          {dagen === null
            ? 'Leeg laten als je de voorraad niet bijhoudt.'
            : `Goed voor ${dagen} ${dagen === 1 ? 'dag' : 'dagen'}. Elke bevestiging trekt er één af.`}
        </span>
      </div>
      {fout ? (
        <p role="alert" className="mt-1 text-sm text-alert">
          {fout}
        </p>
      ) : null}
    </div>
  )
}
