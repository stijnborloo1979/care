import { useState } from 'react'

/**
 * Eén knop om een foto te kiezen, overal hetzelfde: bij een ding, een
 * kamer, een stap, een persoon, een bericht. Ze regelt zelf het wachten
 * en de foutmelding, zodat elk scherm dat niet opnieuw moet doen.
 *
 * capture wordt bewust niet gezet: familie kiest meestal een bestaande
 * foto uit de galerij, en wie toch wil fotograferen, krijgt die keuze van
 * het toestel zelf.
 */
export default function FotoKiezer({
  label = 'Foto kiezen',
  bezigLabel = 'Bezig…',
  onKies,
  className = '',
}: {
  label?: string
  bezigLabel?: string
  onKies: (bestand: File) => Promise<unknown>
  className?: string
}) {
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function kies(e: React.ChangeEvent<HTMLInputElement>) {
    const bestand = e.target.files?.[0]
    // Het veld leegmaken, anders kan dezelfde foto geen tweede keer
    // gekozen worden na een mislukking.
    e.target.value = ''
    if (!bestand) return

    setBezig(true)
    setFout(null)
    try {
      await onKies(bestand)
    } catch (err) {
      setFout(err instanceof Error ? err.message : 'De foto kon niet bewaard worden.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <span className={className}>
      <label className="relative inline-flex min-h-[2.4rem] cursor-pointer items-center overflow-hidden rounded-pill border-[1.5px] border-line-strong px-4 py-1 text-sm font-semibold">
        {bezig ? bezigLabel : label}
        <input
          type="file"
          accept="image/*"
          onChange={kies}
          disabled={bezig}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      {fout ? (
        <span role="alert" className="ml-2 text-sm text-alert">
          {fout}
        </span>
      ) : null}
    </span>
  )
}
