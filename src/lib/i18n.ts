/**
 * Taal in Thuis.
 *
 * Geen bibliotheek: een woordenboek per taal en één functie t(). De app is
 * klein genoeg, en zo blijft de bundel klein voor een tablet op hikkende
 * wifi.
 *
 * De taal staat bij de weergave-instellingen, dus op het huishouden: zo
 * stelt familie ze van op afstand in en volgt de tablet. Ze bepaalt drie
 * dingen tegelijk: de teksten hieronder, de locale voor datums en uren,
 * en de taal van de stem — voorlezen en verstaan.
 *
 * Een ontbrekende vertaling valt terug op het Nederlands. Beter een zin
 * in de verkeerde taal dan een lege knop.
 */

export type Taal = 'nl' | 'fr' | 'en'

export const TALEN: { code: Taal; naam: string }[] = [
  { code: 'nl', naam: 'Nederlands' },
  { code: 'fr', naam: 'Français' },
  { code: 'en', naam: 'English' },
]

/** Voor Intl en voor de stem. België als regio: dat klopt voor nl en fr. */
const LOCALES: Record<Taal, string> = {
  nl: 'nl-BE',
  fr: 'fr-BE',
  en: 'en-GB',
}

let huidige: Taal = 'nl'

export function isTaal(x: unknown): x is Taal {
  return x === 'nl' || x === 'fr' || x === 'en'
}

/**
 * Wordt gezet zodra de instellingen geladen zijn (zie useDisplayPrefs).
 *
 * Een onbekende taal wordt genegeerd in plaats van bewaard. Eén keer een
 * lege waarde hier — uit een oude cache, een half ingevulde instelling —
 * en élk scherm van de persoon viel om, want alles loopt via t().
 */
export function zetTaal(taal: Taal) {
  if (!isTaal(taal)) return
  huidige = taal
  // Ook bruikbaar buiten de browser (de tests draaien zonder document).
  if (typeof document !== 'undefined') document.documentElement.lang = taal
}

export function taal(): Taal {
  return huidige
}

export function locale(): string {
  return LOCALES[huidige] ?? LOCALES.nl
}

/** De taal van het toestel, als eerste gok bij een nieuw huishouden. */
export function taalVanToestel(): Taal {
  if (typeof navigator === 'undefined') return 'nl'
  const eerste = (navigator.languages?.[0] ?? navigator.language ?? 'nl').slice(0, 2)
  return eerste === 'fr' || eerste === 'en' ? eerste : 'nl'
}

type Woordenboek = Record<string, string>

const NL: Woordenboek = {
  // Navigatie
  'nav.vandaag': 'Vandaag',
  'nav.wie': 'Wie?',
  'nav.praten': 'Praten',
  'nav.inhuis': 'In huis',
  'nav.help': 'Help',

  // Vandaag
  'vandaag.nu': 'Nu',
  'vandaag.daarna': 'Daarna',
  'vandaag.vandaag': 'Vandaag',
  'vandaag.niets': 'Er staat nu niets gepland.',
  'vandaag.planningWeg': 'De planning is nu niet te zien. Probeer het zo opnieuw.',
  'vandaag.gelukt': 'Dat is gelukt',
  'vandaag.watnu': 'Wat nu?',
  'vandaag.familie': 'Familie',
  'vandaag.help': 'Help',
  'vandaag.om': 'om {tijd}',

  // Groeten
  'groet.nacht': 'Goedenacht',
  'groet.ochtend': 'Goedemorgen',
  'groet.middag': 'Goedemiddag',
  'groet.avond': 'Goedenavond',

  // Wat nu
  'watnu.titel': 'Wat moet ik nu doen?',
  'watnu.terug': 'Terug',

  // Nachtscherm
  'nacht.isNacht': 'Het is nacht',
  'nacht.tik': 'Tik om het gewone scherm te tonen.',

  // Oproep
  'oproep.beltOnder': 'belt je',
  'oproep.opnemen': 'Opnemen',
  'oproep.nunniet': 'Nu niet',
  'oproep.vanzelf': 'Het gesprek begint vanzelf over {seconden} seconden.',
  'oproep.wachten': 'Wachten',
  'oproep.geweigerd': '{naam} kan nu niet praten',
  'oproep.gemist': '{naam} nam niet op',
  'oproep.mislukt': 'Het gesprek lukte niet',
  'oproep.verbinden': 'Verbinden…',


  // Wat nu
  'watnu.hetIs': 'Het is {tijd}.',
  'watnu.laden': 'Bezig met laden…',
  'watnu.rusten': 'Even rusten',
  'watnu.nietsMoet': 'Er is nu niets dat moet. Straks is er weer iets.',
  'watnu.gedaan': 'Dit is gedaan',
  'watnu.hardop': 'Vraag het hardop',

  // Hulp
  'hulp.titel': 'Hulp',
  'hulp.kies': 'Kies wat je nodig hebt.',
  'hulp.bel': 'Bel {naam}',
  'hulp.vraagBel': 'Vraag of {naam} belt',
  'hulp.gevraagd': '{naam} weet het. Ze belt je zo terug.',
  'hulp.vraagBezig': 'Bezig…',
  'hulp.vraagMislukt': 'Dat lukte nu niet. Probeer het straks nog eens.',
  'hulp.waarBenIk': 'Waar ben ik?',
  'hulp.jeBentThuis': 'Je bent thuis. Blijf rustig zitten en bel iemand hierboven.',
  'hulp.noodnummer': 'Noodnummer 112',
  'hulp.noodUitleg': 'Bel 112 alleen bij dringende medische hulp, brand of gevaar.',

  // Wie is wie
  'wie.titel': 'Wie is wie?',
  'wie.tik': 'Tik op iemand om meer te zien.',
  'wie.familie': 'Familie',
  'wie.zorg': 'Zorg en buren',
  'wie.wegP': 'Deze persoon staat er niet meer bij.',

  // Onthoud dit
  'onthoud.titel': 'Onthoud dit',
  'onthoud.bewaard': 'Goed, dat onthoud ik.',
  'onthoud.magWeg': 'Dit mag weg',
  'onthoud.inspreken': 'Inspreken',
  'onthoud.voorbeeld': 'Mijn sleutels liggen in de inkomhal.',
  'onthoud.bezig': 'Bezig…',


  // Praten
  'praten.titel': 'Praat met mij',
  'praten.uitleg': 'Stel een vraag over vandaag of over je huis.',
  'praten.drukPraten': 'Druk om te praten',
  'praten.luister': 'Ik luister…',
  'praten.drukKnop': 'Druk op de knop en stel je vraag.',
  'praten.tikVraag': 'Tik hieronder een vraag aan.',
  'praten.kijkNa': 'Ik kijk het even na…',
  'praten.genoteerd': 'Genoteerd door je familie:',
  'praten.ofTik': 'Of tik een vraag aan',
  'praten.medicatieGenoteerd': 'Goed. Ik heb genoteerd dat je je medicatie genomen hebt.',
  'praten.weetIkNiet': 'Dat weet ik niet zeker',

  // In huis
  'huis.titel': 'In huis',
  'huis.uitleg': 'Waar dingen liggen en hoe ze werken.',
  'huis.familieVoegtToe': 'Familie kan ze toevoegen.',
  'huis.kamer': 'Kamer',
  'huis.leeg': 'Hier staat nog niets in.',
  'huis.dingWeg': 'Dit ding bestaat niet meer.',
  'huis.waar': 'Waar',
  'huis.stappen': 'Stap voor stap',

  // Foto's
  'fotos.titel': 'Foto’s',
  'fotos.uitleg': 'Je leven, op volgorde.',

  // Radio
  'radio.titel': 'Radio',
  'radio.geduld': 'Even geduld…',
  'radio.speelt': 'Nu aan het spelen',
  'radio.drukLuisteren': 'Druk om te luisteren',
  'radio.volume': 'Volume',

  // Weetjes
  'weetjes.titel': 'Weetjes',
  'weetjes.uitleg': 'Dingen die je familie voor je noteerde.',
  'weetjes.zoeken': 'Zoeken',
  'weetjes.nietsGevonden': 'Daar vind ik niets over.',
  'weetjes.leeg': 'Er staan nog geen weetjes.',

  'fotos.rustig': 'Rustig bekijken',
  'fotos.leeg': 'Er staan nog geen foto’s.',
  'radio.geenZenders': 'Er zijn nog geen zenders gekozen. Je familie kan ze instellen.',

  // Spraakassistent
  'ass.nietZeker': 'Dat weet ik niet zeker.',
  'ass.vraagFamilie': 'Wil je het aan je familie vragen?',
  'ass.bel': 'Bel {naam}',
  'ass.radioUit': 'De radio gaat uit.',
  'ass.geenZenders': 'Er zijn nog geen zenders gekozen.',
  'ass.vraagZenders': 'Vraag je familie om er een paar in te stellen.',
  'ass.speelt': '{zender} speelt.',
  'ass.lietOnthouden': 'Dit liet je onthouden',
  'ass.bronZelf': 'Onthouden door jou',
  'ass.nietsMoet': 'Er is nu niets dat moet.',
  'ass.daarna': 'Daarna: {wat} om {tijd}.',
  'ass.niemandLangs': 'Er komt vandaag niemand langs.',
  'ass.komtOm': '{naam} komt om {tijd}',
  'ass.nietGepland': '{naam} staat vandaag niet in de planning.',
  'ass.datZeiJe': 'Dat zei je {wanneer}.',
  'ass.normaalLigt': 'Normaal ligt het: {waar}',
  'ass.toonUitleg': 'Toon uitleg',
  'ass.stapVoorStap': 'Stap voor stap',
  'ass.meerOver': 'Meer over {naam}',
  'ass.geenMedicatie': 'Er staat vandaag geen medicatie in je planning.',
  'ass.nogNietNodig': 'Nog niet nodig.',
  'ass.volgendeMedicatie': 'Je volgende medicatie is om {tijd}.',
  'ass.jaGedaan': 'Ja, dat heb je gedaan.',
  'ass.medicatieGenomen': 'Je medicatie van {tijd} is genomen, {wanneer}.',
  'ass.nogNiet': 'Nog niet.',
  'ass.medicatieOpen': 'Je medicatie van {tijden} staat nog niet als genomen.',
  'ass.isAfgevinkt': '{wat} is afgevinkt, {wanneer}.',
  'ass.staatGepland': '{wat} staat gepland om {tijd}.',
  'ass.nogNietGedaan': 'Dat staat nog niet als gedaan.',
  'ass.wasGepland': '{wat} was gepland om {tijd}.',
  'ass.vandaagOm': 'vandaag om {tijd}',
  'ass.gisterenOm': 'gisteren om {tijd}',
  'ass.opDatum': 'op {datum}',
  'ass.enTussen': ' en ',

  // Instellingen
  'instellingen.taal': 'Taal',
  'instellingen.taalOnder': 'Geldt voor de schermen, de datums en de stem.',
}

const FR: Woordenboek = {
  'nav.vandaag': "Aujourd'hui",
  'nav.wie': 'Qui ?',
  'nav.praten': 'Parler',
  'nav.inhuis': 'Chez moi',
  'nav.help': 'Aide',

  'vandaag.nu': 'Maintenant',
  'vandaag.daarna': 'Ensuite',
  'vandaag.vandaag': "Aujourd'hui",
  'vandaag.niets': "Rien n'est prévu pour le moment.",
  'vandaag.planningWeg': "Le programme n'est pas visible. Réessayez dans un instant.",
  'vandaag.gelukt': "C'est fait",
  'vandaag.watnu': 'Et maintenant ?',
  'vandaag.familie': 'Famille',
  'vandaag.help': 'Aide',
  'vandaag.om': 'à {tijd}',

  'groet.nacht': 'Bonne nuit',
  'groet.ochtend': 'Bonjour',
  'groet.middag': 'Bonjour',
  'groet.avond': 'Bonsoir',

  'watnu.titel': 'Que dois-je faire maintenant ?',
  'watnu.terug': 'Retour',

  'nacht.isNacht': "C'est la nuit",
  'nacht.tik': "Touchez l'écran pour revenir.",

  'oproep.beltOnder': 'vous appelle',
  'oproep.opnemen': 'Répondre',
  'oproep.nunniet': 'Pas maintenant',
  'oproep.vanzelf': "L'appel commence dans {seconden} secondes.",
  'oproep.wachten': 'Attendre',
  'oproep.geweigerd': '{naam} ne peut pas parler maintenant',
  'oproep.gemist': "{naam} n'a pas répondu",
  'oproep.mislukt': "L'appel n'a pas abouti",
  'oproep.verbinden': 'Connexion…',


  'watnu.hetIs': 'Il est {tijd}.',
  'watnu.laden': 'Chargement…',
  'watnu.rusten': 'Un moment de repos',
  'watnu.nietsMoet': "Rien ne doit être fait maintenant. Il y aura autre chose plus tard.",
  'watnu.gedaan': "C'est fait",
  'watnu.hardop': 'Posez la question à voix haute',

  'hulp.titel': 'Aide',
  'hulp.kies': 'Choisissez ce dont vous avez besoin.',
  'hulp.bel': 'Appeler {naam}',
  'hulp.vraagBel': 'Demander à {naam} de rappeler',
  'hulp.gevraagd': '{naam} est prévenu. On vous rappelle bientôt.',
  'hulp.vraagBezig': 'Un instant…',
  'hulp.vraagMislukt': "Cela n'a pas fonctionné. Réessayez plus tard.",
  'hulp.waarBenIk': 'Où suis-je ?',
  'hulp.jeBentThuis': "Vous êtes chez vous. Restez tranquillement assis et appelez quelqu'un ci-dessus.",
  'hulp.noodnummer': "Numéro d'urgence 112",
  'hulp.noodUitleg': "N'appelez le 112 qu'en cas d'urgence médicale, d'incendie ou de danger.",

  'wie.titel': 'Qui est qui ?',
  'wie.tik': 'Touchez une personne pour en voir plus.',
  'wie.familie': 'Famille',
  'wie.zorg': 'Soins et voisins',
  'wie.wegP': "Cette personne n'est plus dans la liste.",

  'onthoud.titel': 'Retenir ceci',
  'onthoud.bewaard': "C'est noté.",
  'onthoud.magWeg': 'Effacer',
  'onthoud.inspreken': 'Dicter',
  'onthoud.voorbeeld': "Mes clés sont dans le hall d'entrée.",
  'onthoud.bezig': 'En cours…',

  'praten.titel': 'Parlez-moi',
  'praten.uitleg': "Posez une question sur aujourd'hui ou sur votre maison.",
  'praten.drukPraten': 'Appuyez pour parler',
  'praten.luister': "J'écoute…",
  'praten.drukKnop': 'Appuyez sur le bouton et posez votre question.',
  'praten.tikVraag': 'Touchez une question ci-dessous.',
  'praten.kijkNa': 'Je vérifie…',
  'praten.genoteerd': 'Noté par votre famille :',
  'praten.ofTik': 'Ou touchez une question',
  'praten.medicatieGenoteerd': "C'est noté : vous avez pris vos médicaments.",
  'praten.weetIkNiet': "Je n'en suis pas sûr",

  'huis.titel': 'Chez moi',
  'huis.uitleg': 'Où se trouvent les choses et comment elles fonctionnent.',
  'huis.familieVoegtToe': 'Votre famille peut les ajouter.',
  'huis.kamer': 'Pièce',
  'huis.leeg': "Il n'y a encore rien ici.",
  'huis.dingWeg': "Cet objet n'existe plus.",
  'huis.waar': 'Où',
  'huis.stappen': 'Étape par étape',

  'fotos.titel': 'Photos',
  'fotos.uitleg': 'Votre vie, dans l’ordre.',

  'radio.titel': 'Radio',
  'radio.geduld': 'Un instant…',
  'radio.speelt': 'En cours de lecture',
  'radio.drukLuisteren': 'Appuyez pour écouter',
  'radio.volume': 'Volume',

  'weetjes.titel': 'Notes',
  'weetjes.uitleg': 'Ce que votre famille a noté pour vous.',
  'weetjes.zoeken': 'Rechercher',
  'weetjes.nietsGevonden': 'Je ne trouve rien à ce sujet.',
  'weetjes.leeg': "Il n'y a pas encore de notes.",
  'fotos.rustig': 'Regarder tranquillement',
  'fotos.leeg': 'Il n’y a pas encore de photos.',
  'radio.geenZenders': 'Aucune station choisie. Votre famille peut les régler.',

  'ass.nietZeker': "Je n'en suis pas sûr.",
  'ass.vraagFamilie': 'Voulez-vous le demander à votre famille ?',
  'ass.bel': 'Appeler {naam}',
  'ass.radioUit': "La radio s'éteint.",
  'ass.geenZenders': "Aucune station n'a encore été choisie.",
  'ass.vraagZenders': "Demandez à votre famille d'en régler quelques-unes.",
  'ass.speelt': '{zender} joue.',
  'ass.lietOnthouden': 'Voici ce que vous vouliez retenir',
  'ass.bronZelf': 'Noté par vous',
  'ass.nietsMoet': "Il n'y a rien à faire maintenant.",
  'ass.daarna': 'Ensuite : {wat} à {tijd}.',
  'ass.niemandLangs': "Personne ne passe aujourd'hui.",
  'ass.komtOm': '{naam} vient à {tijd}',
  'ass.nietGepland': "{naam} n'est pas prévu aujourd'hui.",
  'ass.datZeiJe': 'Vous me l’avez dit {wanneer}.',
  'ass.normaalLigt': "D'habitude, c'est ici : {waar}",
  'ass.toonUitleg': 'Voir les explications',
  'ass.stapVoorStap': 'Étape par étape',
  'ass.meerOver': 'En savoir plus sur {naam}',
  'ass.geenMedicatie': "Aucun médicament n'est prévu aujourd'hui.",
  'ass.nogNietNodig': 'Pas encore nécessaire.',
  'ass.volgendeMedicatie': 'Votre prochain médicament est à {tijd}.',
  'ass.jaGedaan': 'Oui, vous l’avez fait.',
  'ass.medicatieGenomen': 'Votre médicament de {tijd} a été pris, {wanneer}.',
  'ass.nogNiet': 'Pas encore.',
  'ass.medicatieOpen': "Votre médicament de {tijden} n'est pas encore noté comme pris.",
  'ass.isAfgevinkt': '{wat} est coché, {wanneer}.',
  'ass.staatGepland': '{wat} est prévu à {tijd}.',
  'ass.nogNietGedaan': "Ce n'est pas encore noté comme fait.",
  'ass.wasGepland': '{wat} était prévu à {tijd}.',
  'ass.vandaagOm': "aujourd'hui à {tijd}",
  'ass.gisterenOm': 'hier à {tijd}',
  'ass.opDatum': 'le {datum}',
  'ass.enTussen': ' et ',
  'instellingen.taal': 'Langue',
  'instellingen.taalOnder': "S'applique aux écrans, aux dates et à la voix.",
}

const EN: Woordenboek = {
  'nav.vandaag': 'Today',
  'nav.wie': 'Who?',
  'nav.praten': 'Talk',
  'nav.inhuis': 'At home',
  'nav.help': 'Help',

  'vandaag.nu': 'Now',
  'vandaag.daarna': 'Next',
  'vandaag.vandaag': 'Today',
  'vandaag.niets': 'Nothing is planned right now.',
  'vandaag.planningWeg': "The plan can't be shown right now. Try again in a moment.",
  'vandaag.gelukt': 'Done',
  'vandaag.watnu': 'What now?',
  'vandaag.familie': 'Family',
  'vandaag.help': 'Help',
  'vandaag.om': 'at {tijd}',

  'groet.nacht': 'Good night',
  'groet.ochtend': 'Good morning',
  'groet.middag': 'Good afternoon',
  'groet.avond': 'Good evening',

  'watnu.titel': 'What should I do now?',
  'watnu.terug': 'Back',

  'nacht.isNacht': "It's night",
  'nacht.tik': 'Tap to show the normal screen.',

  'oproep.beltOnder': 'is calling you',
  'oproep.opnemen': 'Answer',
  'oproep.nunniet': 'Not now',
  'oproep.vanzelf': 'The call starts by itself in {seconden} seconds.',
  'oproep.wachten': 'Wait',
  'oproep.geweigerd': "{naam} can't talk right now",
  'oproep.gemist': "{naam} didn't answer",
  'oproep.mislukt': "The call didn't go through",
  'oproep.verbinden': 'Connecting…',


  'watnu.hetIs': "It's {tijd}.",
  'watnu.laden': 'Loading…',
  'watnu.rusten': 'Time to rest',
  'watnu.nietsMoet': 'Nothing needs doing right now. There will be something later.',
  'watnu.gedaan': 'This is done',
  'watnu.hardop': 'Ask out loud',

  'hulp.titel': 'Help',
  'hulp.kies': 'Choose what you need.',
  'hulp.bel': 'Call {naam}',
  'hulp.vraagBel': 'Ask {naam} to call',
  'hulp.gevraagd': '{naam} knows. They will call you back soon.',
  'hulp.vraagBezig': 'One moment…',
  'hulp.vraagMislukt': 'That did not work. Please try again later.',
  'hulp.waarBenIk': 'Where am I?',
  'hulp.jeBentThuis': 'You are at home. Sit down calmly and call someone above.',
  'hulp.noodnummer': 'Emergency number 112',
  'hulp.noodUitleg': 'Only call 112 for urgent medical help, fire or danger.',

  'wie.titel': 'Who is who?',
  'wie.tik': 'Tap someone to see more.',
  'wie.familie': 'Family',
  'wie.zorg': 'Care and neighbours',
  'wie.wegP': 'This person is no longer in the list.',

  'onthoud.titel': 'Remember this',
  'onthoud.bewaard': "Good, I'll remember that.",
  'onthoud.magWeg': 'Delete this',
  'onthoud.inspreken': 'Dictate',
  'onthoud.voorbeeld': 'My keys are in the hallway.',
  'onthoud.bezig': 'Working…',

  'praten.titel': 'Talk to me',
  'praten.uitleg': 'Ask a question about today or about your home.',
  'praten.drukPraten': 'Press to talk',
  'praten.luister': "I'm listening…",
  'praten.drukKnop': 'Press the button and ask your question.',
  'praten.tikVraag': 'Tap a question below.',
  'praten.kijkNa': 'Let me check…',
  'praten.genoteerd': 'Noted by your family:',
  'praten.ofTik': 'Or tap a question',
  'praten.medicatieGenoteerd': "Good. I've noted that you took your medication.",
  'praten.weetIkNiet': "I'm not sure about that",

  'huis.titel': 'At home',
  'huis.uitleg': 'Where things are and how they work.',
  'huis.familieVoegtToe': 'Your family can add them.',
  'huis.kamer': 'Room',
  'huis.leeg': 'Nothing here yet.',
  'huis.dingWeg': 'This thing no longer exists.',
  'huis.waar': 'Where',
  'huis.stappen': 'Step by step',

  'fotos.titel': 'Photos',
  'fotos.uitleg': 'Your life, in order.',

  'radio.titel': 'Radio',
  'radio.geduld': 'One moment…',
  'radio.speelt': 'Now playing',
  'radio.drukLuisteren': 'Press to listen',
  'radio.volume': 'Volume',

  'weetjes.titel': 'Notes',
  'weetjes.uitleg': 'Things your family wrote down for you.',
  'weetjes.zoeken': 'Search',
  'weetjes.nietsGevonden': "I can't find anything about that.",
  'weetjes.leeg': 'There are no notes yet.',
  'fotos.rustig': 'View calmly',
  'fotos.leeg': 'There are no photos yet.',
  'radio.geenZenders': 'No stations chosen yet. Your family can set them.',

  'ass.nietZeker': "I'm not sure about that.",
  'ass.vraagFamilie': 'Would you like to ask your family?',
  'ass.bel': 'Call {naam}',
  'ass.radioUit': 'The radio is going off.',
  'ass.geenZenders': 'No stations have been chosen yet.',
  'ass.vraagZenders': 'Ask your family to set a few.',
  'ass.speelt': '{zender} is playing.',
  'ass.lietOnthouden': 'This is what you wanted to remember',
  'ass.bronZelf': 'Noted by you',
  'ass.nietsMoet': 'There is nothing to do right now.',
  'ass.daarna': 'Next: {wat} at {tijd}.',
  'ass.niemandLangs': 'Nobody is coming by today.',
  'ass.komtOm': '{naam} is coming at {tijd}',
  'ass.nietGepland': '{naam} is not in the plan for today.',
  'ass.datZeiJe': 'You told me {wanneer}.',
  'ass.normaalLigt': 'It normally belongs here: {waar}',
  'ass.toonUitleg': 'Show the explanation',
  'ass.stapVoorStap': 'Step by step',
  'ass.meerOver': 'More about {naam}',
  'ass.geenMedicatie': 'There is no medication planned today.',
  'ass.nogNietNodig': 'Not needed yet.',
  'ass.volgendeMedicatie': 'Your next medication is at {tijd}.',
  'ass.jaGedaan': 'Yes, you did that.',
  'ass.medicatieGenomen': 'Your medication of {tijd} was taken, {wanneer}.',
  'ass.nogNiet': 'Not yet.',
  'ass.medicatieOpen': 'Your medication of {tijden} is not noted as taken yet.',
  'ass.isAfgevinkt': '{wat} is ticked off, {wanneer}.',
  'ass.staatGepland': '{wat} is planned at {tijd}.',
  'ass.nogNietGedaan': 'That is not noted as done yet.',
  'ass.wasGepland': '{wat} was planned at {tijd}.',
  'ass.vandaagOm': 'today at {tijd}',
  'ass.gisterenOm': 'yesterday at {tijd}',
  'ass.opDatum': 'on {datum}',
  'ass.enTussen': ' and ',
  'instellingen.taal': 'Language',
  'instellingen.taalOnder': 'Applies to the screens, the dates and the voice.',
}

const WOORDENBOEKEN: Record<Taal, Woordenboek> = { nl: NL, fr: FR, en: EN }

/**
 * t('vandaag.om', { tijd: '14:00' }) → "om 14:00".
 *
 * Plaatshouders staan tussen accolades; zo blijft de volgorde van de
 * woorden vrij, en die verschilt per taal.
 */
export function t(sleutel: string, waarden?: Record<string, string | number>): string {
  // Elke stap valt terug in plaats van te falen, tot en met de sleutel
  // zelf. Deze functie draait op elk scherm van de persoon; gaat zij
  // stuk, dan is de app weg. Liever "nav.vandaag" op een knop dan een
  // foutmelding waar zij niets mee kan.
  const zin = (WOORDENBOEKEN[huidige] ?? NL)[sleutel] ?? NL[sleutel] ?? sleutel
  if (!waarden) return zin
  return zin.replace(/\{(\w+)\}/g, (heel, naam) => String(waarden[naam] ?? heel))
}
