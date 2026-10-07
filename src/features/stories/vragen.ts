import { taal, type Taal } from '../../lib/i18n'

/**
 * Vragen voor "Vertel eens". Bewust open, warm en over wat iemand deed of
 * graag had — niet over wat hij kwijt is. Geen quizvragen met een juist
 * antwoord: er is niets om fout te doen.
 */
export const VRAGEN: string[] = [
  'Waar ben je opgegroeid? Hoe zag het huis eruit?',
  'Wat was je lievelingsspel als kind?',
  'Wie was je beste vriend of vriendin op school?',
  'Wat at je het liefst toen je klein was?',
  'Hoe was de straat waar je woonde als kind?',
  'Welke juf of meester herinner je je nog?',
  'Wat deed je op zondag toen je jong was?',
  'Wat was je eerste werk?',
  'Waar was je trots op in je werk?',
  'Wie was de beste collega die je ooit had?',
  'Hoe heb je je partner leren kennen?',
  'Hoe verliep jullie trouwdag?',
  'Waar gingen jullie naartoe op jullie eerste uitstap samen?',
  'Wat was je eerste auto, of je eerste fiets?',
  'Welke reis is je het meest bijgebleven?',
  'Waar ging je het liefst op vakantie?',
  'Welk lied doet je altijd aan vroeger denken?',
  'Naar welke muziek luisterde je toen je twintig was?',
  'Ging je vroeger graag dansen? Waar?',
  'Welk feest vierde je het liefst?',
  'Hoe vierde je familie Kerstmis of Nieuwjaar?',
  'Wat was een typisch gerecht in jullie gezin?',
  'Welk recept kan je nog altijd uit je hoofd?',
  'Had je vroeger huisdieren? Hoe heetten ze?',
  'Wat deed je graag in je vrije tijd?',
  'Welke hobby zou je iedereen aanraden?',
  'Wat is de mooiste plek die je ooit gezien hebt?',
  'Hoe was het toen je eerste kind geboren werd?',
  'Wat deed je graag samen met je kinderen?',
  'Welke grappige gebeurtenis in de familie vertel je graag?',
  'Welk huis waar je gewoond hebt, vond je het fijnst? Waarom?',
  'Wat was er vroeger in je buurt, dat er nu niet meer is?',
  'Welke winkel ging je vroeger graag naartoe?',
  'Welke film of welk programma keek je graag?',
  'Welk boek of welk verhaal is je bijgebleven?',
  'Wat heb je van je moeder geleerd?',
  'Wat heb je van je vader geleerd?',
  'Welke raad zou je aan je jongere zelf geven?',
  'Waar ben je in je leven het meest dankbaar voor?',
  'Wat maakt een dag voor jou een goede dag?',
  'Welk seizoen vind je het mooist? Waarom?',
  'Wat deed je graag in de tuin of buiten?',
  'Welke sport deed of volgde je graag?',
  'Welke uitvinding vond je destijds het indrukwekkendst?',
  'Hoe klonk de telefoon bij jullie thuis vroeger, en wie belde er?',
  'Wat was je lievelingskleur, en is dat nog zo?',
  'Welk cadeau is je altijd bijgebleven?',
  'Wie heeft je leven het meest beïnvloed?',
  'Welk klein ritueel maakt jou gelukkig?',
  'Wat wil je dat je kleinkinderen over jou weten?',
]

// Dezelfde vragen, in dezelfde volgorde: vraag i in het Frans is vraag i in
// het Nederlands. Zo krijgt elke taal op dezelfde dag dezelfde vraag, en telt
// een vraag die in het Nederlands beantwoord is ook in het Frans als beantwoord.
const VRAGEN_FR: string[] = [
  "Où avez-vous grandi ? À quoi ressemblait la maison ?",
  "Quel était votre jeu préféré quand vous étiez enfant ?",
  "Qui était votre meilleur ami ou meilleure amie à l'école ?",
  "Que préfériez-vous manger quand vous étiez petit ?",
  "Comment était la rue où vous habitiez enfant ?",
  "De quelle institutrice ou de quel instituteur vous souvenez-vous encore ?",
  "Que faisiez-vous le dimanche quand vous étiez jeune ?",
  "Quel a été votre premier travail ?",
  "De quoi étiez-vous fier dans votre travail ?",
  "Qui était le meilleur collègue que vous ayez eu ?",
  "Comment avez-vous rencontré votre partenaire ?",
  "Comment s'est passé votre jour de mariage ?",
  "Où êtes-vous allés lors de votre première sortie ensemble ?",
  "Quelle a été votre première voiture, ou votre premier vélo ?",
  "Quel voyage vous a le plus marqué ?",
  "Où aimiez-vous le plus partir en vacances ?",
  "Quelle chanson vous fait toujours penser à autrefois ?",
  "Quelle musique écoutiez-vous à vingt ans ?",
  "Aimiez-vous aller danser autrefois ? Où ?",
  "Quelle fête préfériez-vous célébrer ?",
  "Comment votre famille fêtait-elle Noël ou le Nouvel An ?",
  "Quel était un plat typique dans votre famille ?",
  "Quelle recette connaissez-vous encore par cœur ?",
  "Aviez-vous des animaux autrefois ? Comment s'appelaient-ils ?",
  "Qu'aimiez-vous faire pendant votre temps libre ?",
  "Quel loisir recommanderiez-vous à tout le monde ?",
  "Quel est le plus bel endroit que vous ayez jamais vu ?",
  "Comment c'était quand votre premier enfant est né ?",
  "Qu'aimiez-vous faire avec vos enfants ?",
  "Quelle anecdote drôle de la famille aimez-vous raconter ?",
  "Dans quelle maison avez-vous préféré vivre ? Pourquoi ?",
  "Qu'y avait-il autrefois dans votre quartier qui n'existe plus aujourd'hui ?",
  "Dans quel magasin aimiez-vous aller autrefois ?",
  "Quel film ou quelle émission aimiez-vous regarder ?",
  "Quel livre ou quelle histoire vous a marqué ?",
  "Qu'avez-vous appris de votre mère ?",
  "Qu'avez-vous appris de votre père ?",
  "Quel conseil donneriez-vous à votre jeune vous ?",
  "De quoi êtes-vous le plus reconnaissant dans votre vie ?",
  "Qu'est-ce qui fait d'une journée une bonne journée pour vous ?",
  "Quelle saison trouvez-vous la plus belle ? Pourquoi ?",
  "Qu'aimiez-vous faire au jardin ou dehors ?",
  "Quel sport pratiquiez-vous ou suiviez-vous volontiers ?",
  "Quelle invention vous a le plus impressionné à l'époque ?",
  "Comment sonnait le téléphone chez vous autrefois, et qui appelait ?",
  "Quelle était votre couleur préférée, et l'est-elle toujours ?",
  "Quel cadeau vous est toujours resté en mémoire ?",
  "Qui a le plus influencé votre vie ?",
  "Quel petit rituel vous rend heureux ?",
  "Que voulez-vous que vos petits-enfants sachent de vous ?",
]

const VRAGEN_EN: string[] = [
  "Where did you grow up? What was the house like?",
  "What was your favourite game as a child?",
  "Who was your best friend at school?",
  "What did you like to eat most when you were little?",
  "What was the street like where you lived as a child?",
  "Which teacher do you still remember?",
  "What did you do on Sundays when you were young?",
  "What was your first job?",
  "What were you proud of in your work?",
  "Who was the best colleague you ever had?",
  "How did you meet your partner?",
  "How did your wedding day go?",
  "Where did you go on your first outing together?",
  "What was your first car, or your first bike?",
  "Which trip has stayed with you the most?",
  "Where did you most like to go on holiday?",
  "Which song always makes you think of the old days?",
  "What music did you listen to when you were twenty?",
  "Did you like to go dancing? Where?",
  "Which celebration did you enjoy most?",
  "How did your family celebrate Christmas or New Year?",
  "What was a typical dish in your family?",
  "Which recipe do you still know by heart?",
  "Did you have pets? What were they called?",
  "What did you like to do in your free time?",
  "Which hobby would you recommend to everyone?",
  "What is the most beautiful place you have ever seen?",
  "What was it like when your first child was born?",
  "What did you like to do with your children?",
  "Which funny family story do you like to tell?",
  "Which house you lived in did you like best? Why?",
  "What used to be in your neighbourhood that is no longer there?",
  "Which shop did you like to go to?",
  "Which film or programme did you like to watch?",
  "Which book or story has stayed with you?",
  "What did you learn from your mother?",
  "What did you learn from your father?",
  "What advice would you give your younger self?",
  "What are you most grateful for in your life?",
  "What makes a day a good day for you?",
  "Which season do you find the most beautiful? Why?",
  "What did you like to do in the garden or outdoors?",
  "Which sport did you play or follow?",
  "Which invention impressed you most at the time?",
  "What did the telephone sound like at home, and who used to call?",
  "What was your favourite colour, and is it still?",
  "Which present has always stayed with you?",
  "Who has influenced your life the most?",
  "Which small ritual makes you happy?",
  "What would you like your grandchildren to know about you?",
]

export const VRAGEN_PER_TAAL: Record<Taal, string[]> = { nl: VRAGEN, fr: VRAGEN_FR, en: VRAGEN_EN }

/** De Nederlandse vorm van een vraag uit eender welke taal; een onbekende vraag blijft zichzelf. */
export function inHetNederlands(vraag: string): string {
  for (const lijst of [VRAGEN_FR, VRAGEN_EN]) {
    const i = lijst.indexOf(vraag)
    if (i >= 0) return VRAGEN[i]
  }
  return vraag
}

/** Een eenvoudige, stabiele getalwaarde voor een datum (JJJJ-MM-DD). */
function dagnummer(sleutel: string): number {
  const [j, m, d] = sleutel.split('-').map(Number)
  return Math.floor(Date.UTC(j, m - 1, d) / 86_400_000)
}

/**
 * De vraag van vandaag. Elke dag dezelfde vraag, op elk toestel, zolang ze
 * nog niet beantwoord is. "Andere vraag" schuift door naar de volgende
 * onbeantwoorde, zonder dat de persoon het gevoel krijgt iets te missen.
 */
export function vraagVanVandaag(
  dag: string,
  beantwoord: Set<string>,
  overslaan = 0,
  lijst?: string[],
): string | null {
  // Zonder eigen lijst: de vragen in de taal van het huishouden, en een
  // vraag telt als beantwoord in welke taal ze ook beantwoord werd.
  const vragen = lijst ?? VRAGEN_PER_TAAL[taal()] ?? VRAGEN
  const alInHetNl = lijst ? null : new Set([...beantwoord].map(inHetNederlands))
  const open = vragen.filter((v, i) => !beantwoord.has(v) && !(alInHetNl && alInHetNl.has(VRAGEN[i])))
  if (open.length === 0) return null
  const start = dagnummer(dag) % open.length
  return open[(start + overslaan) % open.length]
}
