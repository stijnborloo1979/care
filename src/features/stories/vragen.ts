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
  lijst: string[] = VRAGEN,
): string | null {
  const open = lijst.filter((v) => !beantwoord.has(v))
  if (open.length === 0) return null
  const start = dagnummer(dag) % open.length
  return open[(start + overslaan) % open.length]
}
