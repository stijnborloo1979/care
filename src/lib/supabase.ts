import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Ontbreken de instellingen, dan mag dit bestand NIET stuklopen bij het
 * laden: de app is dan nog niet gemonteerd en de gebruiker ziet een wit
 * scherm zonder uitleg. In plaats daarvan gaan we door met een dummy en
 * toont main.tsx een scherm dat zegt wat er ontbreekt.
 */
export const configuratieOk = !!url && !!anonKey

export const supabase = createClient(
  url || 'https://onbekend.supabase.co',
  anonKey || 'ontbreekt',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // De tablet van de persoon blijft ingelogd; de sessie wordt in de
      // achtergrond ververst zolang de app af en toe geopend wordt.
      detectSessionInUrl: true,
    },
  },
)
