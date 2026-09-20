import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Beter hier stuklopen dan met een leeg scherm in productie staan.
  throw new Error(
    'VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY ontbreken. Zet ze in .env en in Netlify onder Environment variables.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // De tablet van de persoon blijft ingelogd; de sessie wordt in de
    // achtergrond ververst zolang de app af en toe geopend wordt.
    detectSessionInUrl: true,
  },
})
