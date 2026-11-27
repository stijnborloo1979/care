import type { Vertaling } from '../uiTaal'

/** De tablet ontkoppelen (Instellingen → Tablet koppelen, en Delen). */
export default {
  fr: {
    'Er is een tablet gekoppeld.': 'Une tablette est associée.',
    'Kwijt, stuk of weggegeven? Ontkoppel hem hier. Elk toestel dat als {naam} aangemeld is, wordt afgemeld.':
      'Perdue, cassée ou donnée ? Dissociez-la ici. Chaque appareil connecté en tant que {naam} sera déconnecté.',
    'De tablet van {naam} ontkoppelen? Daarna toont hij niets meer tot je hem opnieuw koppelt.':
      'Dissocier la tablette de {naam} ? Elle n’affichera plus rien jusqu’à ce que vous l’associiez à nouveau.',
    'Tablet ontkoppelen': 'Dissocier la tablette',
    'Alleen de familiebeheerder kan de tablet ontkoppelen.': 'Seul l’administrateur de la famille peut dissocier la tablette.',
    'Ontkoppeld. Het staat in het zorglogboek.': 'Dissociée. C’est noté dans le journal de soins.',
    'Ontkoppelen lukte niet.': 'La dissociation a échoué.',
    Ontkoppelen: 'Dissocier',
  },
  en: {
    'Er is een tablet gekoppeld.': 'A tablet is paired.',
    'Kwijt, stuk of weggegeven? Ontkoppel hem hier. Elk toestel dat als {naam} aangemeld is, wordt afgemeld.':
      'Lost, broken or given away? Unpair it here. Every device signed in as {naam} will be signed out.',
    'De tablet van {naam} ontkoppelen? Daarna toont hij niets meer tot je hem opnieuw koppelt.':
      'Unpair {naam}’s tablet? It will show nothing until you pair it again.',
    'Tablet ontkoppelen': 'Unpair tablet',
    'Alleen de familiebeheerder kan de tablet ontkoppelen.': 'Only the family admin can unpair the tablet.',
    'Ontkoppeld. Het staat in het zorglogboek.': 'Unpaired. It is noted in the care log.',
    'Ontkoppelen lukte niet.': 'Unpairing failed.',
    Ontkoppelen: 'Unpair',
  },
} satisfies Vertaling
