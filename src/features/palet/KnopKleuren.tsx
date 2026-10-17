import { useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { tt } from '../../lib/uiTaal'
import { compressImage, extensionForImage } from '../../lib/image'
import { KnopAchtergrond } from '../knoppen/KnoppenHome'
import {
  KNOP_KLEUREN,
  KNOP_IDS,
  schoneKnopFotos,
  schoneKnopKleuren,
  type KnopFotos,
  type KnopId,
  type KnopKleuren,
} from './paletten'

/**
 * Per knop van het scherm met grote knoppen een kleur of een foto kiezen.
 *
 * Een kleur komt uit de vaste lijst in paletten.ts. Een foto krijgt een
 * donkere laag, zodat de tekst leesbaar blijft. Beide gaan via set_weergave,
 * dat de database weigert voor de persoon zelf.
 */

/*
 * De namen staan als losse tt()-aanroepen, zodat de vertaaltest ze ziet en
 * ze in elke taal een naam hebben. Een dynamische tt(variabele) zou stil
 * de Nederlandse naam tonen.
 */
const KNOP_NAMEN: Record<KnopId, () => string> = {
  nu: () => tt('Wat moet ik nu doen?'),
  vandaag: () => tt('Vandaag'),
  wie: () => tt('Wie komt er?'),
  memory: () => tt('Waar ligt het?'),
  fotos: () => tt("Foto's"),
  radio: () => tt('Radio'),
  help: () => tt('Help'),
}

function kleurNaam(hex: string): string {
  switch (hex) {
    case '#0f5d63': return tt('Petrol')
    case '#1d6b63': return tt('Linde')
    case '#2f6b3a': return tt('Bos')
    case '#1f4e79': return tt('Blauw')
    case '#17568f': return tt('Zee')
    case '#2b3f8f': return tt('Indigo')
    case '#66409a': return tt('Paars')
    case '#7a2f5e': return tt('Pruim')
    case '#9a4a2a': return tt('Roest')
    case '#7a5a12': return tt('Oker')
    case '#5c1f08': return tt('Bruin')
    case '#1f1d1a': return tt('Inkt')
    default: return hex
  }
}

/** De bucket waar de knopfoto's staan: dezelfde als de kamerfoto's. */
const BUCKET = 'home-memory'

interface Weergave {
  knoppenKleuren?: KnopKleuren
  knoppenFotos?: KnopFotos
}

export function KnopKleuren({ hh }: { hh: string }) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['weergave', hh],
    enabled: !!hh,
    queryFn: async (): Promise<Weergave | null> => {
      const { data, error } = await supabase.rpc('effective_weergave', { hh })
      if (error) throw error
      return (data as Weergave | null) ?? null
    },
  })

  const kleuren: KnopKleuren = schoneKnopKleuren(data?.knoppenKleuren)
  const fotos: KnopFotos = schoneKnopFotos(data?.knoppenFotos)

  function ververs() {
    qc.invalidateQueries({ queryKey: ['weergave', hh] })
    qc.invalidateQueries({ queryKey: ['prefs', hh] })
  }

  const zetKleur = useMutation({
    mutationFn: async (nieuw: KnopKleuren) => {
      // De functie vervangt het hele object: we sturen de volledige lijst.
      const { error } = await supabase.rpc('set_weergave', {
        hh,
        prefs: { knoppenKleuren: schoneKnopKleuren(nieuw) },
      })
      if (error) throw error
    },
    onSuccess: ververs,
  })

  /**
   * Een foto opslaan of weghalen. De database controleert het pad; pas als
   * die het aanneemt, gaat de vorige foto uit de bucket.
   */
  const zetFoto = useMutation({
    mutationFn: async ({ id, file, weg }: { id: KnopId; file?: File; weg?: boolean }) => {
      const vorige = fotos[id] ?? null
      let nieuwPad: string | null = null

      if (file && !weg) {
        const blob = await compressImage(file, 1200)
        nieuwPad = `${hh}/knoppen/${id}/${crypto.randomUUID()}.${extensionForImage(blob.type)}`
        const { error } = await supabase.storage.from(BUCKET).upload(nieuwPad, blob, { contentType: blob.type })
        if (error) throw error
      }

      const map: KnopFotos = { ...fotos }
      if (nieuwPad) map[id] = nieuwPad
      else delete map[id]

      const { error } = await supabase.rpc('set_weergave', {
        hh,
        prefs: { knoppenFotos: schoneKnopFotos(map) },
      })
      if (error) {
        // Geen rij die naar het bestand verwijst: dan het nieuwe bestand weer weg.
        if (nieuwPad) await supabase.storage.from(BUCKET).remove([nieuwPad])
        throw error
      }

      if (vorige && vorige !== nieuwPad) await supabase.storage.from(BUCKET).remove([vorige])
    },
    onSuccess: ververs,
  })

  function kies(id: KnopId, hex: string | null) {
    const nieuw: KnopKleuren = { ...kleuren }
    if (hex === null) delete nieuw[id]
    else nieuw[id] = hex
    zetKleur.mutate(nieuw)
  }

  const bezig = zetKleur.isPending || zetFoto.isPending
  const fout = zetKleur.error || zetFoto.error

  if (isLoading) return null

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">
        {tt('Kies per knop een kleur. De indeling verandert niet.')}
      </p>
      <p className="text-sm text-ink-soft">
        {tt('Met een foto wordt het onderste deel van de knop donkerder, zodat de tekst leesbaar blijft.')}
      </p>

      <ul className="space-y-4">
        {KNOP_IDS.map((id) => (
          <KnopRij
            key={id}
            naam={KNOP_NAMEN[id]()}
            gekozen={kleuren[id]}
            foto={fotos[id]}
            bezig={bezig}
            onKies={(hex) => kies(id, hex)}
            onFoto={(file) => zetFoto.mutate({ id, file })}
            onWeg={() => zetFoto.mutate({ id, weg: true })}
          />
        ))}
      </ul>

      {fout ? (
        <p role="alert" className="text-sm font-semibold text-alert">
          {tt('Dat lukte nu niet. Probeer het later nog eens.')}
        </p>
      ) : null}
    </div>
  )
}

function KnopRij({
  naam,
  gekozen,
  foto,
  bezig,
  onKies,
  onFoto,
  onWeg,
}: {
  naam: string
  gekozen: string | undefined
  foto: string | undefined
  bezig: boolean
  onKies: (hex: string | null) => void
  onFoto: (file: File) => void
  onWeg: () => void
}) {
  const invoer = useRef<HTMLInputElement>(null)

  return (
    <li className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-base font-semibold text-ink">{naam}</span>
        <div className="flex items-center gap-2">
          {gekozen ? (
            <button
              type="button"
              onClick={() => onKies(null)}
              disabled={bezig}
              className="min-h-[2.5rem] rounded-pill px-3 text-sm font-semibold text-accent-ink underline disabled:opacity-60"
            >
              {tt('Standaard')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={naam}>
        {KNOP_KLEUREN.map((k) => {
          const actief = gekozen === k.hex
          return (
            <button
              key={k.hex}
              type="button"
              onClick={() => onKies(k.hex)}
              disabled={bezig}
              aria-pressed={actief}
              aria-label={kleurNaam(k.hex)}
              title={kleurNaam(k.hex)}
              className={`h-11 w-11 rounded-full border-2 disabled:opacity-60 ${
                actief ? 'border-ink ring-2 ring-ink ring-offset-2 ring-offset-surface' : 'border-line'
              }`}
              style={{ backgroundColor: k.hex }}
            />
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        {foto ? (
          <div className="relative h-16 w-28 overflow-hidden rounded-xl border border-line">
            <KnopAchtergrond pad={foto} />
          </div>
        ) : null}
        <input
          ref={invoer}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) onFoto(file)
          }}
        />
        <button
          type="button"
          onClick={() => invoer.current?.click()}
          disabled={bezig}
          className="min-h-[2.75rem] rounded-pill border-2 border-line bg-surface px-4 text-sm font-semibold text-ink disabled:opacity-60"
        >
          {foto ? tt('Foto wijzigen') : tt('Foto kiezen')}
        </button>
        {foto ? (
          <button
            type="button"
            onClick={onWeg}
            disabled={bezig}
            className="min-h-[2.75rem] rounded-pill px-4 text-sm font-semibold text-accent-ink underline disabled:opacity-60"
          >
            {tt('Foto weg')}
          </button>
        ) : null}
      </div>
    </li>
  )
}
