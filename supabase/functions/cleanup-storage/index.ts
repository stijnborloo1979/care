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

  // Alles wat nog in gebruik is. Paden zijn kort en het aantal berichten
  // blijft klein; één keer ophalen volstaat.
  const { data: berichten, error } = await supabase
    .from('message')
    .select('audio_path, photo_path')
  if (error) return new Response(error.message, { status: 500 })

  const inGebruik = new Set<string>()
  for (const m of berichten ?? []) {
    if (m.audio_path) inGebruik.add(m.audio_path)
    if (m.photo_path) inGebruik.add(m.photo_path)
  }

  const grens = Date.now() - MARGE_MS
  const wezen: string[] = []

  // Het pad is <huishouden>/<kanaal>/<bestand>, dus twee niveaus mappen.
  for (const hh of await mappen(supabase, '')) {
    for (const kanaal of await mappen(supabase, hh)) {
      const prefix = `${hh}/${kanaal}`
      for (const bestand of await bestanden(supabase, prefix)) {
        const pad = `${prefix}/${bestand.name}`
        if (inGebruik.has(pad)) continue
        const gemaakt = Date.parse(bestand.created_at ?? '')
        if (Number.isFinite(gemaakt) && gemaakt > grens) continue
        wezen.push(pad)
        if (wezen.length >= PER_KEER) break
      }
    }
  }

  if (wezen.length === 0) return json({ gewist: 0 })

  const { error: wisError } = await supabase.storage.from(BUCKET).remove(wezen)
  if (wisError) return new Response(wisError.message, { status: 500 })

  return json({ gewist: wezen.length })
})

type Client = ReturnType<typeof createClient>
interface Item {
  name: string
  id: string | null
  created_at?: string
}

async function lijst(supabase: Client, prefix: string): Promise<Item[]> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  return (data ?? []) as Item[]
}

// Een map heeft geen id: zo onderscheidt de storage-API ze van bestanden.
async function mappen(supabase: Client, prefix: string): Promise<string[]> {
  return (await lijst(supabase, prefix)).filter((i) => i.id === null).map((i) => i.name)
}

async function bestanden(supabase: Client, prefix: string): Promise<Item[]> {
  return (await lijst(supabase, prefix)).filter((i) => i.id !== null)
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })
}
