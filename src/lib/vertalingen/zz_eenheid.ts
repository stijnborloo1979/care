import type { Vertaling } from '../uiTaal'

/**
 * Laatst geladen (alfabetisch): waar twee onderdelen hetzelfde Nederlandse
 * woord anders vertaalden, geldt hier één keuze, zodat de app overal
 * dezelfde woorden gebruikt.
 */
export default {
  fr: {
    Goedenacht: 'Bonne nuit',
    'Dit is de tablet van de persoon': 'C’est la tablette de la personne',
    Verder: 'Continuer',
    'Er ging iets mis. Probeer het opnieuw.': 'Un problème est survenu. Veuillez réessayer.',
    'Koppelen lukte niet.': 'La liaison n’a pas fonctionné.',
    'Tablet koppelen': 'Associer la tablette',
    zorgverlener: 'soignant(e)',
    Medicatie: 'Médicaments',
    Weetjes: 'Bon à savoir',
    Indeling: 'Disposition',
    Instellingen: 'Paramètres',
    Vandaag: 'Aujourd’hui',
    vandaag: 'aujourd’hui',
    'Foto’s met een jaartal en het verhaal erbij.': 'Des photos avec une année et l’histoire qui les accompagne.',
    'Uitnodiging maken': 'Créer l’invitation',
    Beheerder: 'Gestionnaire',
    Noodtoegang: 'Accès d’urgence',
    Gestopt: 'Arrêté',
    Woonzorgcentrum: 'Maison de repos et de soins',
    'Verwijderen lukte niet.': 'La suppression n’a pas abouti.',
    'Dit ben ik': 'Qui je suis',
    'Zo praat je best met mij': 'Comment me parler au mieux',
    'Als ik onrustig ben, helpt dit': 'Quand je suis agité(e), ceci m’aide',
    'Wat ik graag heb': 'Ce que j’aime',
    'Opslaan lukte niet.': 'L’enregistrement n’a pas abouti.',
    Actief: 'Actif',
    'Nog niets in deze categorie.': 'Rien dans cette catégorie pour l’instant.',
    Bewoner: 'Résident(e)',
    'Een collega': 'Un(e) collègue',
    'Een woonzorgcentrum registreren': 'Inscrire une maison de repos',
  },
  en: {
    Goedenacht: 'Good night',
    Terug: 'Back',
    Verder: 'Continue',
    Uitloggen: 'Sign out',
    'Tablet koppelen': 'Pair the tablet',
    'Deze code kennen we niet. Kijk ze na of vraag ze opnieuw aan het woonzorgcentrum.':
      'We don’t recognise this code. Check it or ask the care home for it again.',
    'Naar het woonzorgcentrum': 'Go to the care home',
    Analyse: 'Insights',
    'Dat lukte niet.': 'That didn’t work.',
    'Verwijderen lukte niet.': 'Deleting didn’t work.',
    'Zo praat je best met mij': 'The best way to talk to me',
    'Als ik onrustig ben, helpt dit': 'When I’m restless, this helps',
    'Wie bij mij hoort': 'The people who belong with me',
    'Opslaan lukte niet.': 'Saving didn’t work.',
  },
} satisfies Vertaling
