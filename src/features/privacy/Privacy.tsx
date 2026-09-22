import { Link } from 'react-router-dom'

/**
 * De privacyverklaring, in gewone taal. Bewust zonder juridisch jargon:
 * wie deze app gebruikt, moet kunnen begrijpen wat er met zijn gegevens
 * gebeurt. Laat de tekst nalezen door een jurist voor je het product
 * verkoopt; dit is een eerlijke beschrijving, geen juridisch advies.
 */
const BLOKKEN: { titel: string; tekst: string[] }[] = [
  {
    titel: 'Wat Thuis bewaart',
    tekst: [
      'Je naam en e-mailadres, om in te loggen.',
      'Wat jij of je familie invult: de agenda, routines, mensen, dingen in huis, foto’s, verhalen, weetjes en berichten.',
      'Medicatie en het zorglogboek, als die gebruikt worden. Dat zijn gezondheidsgegevens, en die krijgen extra bescherming.',
      'Je locatie, alleen als je daar uitdrukkelijk toestemming voor gaf.',
    ],
  },
  {
    titel: 'Waarom',
    tekst: [
      'Alleen om de app te laten werken: je dag tonen, je helpen onthouden, en je familie laten meehelpen voor zover jij dat toelaat.',
      'Niet voor reclame. Er worden geen gegevens verkocht of gedeeld met adverteerders.',
    ],
  },
  {
    titel: 'Wie het kan zien',
    tekst: [
      'Alleen de mensen die jij of je familiebeheerder uitnodigde, en alleen wat bij hun rol past.',
      'In de zelfstandige fase ziet familie je medicatie, logboek, notities en locatie niet. Onder "Wie ziet wat" zie je altijd wie er meekijkt.',
      'Zorgverleners zien geen documenten.',
    ],
  },
  {
    titel: 'Waar het staat',
    tekst: [
      'In een database bij Supabase, in een datacenter in de Europese Unie.',
      'Foto’s en documenten staan in afgeschermde opslag; een link ernaartoe werkt maar even.',
      'Videogesprekken gaan rechtstreeks van toestel naar toestel, versleuteld. Er wordt geen beeld of geluid bewaard.',
    ],
  },
  {
    titel: 'Hoe lang',
    tekst: [
      'Locatiegegevens: zeven dagen.',
      'Berichten aan de persoon: verdwijnen van het scherm na twee dagen, en worden daarna gewist.',
      'Al het andere: tot je het zelf verwijdert, of tot je je account verwijdert.',
    ],
  },
  {
    titel: 'Jouw rechten',
    tekst: [
      'Je kan al je gegevens downloaden, onder Instellingen → Mijn gegevens.',
      'Je kan je account verwijderen, op dezelfde plek. Wat alleen over jou gaat, verdwijnt mee.',
      'Je kan toestemming voor locatie altijd weer intrekken.',
      'Heb je een vraag of een klacht, dan kan je ook terecht bij de Gegevensbeschermingsautoriteit.',
    ],
  },
]

export default function Privacy() {
  return (
    <main className="mx-auto max-w-[40rem] px-5 py-10">
      <Link to="/" className="font-semibold text-accent-ink underline underline-offset-4">
        ‹ Terug
      </Link>
      <h1 className="mt-4 text-[2rem] font-extrabold leading-tight tracking-tight">Privacy</h1>
      <p className="mt-2 text-lg text-ink-soft">
        Wat Thuis bewaart, waarom, en wat je ermee kan. In gewone taal.
      </p>

      <div className="mt-8 space-y-6">
        {BLOKKEN.map((b) => (
          <section key={b.titel} className="rounded-card bg-surface p-6 shadow-card">
            <h2 className="text-lg font-bold">{b.titel}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-soft">
              {b.tekst.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
