// Edge function: verhuist oude opnames van verhalen en dagboek van de
// bucket 'messages' (map <hh>/verhalen/) naar de bucket 'diary' (56).
//
// Veilig by default
// -----------------
//   - Zonder { "uitvoeren": true } verandert er niets: je krijgt alleen
//     te zien wat er zou gebeuren.
//   - Per opname: downloaden, uploaden naar 'diary', de kopie opnieuw
//     downloaden en de grootte vergelijken, en pas dan het verhaal laten
//     wijzen naar de nieuwe plek. Lukt één stap niet, dan blijft het
//     verhaal naar de oude plek wijzen.
//   - Het oude bestand blijft staan. Pas wanneer je { "opruimen": true,
//     "uitvoeren": true } stuurt, wordt een oud bestand gewist, en alleen
//     als er een kopie in 'diary' staat met dezelfde grootte en geen enkel
//     verhaal nog naar het oude pad wijst.
//   - Hoogstens 'aantal' opnames per keer (standaard 25). Nog eens
//     aanroepen gaat verder waar de vorige stopte.
//
// Alleen met de service role. Laat "Verify JWT" AAN.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const OUD = 'messages'
const NIEUW = 'diary'

interface Verzoek {
  uitvoeren?: boolean
  opruimen?: boolean
  aantal?: number
}

interface Resultaat {
  pad: string
  naar?: string
  uitkomst: 'zou_verhuizen' | 'verhuisd' | 'ontbreekt' | 'mislukt' | 'zou_wissen' | 'gewist' | 'blijft'
  reden?: string
}

/** Een geldige JWT met rol service_role, of de sleutel zelf. */
export function isServiceRole(auth: string | null, sleutel: string | undefined): boolean {
  if (!auth?.startsWith('Bearer ')) return false
  const token = auth.slice(7)
  if (sleutel && token === sleutel) return true
  try {
    const deel = token.split('.')[1]
    const json = atob(deel.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(deel.length / 4) * 4, '='))
    return JSON.parse(json).role === 'service_role'
  } catch {
    return false
  }
}

/** <hh>/verhalen/<bestand> wordt <hh>/<bestand>. */
export function nieuwPad(oud: string): string | null {
  const delen = oud.split('/')
  if (delen.length !== 3 || delen[1] !== 'verhalen' || !delen[0] || !delen[2]) return null
  return `${delen[0]}/${delen[2]}`
}

Deno.serve(async (req) => {
  if (!isServiceRole(req.headers.get('Authorization'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))) {
    return json({ error: 'Alleen met de service role' }, 403)
  }

  const v: Verzoek = await req.json().catch(() => ({}))
  const uitvoeren = v.uitvoeren === true
  const aantal = Math.min(Math.max(Number(v.aantal) || 25, 1), 200)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  return v.opruimen ? await opruimen(db, uitvoeren, aantal) : await verhuis(db, uitvoeren, aantal)
})

type Db = ReturnType<typeof createClient>

async function verhuis(db: Db, uitvoeren: boolean, aantal: number) {
  const { data: rijen, error } = await db
    .from('life_story')
    .select('id, household_id, audio_path')
    .eq('audio_bucket', OUD)
    .like('audio_path', '%/verhalen/%')
    .order('created_at', { ascending: true })
    .limit(aantal)
  if (error) return json({ error: error.message }, 500)

  const uit: Resultaat[] = []
  for (const r of rijen ?? []) {
    const oud = r.audio_path as string
    const naar = nieuwPad(oud)
    if (!naar || !naar.startsWith(`${r.household_id}/`)) {
      uit.push({ pad: oud, uitkomst: 'mislukt', reden: 'onverwacht pad' })
      continue
    }

    const { data: bestand, error: haalFout } = await db.storage.from(OUD).download(oud)
    if (haalFout || !bestand) {
      uit.push({ pad: oud, uitkomst: 'ontbreekt', reden: haalFout?.message })
      continue
    }
    if (!uitvoeren) {
      uit.push({ pad: oud, naar, uitkomst: 'zou_verhuizen' })
      continue
    }

    // Uploaden; staat er al een kopie (vorige poging), dan die controleren.
    const { error: zetFout } = await db.storage
      .from(NIEUW)
      .upload(naar, bestand, { contentType: bestand.type || 'audio/webm', upsert: false })
    if (zetFout && !/exist/i.test(zetFout.message)) {
      uit.push({ pad: oud, naar, uitkomst: 'mislukt', reden: zetFout.message })
      continue
    }

    const { data: kopie, error: kopieFout } = await db.storage.from(NIEUW).download(naar)
    if (kopieFout || !kopie || kopie.size !== bestand.size) {
      uit.push({ pad: oud, naar, uitkomst: 'mislukt', reden: 'kopie klopt niet' })
      continue
    }

    // Alleen omzetten als het verhaal nog naar de oude plek wijst.
    const { data: gezet, error: zetRijFout } = await db
      .from('life_story')
      .update({ audio_bucket: NIEUW, audio_path: naar })
      .eq('id', r.id)
      .eq('audio_path', oud)
      .select('id')
    if (zetRijFout || !gezet || gezet.length !== 1) {
      uit.push({ pad: oud, naar, uitkomst: 'mislukt', reden: zetRijFout?.message ?? 'verhaal veranderde intussen' })
      continue
    }
    uit.push({ pad: oud, naar, uitkomst: 'verhuisd' })
  }

  const { count } = await db
    .from('life_story')
    .select('id', { count: 'exact', head: true })
    .eq('audio_bucket', OUD)
    .like('audio_path', '%/verhalen/%')

  return json({ modus: uitvoeren ? 'uitgevoerd' : 'proef', resultaten: uit, nog_te_doen: count ?? null })
}

async function opruimen(db: Db, uitvoeren: boolean, aantal: number) {
  // Alle paden waar nog een verhaal naar wijst, in beide buckets.
  const { data: verhalen, error } = await db.from('life_story').select('audio_path').not('audio_path', 'is', null)
  if (error) return json({ error: error.message }, 500)
  const inGebruik = new Set((verhalen ?? []).map((v) => v.audio_path as string))

  const uit: Resultaat[] = []
  const { data: huishoudens } = await db.storage.from(OUD).list('', { limit: 1000 })
  for (const hh of (huishoudens ?? []).filter((i) => i.id === null)) {
    const prefix = `${hh.name}/verhalen`
    const { data: bestanden } = await db.storage.from(OUD).list(prefix, { limit: 1000 })
    for (const b of (bestanden ?? []).filter((i) => i.id !== null)) {
      if (uit.length >= aantal) break
      const oud = `${prefix}/${b.name}`
      const naar = `${hh.name}/${b.name}`
      if (inGebruik.has(oud)) {
        uit.push({ pad: oud, uitkomst: 'blijft', reden: 'een verhaal wijst er nog naar' })
        continue
      }
      if (!inGebruik.has(naar)) {
        uit.push({ pad: oud, uitkomst: 'blijft', reden: 'geen verhuisd verhaal gevonden' })
        continue
      }
      const [{ data: a }, { data: n }] = await Promise.all([
        db.storage.from(OUD).download(oud),
        db.storage.from(NIEUW).download(naar),
      ])
      if (!a || !n || a.size !== n.size) {
        uit.push({ pad: oud, uitkomst: 'blijft', reden: 'kopie in diary klopt niet' })
        continue
      }
      if (!uitvoeren) {
        uit.push({ pad: oud, naar, uitkomst: 'zou_wissen' })
        continue
      }
      const { error: wisFout } = await db.storage.from(OUD).remove([oud])
      uit.push(wisFout ? { pad: oud, uitkomst: 'mislukt', reden: wisFout.message } : { pad: oud, naar, uitkomst: 'gewist' })
    }
  }
  return json({ modus: uitvoeren ? 'uitgevoerd' : 'proef', opruimen: true, resultaten: uit })
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
