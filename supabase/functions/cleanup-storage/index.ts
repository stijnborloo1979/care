// Edge function: wist spraakberichten en foto's die nergens meer bij horen.
//
// cleanup_expired_messages() verwijdert de rij uit de tabel, maar het
// audiobestand blijft in de bucket staan. Dat groeit ongemerkt aan, en het
// zijn persoonlijke opnames: ze horen weg te zijn wanneer het bericht weg is.
// Supabase laat bestanden niet vanuit SQL verwijderen, vandaar deze functie.
//
// Draait met de service role: laat "Verify JWT" AAN en roep ze aan vanuit
// pg_cron, één keer per nacht na run_nightly() (zie onderaan 20_push.sql).
//
// Veiligheidsmarge: een bestand van minder dan een dag oud blijft altijd
// staan. Tussen de upload en de insert van het bericht zit een moment
// waarop het bestand er al is en de rij nog niet.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'messages'
const MARGE_MS = 24 * 3600 * 1000
const PER_KEER = 100

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Alles wat nog in gebruik is, in blokken: Supabase geeft hoogstens
  // 1000 rijen per vraag terug. Wie maar het eerste blok kent, zou de rest
  // voor wezen houden en wissen.
  const { data: berichten, error } = await alleRijen<{ audio_path: string | null; photo_path: string | null }>(
    (van, tot) => supabase.from('message').select('id, audio_path, photo_path').order('id').range(van, tot),
  )
  if (error) return new Response(error.message, { status: 500 })

  const inGebruik = new Set<string>()
  for (const m of berichten ?? []) {
    if (m.audio_path) inGebruik.add(m.audio_path)
    if (m.photo_path) inGebruik.add(m.photo_path)
  }

  // Opnames van verhalen en het dagboek staan in dezelfde bucket, onder
  // <huishouden>/verhalen/. Ze horen bij life_story, niet bij een bericht,
  // en mogen hier nooit gewist worden. Lukt het niet om ze op te halen,
  // dan wordt er niets gewist.
  const { data: verhalen, error: verhaalFout } = await alleRijen<{ audio_path: string | null }>((van, tot) =>
    supabase.from('life_story').select('id, audio_path').not('audio_path', 'is', null).order('id').range(van, tot),
  )
  if (verhaalFout) return new Response(verhaalFout.message, { status: 500 })
  for (const v of verhalen ?? []) {
    if (v.audio_path) inGebruik.add(v.audio_path)
  }

  const wezen = await zoekWezen((prefix) => lijst(supabase, prefix), inGebruik, Date.now() - MARGE_MS, PER_KEER)

  if (wezen.length > 0) {
    const { error: wisError } = await supabase.storage.from(BUCKET).remove(wezen)
    if (wisError) return new Response(wisError.message, { status: 500 })
  }

  // Tweede ronde: foto's van bezoeken (74) die bij geen bezoek meer horen,
  // bv. wanneer de familiebeheerder het bezoek van een ander wiste. Alleen
  // in <huishouden>/bezoek/ van de bucket memories; niets anders daar.
  const bezoekfotos = await ruimBezoekfotosOp(supabase)

  return json({ gewist: wezen.length, bezoekfotos })
})

const FOTO_BUCKET = 'memories'
const BLOK = 1000

type Fout = { message: string } | null

/** Haalt alle rijen op, blok per blok, tot een blok niet meer vol is. */
export async function alleRijen<T>(
  blok: (van: number, tot: number) => PromiseLike<{ data: unknown[] | null; error: Fout }>,
): Promise<{ data: T[]; error: Fout }> {
  const alle: T[] = []
  for (let van = 0; ; van += BLOK) {
    const { data, error } = await blok(van, van + BLOK - 1)
    if (error) return { data: [], error }
    alle.push(...((data ?? []) as T[]))
    if (!data || data.length < BLOK) return { data: alle, error: null }
  }
}

async function ruimBezoekfotosOp(supabase: Client): Promise<number> {
  const { data, error } = await alleRijen<{ photo_path: string | null }>((van, tot) =>
    supabase.from('visit_log').select('id, photo_path').not('photo_path', 'is', null).order('id').range(van, tot),
  )
  // Tabel nog niet aangemaakt, of niet op te halen: dan wist deze ronde niets.
  if (error) return 0
  const inGebruik = new Set<string>()
  for (const r of data as { photo_path?: string | null }[]) if (r.photo_path) inGebruik.add(r.photo_path)
  const wezen = await zoekBezoekWezen(
    (prefix) => lijstIn(supabase, FOTO_BUCKET, prefix),
    inGebruik,
    Date.now() - MARGE_MS,
    PER_KEER,
  )
  if (wezen.length === 0) return 0
  const { error: wisError } = await supabase.storage.from(FOTO_BUCKET).remove(wezen)
  return wisError ? 0 : wezen.length
}

/** Alleen <huishouden>/bezoek/<bestand>: oud, en geen bezoek dat ernaar wijst. */
export async function zoekBezoekWezen(
  lijst: (prefix: string) => Promise<Item[]>,
  inGebruik: Set<string>,
  grens: number,
  perKeer: number,
): Promise<string[]> {
  const wezen: string[] = []
  for (const hh of (await lijst('')).filter((i) => i.id === null).map((i) => i.name)) {
    const prefix = `${hh}/bezoek`
    for (const bestand of (await lijst(prefix)).filter((i) => i.id !== null)) {
      const pad = `${prefix}/${bestand.name}`
      if (inGebruik.has(pad)) continue
      const gemaakt = Date.parse(bestand.created_at ?? '')
      if (!Number.isFinite(gemaakt) || gemaakt > grens) continue
      wezen.push(pad)
      if (wezen.length >= perKeer) return wezen
    }
  }
  return wezen
}

async function lijstIn(supabase: Client, bucket: string, prefix: string): Promise<Item[]> {
  const { data } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  return (data ?? []) as Item[]
}

type Client = ReturnType<typeof createClient>

interface Item {
  name: string
  id: string | null
  created_at?: string
}

/** De map met opnames van verhalen en het dagboek: wordt nooit opgeruimd. */
const BESCHERMD = 'verhalen'

/**
 * Het pad is <huishouden>/<kanaal>/<bestand>. Een bestand mag weg als het
 * niet in gebruik is, ouder is dan de grens, en niet in de map 'verhalen'
 * staat. Een map heeft geen id: zo onderscheidt de storage-API ze van
 * bestanden.
 */
export async function zoekWezen(
  lijst: (prefix: string) => Promise<Item[]>,
  inGebruik: Set<string>,
  grens: number,
  perKeer: number,
): Promise<string[]> {
  const mappen = async (p: string) => (await lijst(p)).filter((i) => i.id === null).map((i) => i.name)
  const bestanden = async (p: string) => (await lijst(p)).filter((i) => i.id !== null)

  const wezen: string[] = []
  for (const hh of await mappen('')) {
    for (const kanaal of await mappen(hh)) {
      if (kanaal === BESCHERMD) continue
      const prefix = `${hh}/${kanaal}`
      for (const bestand of await bestanden(prefix)) {
        const pad = `${prefix}/${bestand.name}`
        if (inGebruik.has(pad)) continue
        const gemaakt = Date.parse(bestand.created_at ?? '')
        if (Number.isFinite(gemaakt) && gemaakt > grens) continue
        wezen.push(pad)
        if (wezen.length >= perKeer) return wezen
      }
    }
  }
  return wezen
}

async function lijst(supabase: Client, prefix: string): Promise<Item[]> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  return (data ?? []) as Item[]
}


function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })
}
