/**
 * Wat je ziet wanneer de twee omgevingsvariabelen niet gezet zijn. Dit is
 * de plek waar vroeger een wit scherm stond.
 */
export default function SetupNeeded() {
  return (
    <main className="mx-auto max-w-[34rem] px-5 py-12">
      <p className="text-5xl" aria-hidden="true">
        ⚙️
      </p>
      <h1 className="mt-4 text-2xl font-bold tracking-tight">Nog niet verbonden met de database</h1>
      <p className="mt-2 text-lg text-ink-soft">
        De app weet niet met welk Supabase-project ze moet praten. Twee variabelen ontbreken:
      </p>

      <ul className="mt-5 space-y-2">
        {['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'].map((v) => (
          <li key={v} className="rounded-2xl border border-line bg-surface-soft p-3 font-mono text-sm">
            {v}
          </li>
        ))}
      </ul>

      <ol className="mt-6 space-y-3">
        {[
          'Open je project op supabase.com en ga naar Project Settings → API.',
          'Kopieer de Project URL en de anon public key.',
          'Zet ze in Netlify onder Site configuration → Environment variables.',
          'Klik op Deploys → Trigger deploy. De waarden worden pas bij het bouwen ingebakken.',
        ].map((s, i) => (
          <li key={i} className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[1.5px] border-accent bg-accent-soft font-bold text-accent-ink">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>

      <p className="mt-5 text-sm text-ink-faint">
        Die laatste stap wordt het vaakst vergeten: variabelen toevoegen zonder opnieuw te bouwen
        verandert niets aan de site die al online staat.
      </p>
    </main>
  )
}
