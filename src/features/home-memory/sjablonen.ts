export interface Sjabloon {
  naam: string
  emoji: string
  kamer: string
  waar: string
  stappen: string[]
}

/**
 * Kant-en-klare uitleg voor de apparaten die in bijna elk huis staan.
 * Familie past aan wat anders is in plaats van alles uit te typen — dat
 * scheelt het verschil tussen tien minuten en twintig seconden, en dus
 * tussen wel en niet invullen.
 */
export const SJABLONEN: Sjabloon[] = [
  {
    naam: 'Koffiezetapparaat',
    emoji: '☕',
    kamer: 'Keuken',
    waar: 'Op het aanrecht.',
    stappen: [
      'Vul het waterreservoir tot de streep.',
      'Zet een kopje onder de tuit.',
      'Druk op de grote knop.',
      'Wacht tot het geluid stopt.',
    ],
  },
  {
    naam: 'Wasmachine',
    emoji: '🧺',
    kamer: 'Keuken',
    waar: 'In de bijkeuken.',
    stappen: [
      'Doe de was in de trommel.',
      'Doe een wasdopje in het bakje.',
      'Draai de knop naar 40 graden.',
      'Druk op de startknop.',
    ],
  },
  {
    naam: 'Televisie',
    emoji: '📺',
    kamer: 'Woonkamer',
    waar: 'De afstandsbediening ligt op de salontafel.',
    stappen: [
      'Neem de afstandsbediening.',
      'Druk op de rode knop bovenaan.',
      'Druk op 1 voor de eerste zender.',
      'Het volume staat op de knop met plus en min.',
    ],
  },
  {
    naam: 'Oven',
    emoji: '🔥',
    kamer: 'Keuken',
    waar: 'Onder het aanrecht.',
    stappen: [
      'Draai de linkerknop naar 180 graden.',
      'Wacht tot het lampje uitgaat.',
      'Zet de schotel in het midden.',
      'Zet de timer.',
    ],
  },
  {
    naam: 'Microgolfoven',
    emoji: '📡',
    kamer: 'Keuken',
    waar: 'Op het aanrecht.',
    stappen: [
      'Zet het bord erin en doe de deur dicht.',
      'Draai de knop naar 2 minuten.',
      'Druk op start.',
      'Wacht tot het piept.',
    ],
  },
  {
    naam: 'Thermostaat',
    emoji: '🌡️',
    kamer: 'Woonkamer',
    waar: 'Aan de muur naast de deur.',
    stappen: [
      'Draai het wiel naar rechts voor warmer.',
      '20 graden is een goede temperatuur.',
      'Niet hoger dan 22 graden zetten.',
    ],
  },
  {
    naam: 'Telefoon',
    emoji: '☎️',
    kamer: 'Woonkamer',
    waar: 'Op het kastje naast de zetel.',
    stappen: ['Neem de hoorn van het toestel.', 'Druk op 1 om te bellen.'],
  },
  {
    naam: 'Medicatiedoos',
    emoji: '💊',
    kamer: 'Keuken',
    waar: 'In de kast boven de koffie.',
    stappen: [
      'Zoek het vakje van vandaag.',
      'Neem de pillen met een glas water.',
      'Vink af in de app.',
    ],
  },
  {
    naam: 'Bril',
    emoji: '👓',
    kamer: 'Slaapkamer',
    waar: 'Op het nachtkastje.',
    stappen: [
      'Kijk eerst op het nachtkastje.',
      'Anders: op de tafel in de woonkamer.',
      'Anders: bel je familie.',
    ],
  },
  {
    naam: 'Douche',
    emoji: '🚿',
    kamer: 'Badkamer',
    waar: 'De handdoeken liggen in de kast.',
    stappen: [
      'Draai de linkerkraan open voor warm water.',
      'Wacht tot het water warm is.',
      'De mat ligt klaar op de vloer.',
    ],
  },
]
