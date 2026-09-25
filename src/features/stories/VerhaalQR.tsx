import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * Een QR-code naar één verhaal, voor in het boek.
 *
 * Het papier bewaart de woorden, de code bewaart de stem: wie hem scant,
 * komt op een scherm dat die ene opname afspeelt. Bewust een link naar de
 * app en niet naar het geluidsbestand zelf — een ondertekende link op
 * papier verloopt binnen het uur, en een link die voor iedereen werkt zou
 * een privéopname publiek maken. Wie scant, moet dus ingelogd zijn.
 *
 * De code wordt in de browser getekend, dus hij werkt ook zonder netwerk
 * en er gaat niets naar een externe dienst.
 */
export default function VerhaalQR({ id, grootte = 108 }: { id: string; grootte?: number }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let weg = false
    const url = `${window.location.origin}/verhaal/${id}`

    QRCode.toDataURL(url, {
      width: grootte * 3,
      margin: 0,
      errorCorrectionLevel: 'M',
      // Zwart op wit: dat scant het betrouwbaarst, ook op een afdruk in
      // grijstinten.
      color: { dark: '#000000', light: '#ffffff' },
    })
      .then((data) => {
        if (!weg) setSrc(data)
      })
      .catch(() => {
        if (!weg) setSrc(null)
      })

    return () => {
      weg = true
    }
  }, [id, grootte])

  if (!src) return null

  return (
    <img
      src={src}
      width={grootte}
      height={grootte}
      alt="Scan om dit verhaal te beluisteren"
      style={{ width: grootte, height: grootte }}
    />
  )
}
